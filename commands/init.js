import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ejs from 'ejs';
import { exec, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import readline from 'readline';

// 获取 __dirname 的替代方案
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 检查系统是否安装了 Go
const checkGoEnvironment = () => {
  return new Promise((resolve, reject) => {
    exec('go version', (error, stdout, stderr) => {
      if (error) {
        reject(new Error('Go environment not detected, please install Go language environment first, visit https://golang.org/dl/ for installation.'));
      } else {
        resolve(stdout);
      }
    });
  });
};

// 添加 gorig 依赖到项目中
const addGorigDependency = (projectDir) => {
  return new Promise((resolve, reject) => {
    exec('go get github.com/jom-io/gorig@latest', { cwd: projectDir }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Failed to add gorig dependency: ${stderr}`));
      } else {
        resolve(stdout);
      }
    });
  });
};

// 执行 go mod tidy
const runGoModTidy = (projectDir) => {
  return new Promise((resolve, reject) => {
    exec('go mod tidy', { cwd: projectDir }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Failed to run go mod tidy: ${stderr}`));
      } else {
        resolve(stdout);
      }
    });
  });
};

// 询问用户是否覆盖已有目录
const askOverwriteConfirmation = (projectDir) => {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(
      chalk.yellow(`Directory ${chalk.bold(projectDir)} already exists, do you want to overwrite? (y/N): `),
      (answer) => {
        rl.close();
        if (answer.toLowerCase() === 'y') {
          resolve(true);
        } else {
          resolve(false);
        }
      }
    );
  });
};

