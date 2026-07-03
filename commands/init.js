import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ejs from 'ejs';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import readline from 'readline';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_GORIG_VERSION = 'latest';
const DEFAULT_PORT = 9527;
const ENVIRONMENTS = ['local', 'dev', 'prod'];

const printUsage = () => {
  console.log(chalk.yellow(
    'Usage: gorig-cli init <project-name> [--module <go-module>] [--gorig-version <version>] ' +
    '[--gorig-replace <path>] [--port <port>] [--force] [--start|--no-start] [--no-git]',
  ));
};

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

export const parseInitArgs = (args) => {
  if (args.length === 0 || args[0].startsWith('--')) {
    throw new Error('Project name is required');
  }

  const projectName = args[0];
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(projectName)) {
    throw new Error('Project name may contain only letters, digits, dot, underscore, and hyphen');
  }

  const options = {
    projectName,
    moduleName: projectName,
    gorigVersion: DEFAULT_GORIG_VERSION,
    gorigReplace: '',
    port: DEFAULT_PORT,
    force: false,
    start: false,
    git: true,
  };

  let startFlag = '';

  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--force') {
      options.force = true;
      continue;
    }
    if (arg === '--start') {
      options.start = true;
      startFlag = startFlag && startFlag !== arg ? 'conflict' : arg;
      continue;
    }
    if (arg === '--no-start') {
      options.start = false;
      startFlag = startFlag && startFlag !== arg ? 'conflict' : arg;
      continue;
    }
    if (arg === '--no-git') {
      options.git = false;
      continue;
    }

    const valueOptions = ['--module', '--gorig-version', '--gorig-replace', '--port'];
    const optionName = valueOptions.find((name) => arg === name || arg.startsWith(`${name}=`));
    if (!optionName) {
      throw new Error(`Unknown init option: ${arg}`);
    }

    const { value, nextIndex } = readOptionValue(args, i, optionName);
    i = nextIndex;

    if (optionName === '--module') {
      options.moduleName = value;
    } else if (optionName === '--gorig-version') {
      options.gorigVersion = value;
    } else if (optionName === '--gorig-replace') {
      options.gorigReplace = value;
    } else if (optionName === '--port') {
      options.port = Number(value);
    }
  }

  if (startFlag === 'conflict') {
    throw new Error('Use only one of --start or --no-start');
  }
  if (!options.moduleName || /\s/.test(options.moduleName)) {
    throw new Error('Go module name must be non-empty and contain no whitespace');
  }
  if (!options.gorigVersion || options.gorigVersion.startsWith('-')) {
    throw new Error('Gorig version must be a version, commit, branch, or latest');
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65533) {
    throw new Error('Port must be an integer between 1 and 65533');
  }

  return options;
};

