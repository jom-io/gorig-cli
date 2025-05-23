import fs from 'fs-extra';
import path from 'path';
import ejs from 'ejs';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

// Define __dirname variable
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Create module main function
const createModule = async (args) => {
  if (args.length < 1) {
    console.error(chalk.yellow('Please use the correct command format: npx <your package name> create <module name>'));
    process.exit(1);
  }

  const moduleName = args[0];
  const ModuleName = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);

  // Get the current working directory, which is the directory where the command is executed
  const currentDir = process.cwd();

  // Build the paths for the domain directory and module directory
  const domainDir = path.join(currentDir, 'domain');
  const moduleDir = path.join(domainDir, moduleName);

  // Define the subdirectories to be created
  const subDirs = ['api', 'model', 'internal', 'api/req'];

  console.log(chalk.blue(`\nStarting to create module: ${chalk.bold(moduleName)}`));

  try {
    const projectName = await getGoModModuleName();

    await fs.ensureDir(domainDir);
    await fs.ensureDir(moduleDir);

    // Create subdirectories
    const createSubDirs = subDirs.map((subDir) => {
      const subDirPath = path.join(moduleDir, subDir);
      return fs.ensureDir(subDirPath);
    });
    await Promise.all(createSubDirs);

    // Create and write model.go file
    const modelDir = path.join(moduleDir, 'model');
    const modelFilePath = path.join(modelDir, `${moduleName}.go`);
    const modelTemplatePath = path.join(__dirname, '../templates/model.go.ejs');
    const modelContent = await ejs.renderFile(modelTemplatePath, { moduleName, ModuleName, projectName });
    await fs.writeFile(modelFilePath, modelContent);
    console.log(chalk.green(`Successfully created ${chalk.bold('model.go')} file`));

    // Create and write req.go file
    const apiDir = path.join(moduleDir, 'api');
    const reqDir = path.join(apiDir, 'req');
    const reqFilePath = path.join(reqDir, `req.go`);
    const reqTemplatePath = path.join(__dirname, '../templates/req.go.ejs');
    const reqContent = await ejs.renderFile(reqTemplatePath, { moduleName, ModuleName, projectName });
    await fs.writeFile(reqFilePath, reqContent);
    console.log(chalk.green(`Successfully created ${chalk.bold('req.go')} file`));

    // Create and write resp.go file
    const respFilePath = path.join(reqDir, `resp.go`);
    const respTemplatePath = path.join(__dirname, '../templates/resp.go.ejs');
    const respContent = await ejs.renderFile(respTemplatePath, { moduleName, ModuleName, projectName });
    await fs.writeFile(respFilePath, respContent);
    console.log(chalk.green(`Successfully created ${chalk.bold('resp.go')} file`));

    // Create and write internal.go file
    const internalDir = path.join(moduleDir, 'internal');
    const internalFilePath = path.join(internalDir, `${moduleName}.go`);
    const internalTemplatePath = path.join(__dirname, '../templates/internal.go.ejs');
    const internalContent = await ejs.renderFile(internalTemplatePath, { moduleName, ModuleName, projectName });
    await fs.writeFile(internalFilePath, internalContent);
    console.log(chalk.green(`Successfully created ${chalk.bold('internal.go')} file`));

    // Create and write service.pub.go file
    const serviceFilePath = path.join(apiDir, `service.pub.go`);
    const serviceTemplatePath = path.join(__dirname, '../templates/service.pub.go.ejs');
    const serviceContent = await ejs.renderFile(serviceTemplatePath, { moduleName, ModuleName, projectName });
    await fs.writeFile(serviceFilePath, serviceContent);
    console.log(chalk.green(`Successfully created ${chalk.bold('service.pub.go')} file`));

    // Create and write service.go file
    const serviceGoFilePath = path.join(apiDir, `service.go`);
    const serviceGoTemplatePath = path.join(__dirname, '../templates/service.go.ejs');
    const serviceGoContent = await ejs.renderFile(serviceGoTemplatePath, { moduleName, ModuleName, projectName });
    await fs.writeFile(serviceGoFilePath, serviceGoContent);
    console.log(chalk.green(`Successfully created ${chalk.bold('service.go')} file`));

    // Create and write controller.go file
    const controllerGoFilePath = path.join(apiDir, `controller.go`);
    const controllerGoTemplatePath = path.join(__dirname, '../templates/controller.go.ejs');
    const controllerGoContent = await ejs.renderFile(controllerGoTemplatePath, { moduleName, ModuleName, projectName });
    await fs.writeFile(controllerGoFilePath, controllerGoContent);
    console.log(chalk.green(`Successfully created ${chalk.bold('controller.go')} file`));

    // Create and write router.go file
    const routerGoFilePath = path.join(apiDir, `router.go`);
    const routerGoTemplatePath = path.join(__dirname, '../templates/router.go.ejs');
    const routerGoContent = await ejs.renderFile(routerGoTemplatePath, { moduleName, ModuleName, projectName });
    await fs.writeFile(routerGoFilePath, routerGoContent);
    console.log(chalk.green(`Successfully created ${chalk.bold('router.go')} file`));

    // Check and update domain/init.go file
    const initFilePath = path.join(domainDir, 'init.go');
    if (await fs.pathExists(initFilePath)) {
      let initFileContent = await fs.readFile(initFilePath, 'utf-8');

      const importStatement = `import _ "${projectName}/domain/${moduleName}/api"`;

      if (!initFileContent.includes(importStatement)) {
        const initFuncIndex = initFileContent.indexOf('func init()');

        if (initFuncIndex !== -1) {
          // Find init function, ensure import statement is added above init function
          const insertPosition = initFuncIndex;
          const headCode = initFileContent.slice(0, insertPosition).trimEnd();
          initFileContent =
            `${headCode}\n` +
            `${importStatement}\n\n` +
            initFileContent.slice(insertPosition);

          await fs.writeFile(initFilePath, initFileContent);
          console.log(chalk.green(`Successfully updated ${chalk.bold('init.go')} file, added import statement`));
        } else {
          console.log(chalk.yellow(`init() function not found, skipping import statement addition`));
        }
      } else {
        console.log(chalk.yellow(`The corresponding import statement already exists in init.go, no need to add it again`));
      }
    } else {
      console.log(chalk.yellow(`Could not find ${chalk.bold('init.go')} file, skipping import statement addition`));
    }

    console.log(chalk.blue(`\nModule ${chalk.bold(moduleName)} has been successfully created in ${chalk.bold(`domain/${moduleName}`)} directory`));
  } catch (error) {
    console.error(chalk.red('Error creating module:'), chalk.redBright(error.message));
  }
};

export default createModule;
