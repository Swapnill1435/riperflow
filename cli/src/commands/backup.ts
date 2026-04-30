import chalk from 'chalk';
import { loadConfig } from '../config/loader.js';
import { getRiperDir, getMemoryBankDir } from '../config/loader.js';
import fs from 'fs-extra';
import path from 'path';
import { withLock } from '../memory/lock.js';

const MAX_BACKUPS = 10;

function getBackupsDir(): string {
  return path.join(getRiperDir(), 'backups');
}

/**
 * Internal helper: perform the actual copy+cleanup without acquiring any lock.
 * Callers that already hold a lock on `filePath` (e.g. saveConfig/saveState)
 * should use this directly to avoid a deadlock.
 */
export async function _doBackupCopy(filePath: string, silent: boolean = false): Promise<string | null> {
  if (!(await fs.pathExists(filePath))) {
    return null;
  }

  const backupsDir = getBackupsDir();
  await fs.ensureDir(backupsDir);

  const filename = path.basename(filePath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilename = `${filename}.${timestamp}.bak`;
  const backupPath = path.join(backupsDir, backupFilename);

  await fs.copy(filePath, backupPath);
  await cleanupOldBackups(filename, backupsDir);

  if (!silent) {
    console.log(chalk.gray(`  📦 Backed up: ${filename}`));
  }

  return backupPath;
}

/**
 * Public function: backs up `filePath` to the backups directory under an
 * exclusive lock on the source file so a concurrent writer cannot update it
 * mid-copy.  Stand-alone callers (e.g. the `riper-for-all backup` command)
 * should use this.  saveConfig/saveState hold their own lock and call
 * _doBackupCopy directly.
 */
export async function autoBackupFile(filePath: string, silent: boolean = false): Promise<string | null> {
  try {
    return await withLock(filePath, () => _doBackupCopy(filePath, silent));
  } catch (error) {
    if (!silent) {
      console.log(chalk.yellow(`  ⚠️  Backup failed for: ${path.basename(filePath)}`));
    }
    return null;
  }
}

async function cleanupOldBackups(filename: string, backupsDir: string): Promise<void> {
  try {
    const files = await fs.readdir(backupsDir);
    const backupFiles = files
      .filter(f => f.startsWith(`${filename}.`) && f.endsWith('.bak'))
      .sort()
      .reverse();

    if (backupFiles.length > MAX_BACKUPS) {
      const toDelete = backupFiles.slice(MAX_BACKUPS);
      for (const file of toDelete) {
        await fs.remove(path.join(backupsDir, file));
      }
    }
  } catch (error) {
    // Silent fail
  }
}

export async function listBackups(): Promise<string[]> {
  const backupsDir = getBackupsDir();
  
  if (!(await fs.pathExists(backupsDir))) {
    return [];
  }

  const files = await fs.readdir(backupsDir);
  return files
    .filter(f => f.endsWith('.bak'))
    .sort()
    .reverse();
}

export async function backupCommand(options: any): Promise<void> {
  const config = await loadConfig();
  
  if (!config) {
    console.log(chalk.red('❌ RIPER is not initialized.'));
    process.exit(1);
  }

  const backupsDir = getBackupsDir();
  await fs.ensureDir(backupsDir);

  if (options.list) {
    console.log(chalk.bold('\n📦 Available Backups\n'));
    const backups = await fs.readdir(backupsDir);
    const backupFiles = backups.filter(f => f.endsWith('.bak')).sort().reverse();
    
    if (backupFiles.length === 0) {
      console.log(chalk.yellow('  No backups found'));
    } else {
      for (const backup of backupFiles) {
        console.log(chalk.gray(`  - ${backup}`));
      }
    }
    console.log(chalk.gray('\n💡 Tip: Use riper-for-all restore -b <backup-file> to restore\n'));
    return;
  }

  // Manual backup of all critical files
  const memoryBankDir = getMemoryBankDir();
  const riperDir = getRiperDir();
  
  console.log(chalk.cyan(`\n📦 Creating manual backup...\n`));
  
  const dirsToBackup = [memoryBankDir, riperDir];
  let backupCount = 0;

  for (const dir of dirsToBackup) {
    if (await fs.pathExists(dir)) {
      const files = await fs.readdir(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = await fs.stat(filePath);
        if (stat.isFile() && !file.endsWith('.bak')) {
          const result = await autoBackupFile(filePath);
          if (result) {
            backupCount++;
          }
        }
      }
    }
  }

  console.log(chalk.green(`\n✅ Created ${backupCount} backup(s)\n`));
  console.log(chalk.gray(`📁 Backups location: ${backupsDir}\n`));
}
