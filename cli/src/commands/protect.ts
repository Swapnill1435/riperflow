import chalk from 'chalk';
import { loadConfig } from '../config/loader.js';
import { PROTECTION_LEVELS, getProtection, listProtectionLevels, ProtectionLevel, FileProtection } from '../core/protection.js';
import fs from 'fs-extra';
import path from 'path';
import { withLock } from '../memory/lock.js';

export interface ProtectOptions {
  path?: string;
  level?: string;
  add?: string;
  remove?: string;
  list?: boolean;
}

export async function protectCommand(action?: string, target?: string, level?: string): Promise<void> {
  const config = await loadConfig();
  
  if (!config) {
    console.log(chalk.red('❌ RIPER is not initialized. Run "riper-for-all init" first.'));
    process.exit(1);
  }

  const protectionFile = path.join(config.projectPath, '.riper', 'protection.json');
  let protections: FileProtection[] = [];
  
  if (await fs.pathExists(protectionFile)) {
    protections = await fs.readJson(protectionFile);
  }

  if (!action || action === 'status') {
    showProtectionStatus(protections);
    return;
  }

  switch (action) {
    case 'list':
    case 'ls':
      listProtectionLevelsCmd();
      break;
    
    case 'set':
    case 'add':
      await setProtection(target, level || 'review', protections, protectionFile);
      break;
    
    case 'remove':
    case 'unset':
      await removeProtection(target, protections, protectionFile);
      break;
    
    case 'check':
      await checkProtection(target, protections);
      break;
    
    default:
      console.log(chalk.red(`\n❌ Unknown action: ${action}\n`));
      console.log(chalk.gray('Valid actions: status, list, set, remove, check\n'));
      process.exit(1);
  }
}

function showProtectionStatus(protections: FileProtection[]): void {
  console.log(chalk.bold('\n🛡️ Code Protection\n'));
  
  if (protections.length === 0) {
    console.log(chalk.gray('  No files or directories are protected.\n'));
  } else {
    console.log(chalk.bold('\n  Protected Paths:\n'));
    for (const p of protections) {
      const level = PROTECTION_LEVELS[p.level];
      console.log(`  ${level.emoji} ${p.level.padEnd(10)} ${p.path}`);
    }
    console.log('');
  }
  
  console.log(chalk.bold('💡 Usage:\n'));
  console.log(chalk.gray('  riper-for-all protect              # Show status'));
  console.log(chalk.gray('  riper-for-all protect list        # List levels'));
  console.log(chalk.gray('  riper-for-all protect set <path> <level> # Add protection'));
  console.log(chalk.gray('  riper-for-all protect remove <path>    # Remove protection'));
  console.log(chalk.gray('  riper-for-all protect check <path>    # Check protection\n'));
}

function listProtectionLevelsCmd(): void {
  const levels = listProtectionLevels();
  
  console.log(chalk.bold('\n🛡️ Protection Levels\n'));
  
  for (const level of levels) {
    const write = level.allowsWrite ? chalk.green('✓') : chalk.red('✗');
    const delete_ = level.allowsDelete ? chalk.green('✓') : chalk.red('✗');
    const approve = level.requiresApproval ? chalk.green('✓') : chalk.red('✗');
    
    console.log(`\n  ${level.emoji} ${level.name} (${level.symbol})`);
    console.log(chalk.gray(`    ${level.description}`));
    console.log(chalk.gray(`    Write: ${write}  Delete: ${delete_}  Approval: ${approve}`));
  }
  console.log('');
}

async function setProtection(target: string | undefined, level: string, protections: FileProtection[], protectionFile: string): Promise<void> {
  if (!target) {
    console.log(chalk.red('❌ Please specify a path to protect.'));
    console.log(chalk.gray('Usage: riper-for-all protect set <path> <level>\n'));
    process.exit(1);
  }
  
  const protection = getProtection(level);
  if (!protection) {
    console.log(chalk.red(`\n❌ Unknown protection level: ${level}\n`));
    console.log(chalk.gray('Valid levels: none, warn, confirm, review, locked, frozen\n'));
    process.exit(1);
  }
  
  const existingIndex = protections.findIndex(p => p.path === target);
  if (existingIndex >= 0) {
    protections[existingIndex].level = level as ProtectionLevel;
  } else {
    protections.push({
      path: target,
      level: level as ProtectionLevel,
      allowedRoles: [],
      exceptions: []
    });
  }
  
  await withLock(protectionFile, async () => {
    await fs.writeJson(protectionFile, protections, { spaces: 2 });
  });

  console.log(chalk.green(`\n✓ Set protection for ${target} to ${protection.name}\n`));
}

async function removeProtection(target: string | undefined, protections: FileProtection[], protectionFile: string): Promise<void> {
  if (!target) {
    console.log(chalk.red('❌ Please specify a path to unprotect.'));
    console.log(chalk.gray('Usage: riper-for-all protect remove <path>\n'));
    process.exit(1);
  }
  
  const existingIndex = protections.findIndex(p => p.path === target);
  if (existingIndex < 0) {
    console.log(chalk.yellow(`\n⚠ ${target} is not protected\n`));
    return;
  }
  
  protections.splice(existingIndex, 1);
  await withLock(protectionFile, async () => {
    await fs.writeJson(protectionFile, protections, { spaces: 2 });
  });

  console.log(chalk.green(`\n✓ Removed protection from ${target}\n`));
}

async function checkProtection(target: string | undefined, protections: FileProtection[]): Promise<void> {
  if (!target) {
    console.log(chalk.red('❌ Please specify a path to check.\n'));
    process.exit(1);
  }
  
  const protection = protections.find(p => target.startsWith(p.path));
  
  if (!protection) {
    console.log(chalk.yellow(`\n⚠ ${target} is not protected\n`));
    return;
  }
  
  const level = PROTECTION_LEVELS[protection.level];
  console.log(chalk.bold(`\n🛡️ Protection: ${level.name}\n`));
  console.log(`  Path: ${protection.path}`);
  console.log(`  Level: ${level.emoji} ${level.description}`);
  console.log(`  Write:    ${level.allowsWrite ? chalk.green('✓ Allowed') : chalk.red('✗ Denied')}`);
  console.log(`  Delete:   ${level.allowsDelete ? chalk.green('✓ Allowed') : chalk.red('✗ Denied')}`);
  console.log(`  Approval: ${level.requiresApproval ? chalk.green('✓ Required') : chalk.red('✗ Not required')}`);
  console.log('');
}
