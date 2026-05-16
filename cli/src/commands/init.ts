import chalk from 'chalk';
import inquirer from 'inquirer';
import { ensureDirectories, loadConfig, saveConfig, getDefaultConfig, ensureMemoryBank, initializeState } from '../config/loader.js';
import { detectTools } from '../utils/detection.js';
import { MEMORY_FILES } from '../core/modes.js';
import { getMemoryBankDir } from '../config/loader.js';
import fs from 'fs-extra';
import path from 'node:path';

interface InitOptions {
  tools?: string;
  yes?: boolean;
}

export async function initCommand(options: InitOptions): Promise<void> {
  console.log(chalk.cyan.bold('\n🚀 Initializing RIPER-for-All...\n'));

  // Non-TTY (CI, pipes, Docker, scripted demo recording) cannot answer
  // inquirer prompts. Fall back to default answers instead of crashing
  // with ERR_USE_AFTER_CLOSE deep inside readline.
  if (!options.yes && !process.stdin.isTTY) {
    console.log(chalk.gray('No TTY detected — using default answers (equivalent to `--yes`).'));
    options.yes = true;
  }

  // Check if already initialized
  const existingConfig = await loadConfig();
  if (existingConfig) {
    console.log(chalk.yellow('⚠ RIPER is already initialized in this project!'));
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'Do you want to reinitialize? This will overwrite existing config.',
        default: false
      }
    ]);
    
    if (!overwrite) {
      console.log(chalk.gray('Initialization cancelled.'));
      return;
    }
  }

  // Detect available tools
  const detectedTools = await detectTools();
  const detectedToolNames = detectedTools.map(t => t.name);

  // Get tools to configure
  let selectedTools: string[];
  
  if (options.tools) {
    selectedTools = options.tools.split(',').map(t => t.trim().toLowerCase());
  } else if (options.yes) {
    selectedTools = ['cursor', 'claudeCode', 'opencode'];
  } else {
    const { tools } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'tools',
        message: 'Select AI coding tools to configure:',
        choices: [
          { name: 'Cursor IDE', value: 'cursor', checked: true },
          { name: 'Claude Code', value: 'claudeCode', checked: true },
          { name: 'OpenCode', value: 'opencode', checked: true },
          { name: 'KiloCode', value: 'kilocode', checked: false },
          { name: 'VS Code', value: 'vscode', checked: false },
          { name: 'Roo Code', value: 'roo', checked: false },
          { name: 'Aider', value: 'aider', checked: false },
          { name: 'Windsurf', value: 'windsurf', checked: false },
          { name: 'Cline', value: 'cline', checked: false },
          { name: 'Codex CLI', value: 'codex', checked: false }
        ]
      }
    ]);
    selectedTools = tools;
  }

  // Get project name
  const projectName = options.yes ? 'my-project' : await getProjectName();

  // Create config
  const config = getDefaultConfig();
  config.projectName = projectName;
  config.projectPath = process.cwd();
  
  // Enable selected tools
  for (const tool of selectedTools) {
    if (config.tools[tool] !== undefined) {
      config.tools[tool] = true;
    }
  }

  console.log(chalk.cyan('\n📁 Creating project structure...'));
  
  // Ensure directories exist
  await ensureDirectories();
  
  // Save config
  await saveConfig(config);
  console.log(chalk.green('✓ Config saved'));

  // Initialize memory bank
  console.log(chalk.cyan('\n📋 Creating memory bank...'));
  await ensureMemoryBank();
  
  // Show created files
  const memoryDir = getMemoryBankDir();
  console.log(chalk.gray(`  Memory bank location: ${memoryDir}`));
  
  for (const [key, file] of Object.entries(MEMORY_FILES)) {
    console.log(chalk.gray(`  - ${file.emoji} ${file.filename}`));
  }

  // Initialize state
  console.log(chalk.cyan('\n🔄 Initializing workflow state...'));
  await initializeState();

  console.log(chalk.green.bold('\n✅ RIPER-for-All initialized successfully!\n'));
  
  console.log(chalk.cyan('Next steps:'));
  console.log(chalk.gray('  1. Switch to a mode:'));
  console.log(chalk.gray('     riper-for-all mode research'));
  console.log(chalk.gray('     or use shortcuts: r, i, p, e, rev'));
  console.log(chalk.gray(''));
  console.log(chalk.gray('  2. Open dashboard:'));
  console.log(chalk.gray('     riper-for-all dashboard'));
  console.log(chalk.gray(''));
  console.log(chalk.gray('  3. Check status:'));
  console.log(chalk.gray('     riper-for-all status\n'));
}

async function getProjectName(): Promise<string> {
  const packageJsonPath = process.cwd() + '/package.json';
  
  if (await fs.pathExists(packageJsonPath)) {
    try {
      const pkg = await fs.readJson(packageJsonPath);
      if (pkg.name) {
        return pkg.name;
      }
    } catch {
      // Ignore
    }
  }

  const { name } = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Project name:',
      default: path.basename(process.cwd()) || 'my-project',
      validate: (input: string) => input.length > 0 || 'Name is required'
    }
  ]);
  
  return name;
}
