import fs from 'fs-extra';
import path from 'path';
import ejs from 'ejs';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

// Define __dirname variable
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const readOptionValue = (args, index, name) => {
  const arg = args[index];
  const prefix = `${name}=`;
  if (arg.startsWith(prefix)) {
    return { value: arg.slice(prefix.length), nextIndex: index };
  }
  if (index + 1 >= args.length || args[index + 1].startsWith('--')) {
    throw new Error(`Missing value for ${name}`);
  }
  return { value: args[index + 1], nextIndex: index + 1 };
};

const toModuleName = (moduleName) => moduleName
  .split('_')
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join('');

export const parseCreateArgs = (args) => {
  if (args.length < 1) {
    throw new Error('Please use the correct command format: gorig-cli create <module name>');
  }

  const moduleName = args[0];
  if (!/^[a-z][a-z0-9_]*$/.test(moduleName)) {
    throw new Error('Module name must use lower snake_case, for example: user or supply_order');
  }

  const options = {
    moduleName,
    ModuleName: toModuleName(moduleName),
    crud: false,
    db: '',
    dbName: '',
    http: true,
  };

  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--crud') {
      options.crud = true;
      continue;
    }
    if (arg === '--no-http') {
      options.http = false;
      continue;
    }

    const valueOptions = ['--db', '--database', '--store', '--db-name'];
    const optionName = valueOptions.find((name) => arg === name || arg.startsWith(`${name}=`));
    if (!optionName) {
      throw new Error(`Unknown create option: ${arg}`);
    }

    const { value, nextIndex } = readOptionValue(args, i, optionName);
    i = nextIndex;

    if (['--db', '--database', '--store'].includes(optionName)) {
      options.crud = true;
      options.db = value.toLowerCase();
    } else if (optionName === '--db-name') {
      options.dbName = value;
    }
  }

  if (options.crud) {
    if (!['mysql', 'mongo', 'mongodb'].includes(options.db)) {
      throw new Error('Persistent CRUD modules require --db mysql or --db mongo');
    }
    if (options.db === 'mongodb') {
      options.db = 'mongo';
    }
    if (!options.dbName) {
      options.dbName = options.db === 'mysql' ? 'Main' : 'main';
    }
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(options.dbName)) {
      throw new Error('Database connection name must start with a letter and contain only letters, numbers, or underscores');
    }
  }

  return options;
};

// Get the module name from the go.mod file
const getGoModModuleName = async () => {
  try {
    const goModPath = path.join(process.cwd(), 'go.mod');
    const goModContent = await fs.readFile(goModPath, 'utf-8');
    const moduleLine = goModContent.split('\n').find(line => line.startsWith('module '));
    if (moduleLine) {
      return moduleLine.split(' ')[1].trim();
    } else {
      throw new Error('Module name not found');
    }
  } catch (error) {
    console.error(chalk.red('Unable to read go.mod file. Please confirm that you are running this command in the root directory of the Go project.'));
    process.exit(1);
  }
};

const renderTemplate = async (templateName, destination, data) => {
  const templatePath = path.join(__dirname, '../templates', templateName);
  const content = await ejs.renderFile(templatePath, data);
  await fs.ensureDir(path.dirname(destination));
  await fs.writeFile(destination, content);
};

const renderTemplateContent = async (templateName, data) => {
  const templatePath = path.join(__dirname, '../templates', templateName);
  return ejs.renderFile(templatePath, data);
};

const insertYamlConnection = (content, topKey, connectionName, connectionBlock) => {
  const normalized = content.endsWith('\n') ? content : `${content}\n`;
  const lines = normalized.split('\n');
  const topIndex = lines.findIndex((line) => line === `${topKey}:`);

  if (topIndex < 0) {
    return `${normalized.trimEnd()}\n\n${topKey}:\n${connectionBlock.trimEnd()}\n`;
  }

  let endIndex = lines.length - 1;
  for (let i = topIndex + 1; i < lines.length; i += 1) {
    if (/^[A-Za-z0-9_.-]+\s*:/.test(lines[i])) {
      endIndex = i;
      break;
    }
  }

  const connectionPattern = new RegExp(`^  ${connectionName}:\\s*$`);
  if (lines.slice(topIndex + 1, endIndex).some((line) => connectionPattern.test(line))) {
    return content;
  }

  lines.splice(endIndex, 0, ...connectionBlock.trimEnd().split('\n'));
  return `${lines.join('\n').trimEnd()}\n`;
};