const run = async (command, args, cwd) => {
  try {
    return await execFileAsync(command, args, {
      cwd,
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    const detail = error.stderr?.trim() || error.stdout?.trim() || error.message;
    throw new Error(`${command} ${args.join(' ')} failed: ${detail}`);
  }
};

const getGoVersion = async () => {
  const { stdout } = await run('go', ['version'], process.cwd());
  const match = stdout.match(/go version go(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) {
    throw new Error(`Unable to parse Go version: ${stdout.trim()}`);
  }
  return {
    raw: stdout.trim(),
    major: Number(match[1]),
    minor: Number(match[2]),
  };
};

const readGoDirective = async (goModPath) => {
  const content = await fs.readFile(goModPath, 'utf8');
  const match = content.match(/^go\s+(\d+)\.(\d+)(?:\.\d+)?$/m);
  if (!match) {
    return null;
  }
  return { major: Number(match[1]), minor: Number(match[2]), value: `${match[1]}.${match[2]}` };
};

const assertCompatibleGo = (installed, required) => {
  if (!required) {
    return;
  }
  if (installed.major < required.major ||
      (installed.major === required.major && installed.minor < required.minor)) {
    throw new Error(`Gorig requires Go ${required.value}+, but ${installed.raw} is installed`);
  }
};

const configureGorig = async (projectDir, invocationDir, options, installedGo) => {
  if (options.gorigReplace) {
    const source = path.resolve(invocationDir, options.gorigReplace);
    const sourceGoMod = path.join(source, 'go.mod');
    if (!await fs.pathExists(sourceGoMod)) {
      throw new Error(`Gorig replacement does not contain go.mod: ${source}`);
    }

    const requiredGo = await readGoDirective(sourceGoMod);
    assertCompatibleGo(installedGo, requiredGo);

    const requiredVersion = options.gorigVersion === 'latest' ? 'v0.0.0' : options.gorigVersion;
    await run('go', ['mod', 'edit', `-require=github.com/jom-io/gorig@${requiredVersion}`], projectDir);
    await run('go', ['mod', 'edit', `-replace=github.com/jom-io/gorig=${source}`], projectDir);
  } else {
    await run('go', ['get', `github.com/jom-io/gorig@${options.gorigVersion}`], projectDir);
  }

  const { stdout } = await run(
    'go',
    ['list', '-m', '-json', 'github.com/jom-io/gorig'],
    projectDir,
  );
  const moduleInfo = JSON.parse(stdout);
  return {
    version: moduleInfo.Version || options.gorigVersion,
    replacement: moduleInfo.Replace?.Dir || '',
  };
};

const askOverwriteConfirmation = (projectDir) => new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(
    chalk.yellow(`Directory ${chalk.bold(projectDir)} is not empty. Overwrite it? (y/N): `),
    (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    },
  );
});

const prepareProjectDirectory = async (projectDir, force) => {
  if (!await fs.pathExists(projectDir)) {
    await fs.ensureDir(projectDir);
    return;
  }

  const entries = await fs.readdir(projectDir);
  if (entries.length === 0) {
    return;
  }

  let overwrite = force;
  if (!overwrite && process.stdin.isTTY) {
    overwrite = await askOverwriteConfirmation(projectDir);
  }
  if (!overwrite) {
    throw new Error(`Directory is not empty: ${projectDir}. Use --force to replace it.`);
  }

  await fs.remove(projectDir);
  await fs.ensureDir(projectDir);
};

const render = async (templateName, destination, data) => {
  const templatePath = path.join(__dirname, '../templates', templateName);
  const content = await ejs.renderFile(templatePath, data);
  await fs.ensureDir(path.dirname(destination));
  await fs.writeFile(destination, content);
};

const initializeGit = async (projectDir) => {
  try {
    await run('git', ['--version'], projectDir);
    await run('git', ['init'], projectDir);
    console.log(chalk.green('Git repository initialized.'));
  } catch (error) {
    console.log(chalk.yellow(`Skipping Git initialization: ${error.message}`));
  }
};

const startProject = async (projectDir, mode) => new Promise((resolve, reject) => {
  console.log(chalk.blue(`Starting project with GORIG_SYS_MODE=${mode}...`));
  const child = spawn('go', ['run', './_cmd'], {
    cwd: projectDir,
    env: { ...process.env, GORIG_SYS_MODE: mode },
    stdio: 'inherit',
  });
  child.once('error', reject);
  child.once('close', (code, signal) => {
    if (code === 0 || signal === 'SIGINT') {
      resolve();
      return;
    }
    reject(new Error(`Project exited with code ${code ?? 'unknown'}`));
  });
});

export const initProject = async (options, runtime = {}) => {
  const invocationDir = runtime.cwd || process.cwd();
  const projectDir = path.join(invocationDir, options.projectName);
  const projectNameUpper = options.projectName.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const projectPrefix = options.projectName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const installedGo = await getGoVersion();

  console.log(chalk.blue(`Starting project initialization: ${chalk.bold(options.projectName)}`));
  console.log(chalk.green(installedGo.raw));

  await prepareProjectDirectory(projectDir, options.force);
  await Promise.all([
    '_bin',
    '_cmd',
    'domain/hello',
    'global',
    'test/_bin',
  ].map((dir) => fs.ensureDir(path.join(projectDir, dir))));

  await run('go', ['mod', 'init', options.moduleName], projectDir);
  const dependency = await configureGorig(projectDir, invocationDir, options, installedGo);

  for (let index = 0; index < ENVIRONMENTS.length; index += 1) {
    const mode = ENVIRONMENTS[index];
    await render('config.yaml.ejs', path.join(projectDir, '_bin', `${mode}.yaml`), {
      projectNameUpper,
      projectPrefix,
      mode,
      port: options.port + index,
    });
  }

  const commonData = {
    projectName: options.projectName,
    projectNameUpper,
    moduleName: options.moduleName,
    localPort: options.port,
    devPort: options.port + 1,
    prodPort: options.port + 2,
    gorigVersion: dependency.version,
  };

  await Promise.all([
    render('main.go.ejs', path.join(projectDir, '_cmd/main.go'), commonData),
    render('init.go.ejs', path.join(projectDir, 'domain/init.go'), commonData),
    render('hello.router.go.ejs', path.join(projectDir, 'domain/hello/router.go'), commonData),
    render('hello.controller.go.ejs', path.join(projectDir, 'domain/hello/controller.go'), commonData),
    render('hello.service.go.ejs', path.join(projectDir, 'domain/hello/service.go'), commonData),
    render('config.go.ejs', path.join(projectDir, 'global/config.go'), commonData),
    render('hello.test.go.ejs', path.join(projectDir, 'test/hello_test.go'), commonData),
    render('project.README.md.ejs', path.join(projectDir, 'README.md'), commonData),
    render('gitignore.ejs', path.join(projectDir, '.gitignore'), commonData),
    render('config.yaml.ejs', path.join(projectDir, 'test/_bin/local.yaml'), {
      projectNameUpper,
      projectPrefix,
      mode: 'local',
      port: options.port,
    }),
  ]);

  await run('go', ['mod', 'tidy'], projectDir);
  await run('go', ['fmt', './...'], projectDir);
  if (options.git) {
    await initializeGit(projectDir);
  }

  console.log(chalk.green(`Project created at ${projectDir}`));
  console.log(chalk.green(`Gorig version: ${dependency.version}`));
  if (dependency.replacement) {
    console.log(chalk.green(`Gorig replacement: ${dependency.replacement}`));
  }
  console.log(chalk.cyan(`Run: cd ${options.projectName} && GORIG_SYS_MODE=local go run ./_cmd`));
  console.log(chalk.cyan(`Verify: curl 'http://127.0.0.1:${options.port}/ping'`));
  console.log(chalk.cyan(`Verify: curl 'http://127.0.0.1:${options.port}/hello?name=Gorig'`));

  if (options.start) {
    await startProject(projectDir, 'local');
  }

  return { projectDir, dependency };
};

const initModule = async (args) => {
  try {
    const options = parseInitArgs(args);
    await initProject(options);
    return 0;
  } catch (error) {
    console.error(chalk.red('Failed to initialize project:'), chalk.redBright(error.message));
    printUsage();
    process.exitCode = 1;
    return 1;
  }
};

export default initModule;
