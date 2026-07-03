import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SKILL_NAME = 'gorig-backend';
const VALID_TARGETS = new Set(['codex', 'claude', 'all']);
const VALID_SCOPES = new Set(['user', 'project']);

const printUsage = () => {
  console.log(chalk.yellow('Usage: gorig-cli skill install <codex|claude|all> [user|project]'));
};

export const resolveInstalls = (target, scope, options = {}) => {
  const cwd = options.cwd || process.cwd();
  const home = options.home || os.homedir();
  const templateRoot = options.templateRoot || path.join(__dirname, '../templates/skills');
  const source = path.join(templateRoot, SKILL_NAME);
  const installs = [];

  if (target === 'codex' || target === 'all') {
    const codexBase = scope === 'project'
      ? path.join(cwd, '.agents')
      : path.join(home, '.agents');

    installs.push({
      label: `Codex (${scope})`,
      source,
      destination: path.join(codexBase, 'skills', SKILL_NAME),
    });
  }

  if (target === 'claude' || target === 'all') {
    const claudeBase = scope === 'project'
      ? path.join(cwd, '.claude')
      : path.join(home, '.claude');

    installs.push({
      label: `Claude (${scope})`,
      source,
      destination: path.join(claudeBase, 'skills', SKILL_NAME),
    });
  }

  return installs;
};

export const installSkill = async (target, scope, options = {}) => {
  const installs = resolveInstalls(target, scope, options);

  for (const install of installs) {
    const exists = await fs.pathExists(install.source);
    if (!exists) {
      throw new Error(`Skill template not found: ${install.source}`);
    }
  }

  const staged = [];

  try {
    for (const install of installs) {
      const temporary = `${install.destination}.tmp-${process.pid}-${Date.now()}`;
      await fs.remove(temporary);
      await fs.ensureDir(path.dirname(temporary));
      await fs.copy(install.source, temporary, { overwrite: true });
      staged.push({ ...install, temporary });
    }

    for (const install of staged) {
      await fs.ensureDir(path.dirname(install.destination));
      await fs.remove(install.destination);
      await fs.move(install.temporary, install.destination);
      console.log(chalk.green(`Installed ${install.label} skill to ${install.destination}`));
    }
  } catch (error) {
    await Promise.all(staged.map(({ temporary }) => fs.remove(temporary)));
    throw error;
  }

  return installs;
};

const skillModule = async (args) => {
  const action = args[0];

  if (!action) {
    printUsage();
    process.exitCode = 1;
    return 1;
  }

  if (action !== 'install') {
    console.error(chalk.red(`Unknown skill action: ${action}`));
    printUsage();
    process.exitCode = 1;
    return 1;
  }

  const target = args[1] || 'all';
  const scope = args[2] || 'user';

  if (!VALID_TARGETS.has(target)) {
    console.error(chalk.red(`Unknown skill target: ${target}`));
    printUsage();
    process.exitCode = 1;
    return 1;
  }

  if (!VALID_SCOPES.has(scope)) {
    console.error(chalk.red(`Unknown skill scope: ${scope}`));
    printUsage();
    process.exitCode = 1;
    return 1;
  }

  try {
    await installSkill(target, scope);
    return 0;
  } catch (error) {
    console.error(chalk.red('Failed to install skill:'), chalk.redBright(error.message));
    process.exitCode = 1;
    return 1;
  }
};

export default skillModule;