const ensureCrudConfig = async (projectDir, data) => {
  const topKey = data.db === 'mysql' ? 'Mysql' : 'mongo';
  const templateName = data.db === 'mysql'
    ? 'crud.mysql.config.yaml.ejs'
    : 'crud.mongo.config.yaml.ejs';
  const connectionBlock = await renderTemplateContent(templateName, data);
  const configPaths = [
    '_bin/local.yaml',
    '_bin/dev.yaml',
    '_bin/prod.yaml',
    'test/_bin/local.yaml',
  ];

  for (const relativePath of configPaths) {
    const configPath = path.join(projectDir, relativePath);
    if (!await fs.pathExists(configPath)) {
      console.log(chalk.yellow(`Could not find ${relativePath}, skipping database configuration`));
      continue;
    }

    const original = await fs.readFile(configPath, 'utf8');
    const updated = insertYamlConnection(original, topKey, data.dbName, connectionBlock);
    if (updated !== original) {
      await fs.writeFile(configPath, updated);
      console.log(chalk.green(`Successfully updated ${chalk.bold(relativePath)} database configuration`));
    }
  }
};

const updateDomainInit = async (domainDir, projectName, moduleName) => {
  const initFilePath = path.join(domainDir, 'init.go');
  if (!await fs.pathExists(initFilePath)) {
    console.log(chalk.yellow(`Could not find ${chalk.bold('init.go')} file, skipping import statement addition`));
    return;
  }

  let initFileContent = await fs.readFile(initFilePath, 'utf-8');
  const importStatement = `import _ "${projectName}/domain/${moduleName}"`;

  if (initFileContent.includes(importStatement)) {
    console.log(chalk.yellow('The corresponding import statement already exists in init.go, no need to add it again'));
    return;
  }

  const packageMatch = initFileContent.match(/^package\s+\w+\s*$/m);
  if (!packageMatch) {
    console.log(chalk.yellow('package declaration not found, skipping import statement addition'));
    return;
  }

  const insertPosition = packageMatch.index + packageMatch[0].length;
  const rest = initFileContent.slice(insertPosition).trimStart();
  initFileContent =
    `${initFileContent.slice(0, insertPosition).trimEnd()}\n\n` +
    `${importStatement}\n` +
    (rest ? `\n${rest}` : '');

  await fs.writeFile(initFilePath, initFileContent);
  console.log(chalk.green(`Successfully updated ${chalk.bold('init.go')} file, added import statement`));
};

const createSimpleModule = async (moduleDir, data) => {
  const { moduleName } = data;

  await renderTemplate('model.go.ejs', path.join(moduleDir, 'model', `${moduleName}.go`), data);
  console.log(chalk.green(`Successfully created ${chalk.bold('model.go')} file`));

  await renderTemplate('dto.go.ejs', path.join(moduleDir, 'dto.go'), data);
  console.log(chalk.green(`Successfully created ${chalk.bold('dto.go')} file`));

  await renderTemplate('service.go.ejs', path.join(moduleDir, 'service.go'), data);
  console.log(chalk.green(`Successfully created ${chalk.bold('service.go')} file`));

  await renderTemplate('controller.go.ejs', path.join(moduleDir, 'controller.go'), data);
  console.log(chalk.green(`Successfully created ${chalk.bold('controller.go')} file`));

  await renderTemplate('router.go.ejs', path.join(moduleDir, 'router.go'), data);
  console.log(chalk.green(`Successfully created ${chalk.bold('router.go')} file`));
};