// 询问用户是否启动项目，超时5秒
const askStartConfirmation = () => {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // 设置5秒超时
    const timeout = setTimeout(() => {
      rl.close();
      resolve(true);
    }, 6000);

    rl.question('\nDo you want to start the project now? (y/N): ', (answer) => {
      clearTimeout(timeout);
      rl.close();
      if (answer.toLowerCase() === 'y') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
};

// 初始化项目的主函数
const initModule = async (args) => {
  if (args.length < 1) {
    console.error(chalk.yellow('Please use the correct command format: npx <your package name> init <project name>'));
    process.exit(1);
  }

  const projectName = args[0];
  const projectDir = path.join(process.cwd(), projectName);
  const projectNameUpper = projectName.toUpperCase();
  const projectPrefix = projectName.toLowerCase().replace(/-/g, '_');

  // 定义需要创建的子目录
  const subDirs = ['_bin', '_cmd', 'domain', 'global', 'cron'];

  console.log(chalk.blue(`\nStarting project initialization: ${chalk.bold(projectName)}`));

  try {
    // 检查本地是否存在 Go 环境
    await checkGoEnvironment();
    console.log(chalk.green('Go environment detected, continuing project initialization...'));

    // 检查项目目录是否已存在
    if (await fs.pathExists(projectDir)) {
      const shouldOverwrite = await askOverwriteConfirmation(projectDir);
      if (!shouldOverwrite) {
        console.log(chalk.red('Project initialization has been canceled.'));
        process.exit(0);
      } else {
        await fs.remove(projectDir);  // 删除已有的目录
        console.log(chalk.yellow(`Deleted existing directory: ${chalk.bold(projectDir)}`));
      }
    }

    // 创建项目目录
    await fs.ensureDir(projectDir);

    // 创建子目录
    const createSubDirs = subDirs.map((subDir) => {
      const subDirPath = path.join(projectDir, subDir);
      return fs.ensureDir(subDirPath);
    });
    await Promise.all(createSubDirs);

    // 创建并写入 go.mod 文件
    const goModPath = path.join(projectDir, 'go.mod');
    const goModContent = `module ${projectName}\n\ngo 1.20\n`;
    await fs.writeFile(goModPath, goModContent);
    console.log(chalk.green(`Successfully created ${chalk.bold('go.mod')} file`));

    // 添加 gorig 依赖
    console.log(chalk.blue('Adding gorig dependency, please wait...'));
    await addGorigDependency(projectDir);
    console.log(chalk.green(`Successfully added the latest version of github.com/jom-io/gorig dependency`));

    // 创建 _bin 目录下的配置文件
    const binDir = path.join(projectDir, '_bin');
    const configTemplatePath = path.join(__dirname, '../templates/config.yaml.ejs');

    const environments = ['dev', 'local', 'prod'];
    for (const env of environments) {
      const configFilePath = path.join(binDir, `${env}.yaml`);
      const configContent = await ejs.renderFile(configTemplatePath, {
        projectNameUpper,
        projectPrefix,
        mode: env,
      });
      await fs.writeFile(configFilePath, configContent);
      console.log(chalk.green(`Successfully created ${chalk.bold(`${env}.yaml`)} file`));
    }

    // 创建 domain/init.go 文件
    const domainDir = path.join(projectDir, 'domain');
    const initGoPath = path.join(domainDir, 'init.go');
    const initGoTemplatePath = path.join(__dirname, '../templates/init.go.ejs');
    const initGoContent = await ejs.renderFile(initGoTemplatePath, { projectNameUpper });
    await fs.writeFile(initGoPath, initGoContent);
    console.log(chalk.green(`Successfully created ${chalk.bold('init.go')} file`));

    // 创建 _cmd/main.go 文件
    const cmdDir = path.join(projectDir, '_cmd');
    const mainGoPath = path.join(cmdDir, 'main.go');
    const mainGoTemplatePath = path.join(__dirname, '../templates/main.go.ejs');
    const mainGoContent = await ejs.renderFile(mainGoTemplatePath, { projectName });
    await fs.writeFile(mainGoPath, mainGoContent);
    console.log(chalk.green(`Successfully created ${chalk.bold('main.go')} file`));

    // 创建 global/config.go 文件
    const globalDir = path.join(projectDir, 'global');
    const configGoPath = path.join(globalDir, 'config.go');
    const configGoTemplatePath = path.join(__dirname, '../templates/config.go.ejs');
    const configGoContent = await ejs.renderFile(configGoTemplatePath, { projectNameUpper });
    await fs.writeFile(configGoPath, configGoContent);
    console.log(chalk.green(`Successfully created ${chalk.bold('config.go')} file`));

    // 创建 cron/cron.go 文件
    const cronDir = path.join(projectDir, 'cron');
    const cronGoPath = path.join(cronDir, 'cron.go');
    const cronGoTemplatePath = path.join(__dirname, '../templates/cron.go.ejs');
    const cronGoContent = await ejs.renderFile(cronGoTemplatePath, {});
    await fs.writeFile(cronGoPath, cronGoContent);
    console.log(chalk.green(`Successfully created ${chalk.bold('cron.go')} file`));

    // 创建.gitignore 文件 从 templates 目录中复制 gitignore.ejs 文件
    const gitignoreTemplatePath = path.join(__dirname, '../templates/gitignore.ejs');
    const gitignorePath = path.join(projectDir, '.gitignore');
    await fs.copyFile(gitignoreTemplatePath, gitignorePath);

    // 检测如果本机存在git，则初始化git仓库
    try {
      exec('git', ['--version']);
      exec('git init', { cwd: projectDir }, (err) => {
        if (err) {
          console.error(chalk.red('Git initialization failed:'), err);
        } else {
          console.log(chalk.green('Git repository initialized.'));
        }
      });
    } catch {
      console.log(chalk.yellow('Git is not installed on this system. Skipping Git initialization.'));
    }
    // 运行 go mod tidy
    console.log(chalk.blue('Organizing Go module dependencies (go mod tidy), please wait...'));
    await runGoModTidy(projectDir);
    console.log(chalk.green('Successfully organized Go module dependencies'));

    // 提示用户项目创建成功
    console.log(chalk.blue(`\nProject ${chalk.bold(projectName)} has been successfully created in ${chalk.bold(projectDir)} directory`));
    console.log(chalk.yellow('\nHow to run the project:'));
    console.log(chalk.green(`1. Enter the project directory: cd ${projectName}`));
    console.log(chalk.green(`2. Use Go command to run the project:`));
    console.log(chalk.cyan(`   go run _cmd/main.go`));
    console.log(chalk.green(`\nOr compile and run directly:`));
    console.log(chalk.cyan(`   go build -o ${projectName} _cmd/main.go && ./${projectName}`));

    // 询问用户是否启动项目
    const shouldStart = await askStartConfirmation();
    if (shouldStart) {
      // 启动项目
      console.log(chalk.blue('\nStarting the project...'));
      try {
        const goProcess = spawn('go', ['run', '_cmd/main.go'], {
          cwd: projectDir,
          stdio: ['inherit', 'pipe', 'pipe'] // 继承 stdin 和 stdout，pipe stderr
        });

        goProcess.on('error', (err) => {
          console.error(chalk.red('Error starting project:'), chalk.redBright(err.message));
        });

        goProcess.on('close', (code) => {
          if (code !== 0) {
            console.error(chalk.red(`Project process exited with code ${code}`));
          }
        });

        // 检查 goProcess.stdout 是否存在
        if (goProcess.stdout) {
          goProcess.stdout.on('data', (data) => { // 监听 stdout
            const output = data.toString();
            process.stdout.write(output); // 将输出写入控制台
            if (output.includes('System startup successful')) {
              console.log(chalk.green(`\nVisit ${chalk.bold('http://localhost:9527')} to view the project`));
            }
          });
        } else {
          console.error(chalk.red('stdout is not available.'));
        }

        // 检查 goProcess.stderr 是否存在
        // if (goProcess.stderr) {
        //   goProcess.stderr.on('data', (data) => { // 监听 stderr
        //     const errorOutput = data.toString();
        //     if (errorOutput.includes('System startup successful')) {
        //       console.log(chalk.green(`\nVisit ${chalk.bold('http://localhost:9527')} to view the project`));
        //     } else {
        //       console.error(chalk.red(`Error: ${errorOutput}`));
        //     }
        //   });
        // } else {
        //   console.error(chalk.red('stderr is not available.'));
        // }

      } catch (error) {
        console.error(chalk.red('Error starting project:'), chalk.redBright(error.message));
      }
    } else {
      console.log(chalk.blue('\nProject initialization completed without starting the project.'));
    }

  } catch (error) {
    console.error(chalk.red('Error during project initialization:'), chalk.redBright(error.message));
  }
};

export default initModule;
