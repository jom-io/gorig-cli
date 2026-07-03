import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ejs from 'ejs';
import { spawn } from 'child_process'; // 从 exec 改为 spawn
import { fileURLToPath } from 'url';
import readline from 'readline';
import semver from 'semver';  // 用于处理版本号
import { Command } from 'commander'; // 正确导入 Command
import yaml from 'js-yaml'; // 导入 js-yaml 用于解析 YAML

// 获取当前文件的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 格式化日期为 "YYYY-MM-DD HH:MM:SS"
 * @param {Date} date - 要格式化的日期对象
 * @returns {string} - 格式化后的日期字符串
 */
const formatDate = (date) => {
    const pad = (n) => n < 10 ? '0' + n : n;
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
        `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

/**
 * 提取路径参数，例如 "/user/get/:id" -> ["id"]
 */
const extractPathParams = (pathStr) => {
    const regex = /:([\w]+)/g;
    const params = [];
    let match;
    while ((match = regex.exec(pathStr)) !== null) {
        params.push(match[1]);
    }
    return params;
};

/**
 * 解析 router.go 获取路由信息
 */
const scanRouterFile = async (routerFilePath) => {
    try {
        const routerContent = await fs.readFile(routerFilePath, 'utf-8');
        const routeRegex = /(\w+)\.(GET|POST|PUT|DELETE)\("([^"]+)",\s*(\w+)\)/g;
        const routes = [];
        let match;
        while ((match = routeRegex.exec(routerContent)) !== null) {
            const method = match[2];
            const path = match[3];
            const handler = match[4];
            const pathParams = extractPathParams(path);
            routes.push({
                method,
                path,
                handler,
                pathParams
            });
        }
        return routes;
    } catch (error) {
        console.error(chalk.red(`Failed to read router file: ${routerFilePath}`), error);
        return [];
    }
};

/**
 * 解析结构体文件，提取带有 `form` 或 `json` 标签的字段
 * 支持递归解析嵌套的结构体
 * @param {string} structFilePath - 结构体文件路径
 * @param {string} structName - 结构体名称
 * @param {string} modelDir - 模型文件目录
 * @returns {Array} - 字段数组，包含 name, type
 */
const parseStructFields = async (structFilePath, structName, modelDir) => {
    try {
        const structContent = await fs.readFile(structFilePath, 'utf-8');
        // 修正正则表达式，确保能够匹配结构体内容
        const structRegex = new RegExp(`type\\s+${structName}\\s+struct\\s*{([\\s\\S]*?)}\\s*`, 'm');
        const match = structRegex.exec(structContent);
        if (!match) {
            console.warn(chalk.yellow(`Struct ${structName} definition not found`));
            return [];
        }
        const fieldsContent = match[1];
        const fields = [];
        const fieldRegex = /\s*(\w+)\s+([\w\.\*\[\]]+)\s+`[^`]*?(?:json|form):"([^"]+)"[^`]*`/g;
        let fieldMatch;
        while ((fieldMatch = fieldRegex.exec(fieldsContent)) !== null) {
            const fieldName = fieldMatch[1];
            const fieldType = fieldMatch[2];
            const tagName = fieldMatch[3];
            fields.push({
                name: tagName,
                type: fieldType
            });

            // 检查是否为嵌入的结构体，例如 model.UserD 或 req.UserReq
            if (fieldType.startsWith('model.') || fieldType.startsWith('req.')) {
                const embeddedStructName = fieldType.split('.')[1].replace('*', '');
                let embeddedStructFile = '';

                if (fieldType.startsWith('model.')) {
                    embeddedStructFile = path.join(modelDir, `${embeddedStructName.toLowerCase()}.go`);
                } else if (fieldType.startsWith('req.')) {
                    embeddedStructFile = structFilePath; // 如果是 req 包，使用同一个文件
                }

                // 解析嵌入的结构体
                if (await fs.pathExists(embeddedStructFile)) {
                    const embeddedFields = await parseStructFields(embeddedStructFile, embeddedStructName, modelDir);
                    fields.push(...embeddedFields);
                } else {
                    console.warn(chalk.yellow(`Embedded struct file not found: ${embeddedStructFile}`));
                }
            }
        }
        return fields;
    } catch (error) {
        console.error(chalk.red(`Failed to parse struct file: ${structFilePath}`), error);
        return [];
    }
};

/**
 * 解析 controller.go 获取方法中的参数
 */
const extractParamsFromController = async (controllerContent, reqDir, modelDir) => {
    const functionParams = {};
    // 正则表达式匹配处理函数
    const functionRegex = /func\s+(\w+)\s*\(ctx\s+\*gin\.Context\)\s*{([\s\S]*?)^}/gm;
    let funcMatch;
    while ((funcMatch = functionRegex.exec(controllerContent)) !== null) {
        const functionName = funcMatch[1];
        const functionBody = funcMatch[2];

        const params = [];
        let usesGetPageReq = false;

        // 建立变量名到类型的映射
        const varTypeMap = {};
        const varRegex = /(?:var\s+)?(\w+)\s*(?:[:=])=\s*(?:&)?([\w\.]+)\s*(?:\{\})?/g;
        let varMatch;
        while ((varMatch = varRegex.exec(functionBody)) !== null) {
            const varName = varMatch[1];
            const varType = varMatch[2];
            varTypeMap[varName] = varType;
        }

        // 检查是否有 apix.GetPageReq 调用
        if (/apix\.GetPageReq\(/.test(functionBody)) {
            usesGetPageReq = true;
        }

        // 正则表达式匹配 apix.GetParamX 调用
        const paramRegex = /(\w+),\s*e\s*:=\s*apix\.GetParam(\w+)\s*\(\s*ctx\s*,\s*"([^"]+)"(?:\s*,\s*(apix\.\w+|true|false))?\s*\)/g;
        let paramMatch;
        while ((paramMatch = paramRegex.exec(functionBody)) !== null) {
            const paramName = paramMatch[1];       // 变量名，例如: id
            const paramTypeFunc = paramMatch[2];   // 类型函数，例如: Int64, Str
            const paramKey = paramMatch[3];        // 参数键，例如: "id"
            const paramForce = paramMatch[4];      // 可选的强制参数，例如: apix.Force, true

            // 确定是否必填
            let required = false;
            if (paramForce) {
                if (paramForce === 'apix.Force' || paramForce === 'true') {
                    required = true;
                }
            }

            // 映射 Go 类型到 OpenAPI 类型
            let schemaType = 'string';
            switch (paramTypeFunc.toLowerCase()) {
                case 'int':
                case 'int32':
                case 'int64':
                    schemaType = 'integer';
                    break;
                case 'bool':
                    schemaType = 'boolean';
                    break;
                case 'float32':
                case 'float64':
                    schemaType = 'number';
                    break;
                default:
                    schemaType = 'string';
            }

            const paramObject = {
                name: paramKey,
                in: 'query', // 默认设置为 query
                required: required,
                schema: { type: schemaType }
            };

            params.push(paramObject);
        }

        // 处理通过 apix.BindParams 绑定的参数
        const bindParamsRegex = /e\s*:=\s*apix\.BindParams\s*\(\s*ctx\s*,\s*&?(\w+)\s*\)/g;
        let bindMatch;
        while ((bindMatch = bindParamsRegex.exec(functionBody)) !== null) {
            const varName = bindMatch[1];
            const fullType = varTypeMap[varName] || varName; // 获取变量的类型，若未声明则使用变量名

            let bindStructName = fullType;

            // 如果类型包含包名，例如 req.UserReq
            if (fullType.includes('.')) {
                bindStructName = fullType.split('.')[1];
            }

            params.push({
                bindStructName: bindStructName
            });
        }

        // 将是否使用分页的标记添加到参数中
        if (usesGetPageReq) {
            params.push({ usesGetPageReq: true });
        }

        functionParams[functionName] = params;
    }
    return functionParams;
};

/**
 * 解析模型定义
 */
const extractModelFields = async (modelFilePath) => {
    try {
        const modelContent = await fs.readFile(modelFilePath, 'utf-8');
        const fields = [];
        const modelRegex = /type\s+(\w+)\s+struct\s*{([\s\S]*?)^}/gm;
        let match;
        while ((match = modelRegex.exec(modelContent)) !== null) {
            const modelName = match[1];
            const modelFields = [];
            const fieldsContent = match[2];
            const fieldRegex = /\s*(\w+)\s+([\w\.\*\[\]]+)\s+`[^`]*?(?:json|form):"([^"]+)"[^`]*`/g;
            let fieldMatch;
            while ((fieldMatch = fieldRegex.exec(fieldsContent)) !== null) {
                const fieldName = fieldMatch[1];
                const fieldType = fieldMatch[2];
                const tagName = fieldMatch[3];
                modelFields.push({
                    field: fieldName,
                    type: fieldType,
                    json: tagName
                });
            }
            fields.push({ modelName, modelFields });
        }
        return fields;
    } catch (error) {
        console.error(chalk.red(`Failed to parse model file: ${modelFilePath}`), error);
        return [];
    }
};

/**
 * 获取版本号并递增
 */
const getNextVersion = (existingVersion) => {
    if (!existingVersion) return "1.0.0"; // 默认版本号

    const nextVersion = semver.inc(existingVersion, 'patch');  // 按照补丁版本递增
    return nextVersion || "1.0.0";
};

/**
 * 生成或更新 redoc.html
 * @param {string} docDir - 目标项目的 doc 目录路径
 * @param {string} templatePath - redoc_template.html 的路径
 */
const generateRedocHtml = async (docDir, templatePath) => {
    try {
        // 读取模板文件
        const redocTemplate = await fs.readFile(templatePath, 'utf-8');

        // 获取 doc 文件夹下所有 JSON 文件（不包�� redoc.html）
        const jsonFiles = await fs.readdir(docDir);
        const openApiJsonFiles = jsonFiles.filter(file => file.endsWith('.json'));

        // 生成 API_OPTIONS
        const apiOptions = openApiJsonFiles.map(file => {
            const apiName = path.basename(file, '.json');
            return `<option value="./${file}">${apiName}</option>`;
        }).join('\n');

        // 替换模板中的 {{API_OPTIONS}} 占位符
        const redocHtmlContent = redocTemplate.replace('{{API_OPTIONS}}', apiOptions);

        // 写入 redoc.html 到 doc 文件夹
        const redocHtmlPath = path.join(docDir, 'redoc.html');
        await fs.writeFile(redocHtmlPath, redocHtmlContent, 'utf-8');
        console.log(chalk.green(`ReDoc page generated or updated: doc/redoc.html`));
    } catch (error) {
        console.error(chalk.red('Error generating ReDoc page:'), chalk.redBright(error.message));
    }
};

/**
 * 启动 http-server 以预览文档
 * 仅显示 'Available on:' 和 'Hit CTRL-C to stop the server' 部分
 * 将控制台提示改为英文
 * @param {string} docDir - 目标项目的 doc 目录路径
 */
const startHttpServer = (docDir) => {  // 添加 docDir 参数
    const server = spawn('http-server', ['-p', '8080', docDir], { shell: true });

    // 监听 stdout 数据
    server.stdout.on('data', (data) => {
        const output = data.toString();
        const lines = output.split('\n');
        lines.forEach(line => {
            const trimmedLine = line.trim();
            if (trimmedLine === 'Available on:' || trimmedLine === 'Hit CTRL-C to stop the server') {
                console.log(line);
                return;
            }
            if (trimmedLine.startsWith('http://') || trimmedLine.startsWith('https://')) {
                console.log(`  ${trimmedLine}/redoc.html`); // 指向 redoc.html
            }
        });
    });

    // 监听 stderr 数据并过滤掉特定的 Deprecation Warning
    server.stderr.on('data', (data) => {
        const errorOutput = data.toString();
        if (!errorOutput.includes('DEP0066')) {
            console.error(chalk.red('http-server error:'), chalk.redBright(errorOutput));
        }
    });

    // 监听错误事件
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(chalk.red(`Port 8080 is already in use. Please use another port.`));
        } else {
            console.error(chalk.red('Error starting http-server:'), chalk.redBright(err.message));
        }
    });

    // 监听关闭事件
    server.on('close', (code) => {
        if (code !== 0) {
            console.error(chalk.red(`http-server process exited with code ${code}`));
        }
    });
};

/**
 * 生成 OpenAPI 文档
 * @param {string|null} moduleName - 指定的模块名
 */
const generateOpenAPIDocs = async (moduleName = null) => {
    try {
        const cliDir = path.resolve(__dirname, '..'); // 指向 CLI 项目的根目录
        const templatesDir = path.join(cliDir, 'templates');
        const redocTemplatePath = path.join(templatesDir, 'redoc_template.html');

        // 确保模板文件存在
        if (!(await fs.pathExists(redocTemplatePath))) {
            console.error(chalk.red(`Template file missing: ${redocTemplatePath}`));
            return;
        }

        const domainDir = path.join(process.cwd(), 'domain');
        const docDir = path.join(process.cwd(), 'doc');

        // 确保 doc 目录存在
        await fs.ensureDir(docDir);

        // 读取并解析 _bin/local.yaml 获取 API 服务器地址
        let serverUrl = 'http://localhost:8080'; // 默认值
        const binDir = path.join(process.cwd(), '_bin');
        const localYamlPath = path.join(binDir, 'local.yaml');

        if (await fs.pathExists(localYamlPath)) {
            try {
                const yamlContent = await fs.readFile(localYamlPath, 'utf-8');
                const config = yaml.load(yamlContent);
                const addr = config?.api?.rest?.addr;
                if (addr) {
                    // addr 例如:9527
                    let host = 'localhost';
                    let port = '8080';
                    const addrMatch = addr.match(/(.*):(\d+)/);
                    if (addrMatch) {
                        if (addrMatch[1]) {
                            host = addrMatch[1];
                        }
                        port = addrMatch[2];
                    }
                    serverUrl = `http://${host}:${port}`;
                }
            } catch (error) {
                console.error(chalk.red(`Failed to parse YAML file: ${localYamlPath}`), error);
                console.warn(chalk.yellow('Using default server URL: http://localhost:8080'));
            }
        } else {
            console.warn(chalk.yellow(`YAML configuration file not found: ${localYamlPath}`));
            console.warn(chalk.yellow('Using default server URL: http://localhost:8080'));
        }

        // 扫描所有模块
        const moduleDirs = moduleName ? [moduleName] : await fs.readdir(domainDir);

        // 过滤出目录
        const modulesToProcess = [];
        for (const module of moduleDirs) {
            const modulePath = path.join(domainDir, module);
            if (await fs.pathExists(modulePath) && (await fs.lstat(modulePath)).isDirectory()) {
                modulesToProcess.push(module);
            }
        }

        for (const module of modulesToProcess) {
            const modulePath = path.join(domainDir, module);
            const flatRouterFilePath = path.join(modulePath, 'router.go');
            const flatControllerFilePath = path.join(modulePath, 'controller.go');
            const legacyRouterFilePath = path.join(modulePath, 'api/router.go');
            const legacyControllerFilePath = path.join(modulePath, 'api/controller.go');
            const routerFilePath = await fs.pathExists(flatRouterFilePath) ? flatRouterFilePath : legacyRouterFilePath;
            const controllerFilePath = await fs.pathExists(flatControllerFilePath) ? flatControllerFilePath : legacyControllerFilePath;
            const modelFilePath = path.join(modulePath, 'model', `${module}.go`);
            const dtoFilePath = path.join(modulePath, 'dto.go');
            const reqFilePath = path.join(modulePath, 'api', 'req', 'req.go');

            // 检查文件是否存在
            if (!(await fs.pathExists(routerFilePath)) || !(await fs.pathExists(controllerFilePath)) || !(await fs.pathExists(modelFilePath))) {
                console.warn(chalk.yellow(`Module "${module}" is missing required files, skipping...`));
                continue;
            }
            const schemaFilePaths = [modelFilePath];
            if (await fs.pathExists(dtoFilePath)) {
                schemaFilePaths.push(dtoFilePath);
            } else if (await fs.pathExists(reqFilePath)) {
                schemaFilePaths.push(reqFilePath);
            }

            // 扫描 router.go 获取路由信息
            const routes = await scanRouterFile(routerFilePath);
            // console.log(`Scanned routes for module "${module}":`, routes);

            // 扫描 controller.go 获取方法参数
            const controllerContent = await fs.readFile(controllerFilePath, 'utf-8');
            const reqDir = await fs.pathExists(reqFilePath) ? path.dirname(reqFilePath) : modulePath;
            const controllerParams = await extractParamsFromController(controllerContent, reqDir, path.dirname(modelFilePath));
            // console.log(`Extracted controller parameters for module "${module}":`, controllerParams);

            // 扫描 model.go 和 dto.go/req.go 获取字段
            const allFields = [];
            for (const schemaFilePath of schemaFilePaths) {
                allFields.push(...await extractModelFields(schemaFilePath));
            }

            // 生成 OpenAPI 格式文档
            const openAPIDoc = {
                openapi: "3.0.0",
                info: {
                    title: `${module} API`,
                    version: "1.0.0", // 默认版本号，稍后会递增
                    description: `${module} api doc, generated by gorig-cli
                    \n last updated: ${formatDate(new Date())}`, // 添加描述信息
                },
                servers: [
                    {
                        url: serverUrl, // 使用从 YAML 获取的 serverUrl
                        description: "API Server"
                    }
                ],
                paths: {},
                components: {
                    schemas: {},
                },
            };

            // 检查是否存在现有文档文件，读取并递增版本号
            const existingDocPath = path.join(docDir, `${module}.json`);
            if (await fs.pathExists(existingDocPath)) {
                const existingDoc = await fs.readJson(existingDocPath);
                openAPIDoc.info.version = getNextVersion(existingDoc.info.version);
                // 复用 schemas
                if (existingDoc.components && existingDoc.components.schemas) {
                    openAPIDoc.components.schemas = existingDoc.components.schemas;
                }
            }

            // 添加所有结构体定义到 components.schemas
            allFields.forEach(model => {
                const properties = {};
                model.modelFields.forEach(field => {
                    let fieldType = 'string';  // 默认类型
                    const lowerType = field.type.toLowerCase();
                    if (lowerType.includes('int')) {
                        fieldType = 'integer';
                    } else if (lowerType.includes('bool')) {
                        fieldType = 'boolean';
                    } else if (lowerType.includes('float')) {
                        fieldType = 'number';
                    } else if (lowerType.startsWith('[]')) {
                        fieldType = 'array';
                    }

                    if (fieldType === 'array') {
                        // 假设数组元素类型为 string，实际应根据具体类型调整
                        properties[field.json] = {
                            type: 'array',
                            items: { type: 'string' }
                        };
                    } else {
                        properties[field.json] = { type: fieldType };
                    }
                });
                openAPIDoc.components.schemas[model.modelName] = {
                    type: 'object',
                    properties,
                };
            });

            // 手动合并嵌套结构体字段到 UserReq
            if (openAPIDoc.components.schemas['UserReq'] && openAPIDoc.components.schemas['UserD']) {
                const userReqProperties = openAPIDoc.components.schemas['UserReq'].properties;
                const userDProperties = openAPIDoc.components.schemas['UserD'].properties;

                // 合并 UserD 的字段到 UserReq
                openAPIDoc.components.schemas['UserReq'].properties = {
                    ...userReqProperties,
                    ...userDProperties
                };

                // 如果不需要独立定义 UserD，可以删除它
                // delete openAPIDoc.components.schemas['UserD'];
            }

            // 替换 'filter' schema reference with 'UserReq'
            for (const [handler, params] of Object.entries(controllerParams)) {
                for (const param of params) {
                    if (param.bindStructName === 'filter') {
                        param.bindStructName = 'UserReq';
                    }
                }
            }

            // 生成完整路径并修复嵌套结构问题
            for (const route of routes) {
                const basePath = `/${module}`;  // 从 groupRouter.Group("user") 获取
                const fullPath = `${basePath}/${route.path}`.replace(/\/+/g, '/');  // 确保路径格式正确
                const pathParamsList = route.pathParams; // 从路由中获取 path 参数列表

                // 获取对应处理函数的参数
                const funcParams = controllerParams[route.handler] || [];

                let parameters = [];
                let requestBody = undefined;
                let usesGetPageReq = false;

                // 分离参数和 requestBody
                for (const param of funcParams) {
                    if (param.usesGetPageReq) {
                        usesGetPageReq = true;
                    } else if (param.bindStructName) {
                        // 处理绑定的结构体，作为 requestBody 或 query 参数
                        if (['POST', 'PUT'].includes(route.method.toUpperCase())) {
                            // POST 和 PUT 请求使用 requestBody
                            requestBody = {
                                required: true,
                                content: {
                                    'application/json': {
                                        schema: {
                                            $ref: `#/components/schemas/${param.bindStructName}`,
                                        },
                                    },
                                },
                            };
                        } else if (['GET', 'DELETE'].includes(route.method.toUpperCase())) {
                            // GET 和 DELETE 请求使用 query 参数
                            const schema = openAPIDoc.components.schemas[param.bindStructName];
                            if (schema && schema.properties) {
                                for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
                                    parameters.push({
                                        name: fieldName,
                                        in: 'query',
                                        required: false, // 根据实际情况调整
                                        schema: fieldSchema
                                    });
                                }
                            } else {
                                console.warn(chalk.yellow(`Function "${route.handler}" has undefined bindStructName "${param.bindStructName}"`));
                            }
                        }
                    } else {
                        // 确定参数位置
                        if (pathParamsList.includes(param.name)) {
                            param.in = 'path';
                        } else {
                            param.in = 'query';
                        }
                        parameters.push(param);
                    }
                }

                // 如果函数中使用了 apix.GetPageReq，则添加分页参数
                if (usesGetPageReq) {
                    parameters = parameters.concat([
                        { name: "page", in: "query", required: false, schema: { type: "integer" } },
                        { name: "size", in: "query", required: false, schema: { type: "integer" } },
                        { name: "lastID", in: "query", required: false, schema: { type: "integer" } },
                    ]);
                }

                // 去重参数
                const uniqueParameters = [];
                const paramNames = new Set();
                parameters.forEach(param => {
                    if (!paramNames.has(param.name)) {
                        paramNames.add(param.name);
                        uniqueParameters.push(param);
                    }
                });

                // 定义响应
                const responses = {
                    '200': {
                        description: 'Success',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {} // 可以根据需要进一步完善响应体
                                },
                            },
                        },
                    },
                };

                // 如果有 requestBody，添加到 operation
                const operation = {
                    summary: route.handler,
                    parameters: uniqueParameters.length > 0 ? uniqueParameters : undefined,
                    responses,
                };

                if (requestBody) {
                    operation.requestBody = requestBody;
                }

                // 初始化路径对象
                if (!openAPIDoc.paths[fullPath]) {
                    openAPIDoc.paths[fullPath] = {};
                }

                openAPIDoc.paths[fullPath][route.method.toLowerCase()] = operation;
            }

            // 写入 OpenAPI JSON 文件
            await fs.writeJson(existingDocPath, openAPIDoc, { spaces: 2 });
            console.log(chalk.green(`OpenAPI documentation generated: doc/${path.basename(existingDocPath)}`));
        }

        // 生成或更新 redoc.html 一次
        await generateRedocHtml(docDir, redocTemplatePath);

        // 启动 http-server 以预览文档
        startHttpServer(docDir);
    } catch (error) {
        console.error(chalk.red('Error generating API documentation:'), chalk.redBright(error.message));
    }
};

/**
 * 处理命令行输入
 */
const docCommand = async () => {
    const program = new Command();

    program
        .command('doc')
        .description('Generate API documentation')
        .argument('[moduleName]', 'Module name. If specified, only generate documentation for that module.')
        .action(async (moduleName) => {
            await generateOpenAPIDocs(moduleName);
        });

    program.parse(process.argv);
};

// 默认导出一个函数
export default docCommand;