const createCrudModule = async (moduleDir, projectDir, data, options) => {
  const { moduleName } = data;
  const crudData = {
    ...data,
    ...options,
    dbTitle: options.db === 'mysql' ? 'MySQL' : 'MongoDB',
    dbEnvName: options.dbName.replace(/[^A-Za-z0-9]/g, '_').toUpperCase(),
    dbSchema: path.basename(projectDir).replace(/[^a-z0-9]/gi, '_').toLowerCase(),
  };

  await ensureCrudConfig(projectDir, crudData);

  await renderTemplate('crud.model.go.ejs', path.join(moduleDir, 'model', `${moduleName}.go`), crudData);
  console.log(chalk.green(`Successfully created ${chalk.bold('model.go')} file`));

  await renderTemplate('crud.dto.go.ejs', path.join(moduleDir, 'dto.go'), crudData);
  console.log(chalk.green(`Successfully created ${chalk.bold('dto.go')} file`));

  await renderTemplate('crud.service.go.ejs', path.join(moduleDir, 'service.go'), crudData);
  console.log(chalk.green(`Successfully created ${chalk.bold('service.go')} file`));

  await renderTemplate('crud.module.README.md.ejs', path.join(moduleDir, 'README.md'), crudData);
  console.log(chalk.green(`Successfully created ${chalk.bold('README.md')} file`));

  await renderTemplate('crud.test.go.ejs', path.join(projectDir, 'test', `${moduleName}_test.go`), crudData);
  console.log(chalk.green(`Successfully created ${chalk.bold('test file')} file`));

  const integrationInitPath = path.join(projectDir, 'test', `init_${options.db}_integration_test.go`);
  if (!await fs.pathExists(integrationInitPath)) {
    await renderTemplate('crud.integration.init_test.go.ejs', integrationInitPath, crudData);
    console.log(chalk.green(`Successfully created ${chalk.bold('database integration init file')} file`));
  }

  await renderTemplate(
    'crud.integration_test.go.ejs',
    path.join(projectDir, 'test', `${moduleName}_integration_test.go`),
    crudData,
  );
  console.log(chalk.green(`Successfully created ${chalk.bold('database integration test file')} file`));

  if (options.http) {
    await renderTemplate('crud.controller.go.ejs', path.join(moduleDir, 'controller.go'), crudData);
    console.log(chalk.green(`Successfully created ${chalk.bold('controller.go')} file`));

    await renderTemplate('crud.router.go.ejs', path.join(moduleDir, 'router.go'), crudData);
    console.log(chalk.green(`Successfully created ${chalk.bold('router.go')} file`));

    await renderTemplate('crud.doc.md.ejs', path.join(projectDir, 'doc', `${moduleName}.md`), crudData);
    console.log(chalk.green(`Successfully created ${chalk.bold('doc file')} file`));
  }
};

// Create module main function
const createModule = async (args) => {
  try {
    const options = parseCreateArgs(args);
    const { moduleName, ModuleName } = options;
    const currentDir = process.cwd();
    const domainDir = path.join(currentDir, 'domain');
    const moduleDir = path.join(domainDir, moduleName);

    console.log(chalk.blue(`\nStarting to create module: ${chalk.bold(moduleName)}`));

    const projectName = await getGoModModuleName();
    const data = { moduleName, ModuleName, projectName };

    await fs.ensureDir(domainDir);
    await fs.ensureDir(path.join(moduleDir, 'model'));

    if (options.crud) {
      await createCrudModule(moduleDir, currentDir, data, options);
    } else {
      await createSimpleModule(moduleDir, data);
    }

    if (!options.crud || options.http) {
      await updateDomainInit(domainDir, projectName, moduleName);
    }

    const profile = options.crud ? `persistent CRUD (${options.db})` : 'basic';
    console.log(chalk.blue(`\nModule ${chalk.bold(moduleName)} has been successfully created in ${chalk.bold(`domain/${moduleName}`)} directory [${profile}]`));
  } catch (error) {
    console.error(chalk.red('Error creating module:'), chalk.redBright(error.message));
    process.exitCode = 1;
  }
};

export default createModule;
