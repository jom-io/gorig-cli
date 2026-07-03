#!/usr/bin/env node

import chalk from 'chalk';
import path from 'path';

// Get command line arguments
const args = process.argv.slice(2);

// Validate if a command is provided
if (args.length < 1) {
  console.error(chalk.red('Please provide a valid command, e.g.: create, init, doc, or skill'));
  process.exit(1);
}

// Extract command
const command = args[0];

// Get current file directory
const __dirname = path.dirname(new URL(import.meta.url).pathname);

// Execute different logic based on command
switch (command) {
  case 'create':
    // Dynamically import create.js, commands are placed in the commands directory
    import(path.join(__dirname, '../commands/create.js')).then(module => {
      const createModule = module.default;
      createModule(args.slice(1));  // Pass other command line arguments to create.js
    }).catch(error => {
      console.error(chalk.red('Failed to load create command module:', error.message));
    });
    break;

  case 'init':
    // Dynamically import init.js
    import(path.join(__dirname, '../commands/init.js')).then(module => {
      const initModule = module.default;
      initModule(args.slice(1));  // Pass other command line arguments to init.js
    }).catch(error => {
      console.error(chalk.red('Failed to load init command module:', error.message));
    });
    break;
  case 'doc':
    import(path.join(__dirname, '../commands/doc.js')).then(module => {
      const docModule = module.default;
      docModule();  // Execute doc command
    }).catch(error => {
      console.error(chalk.red('Failed to load doc command module:', error.message));
    });
    break;

  case 'skill':
    import(path.join(__dirname, '../commands/skill.js')).then(module => {
      const skillModule = module.default;
      skillModule(args.slice(1));
    }).catch(error => {
      console.error(chalk.red('Failed to load skill command module:', error.message));
    });
    break;

  default:
    console.error(chalk.red(`Unknown command: ${command}`));
    console.error(chalk.yellow('Available commands: create, init, doc, skill'));
    process.exit(1);
}
