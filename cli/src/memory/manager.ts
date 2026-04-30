import fs from 'fs-extra';
import path from 'path';
import { getMemoryBankDir } from '../config/loader.js';
import { MEMORY_FILES } from '../core/modes.js';
import { autoBackupFile } from '../commands/backup.js';

export async function readMemoryFile(filename: string): Promise<string> {
  const filePath = path.join(getMemoryBankDir(), filename);
  
  if (!(await fs.pathExists(filePath))) {
    throw new Error(`Memory file not found: ${filename}`);
  }
  
  return await fs.readFile(filePath, 'utf-8');
}

export async function writeMemoryFile(filename: string, content: string): Promise<void> {
  const filePath = path.join(getMemoryBankDir(), filename);
  await autoBackupFile(filePath, true);
  await fs.writeFile(filePath, content, 'utf-8');
}

export async function updateMemoryFile(filename: string, update: (content: string) => string): Promise<void> {
  const content = await readMemoryFile(filename);
  const updated = update(content);
  await writeMemoryFile(filename, updated);
}

export async function getAllMemoryFiles(): Promise<Record<string, string>> {
  const memoryDir = getMemoryBankDir();
  const files: Record<string, string> = {};
  
  for (const [key, file] of Object.entries(MEMORY_FILES)) {
    const filePath = path.join(memoryDir, file.filename);
    if (await fs.pathExists(filePath)) {
      files[key] = await fs.readFile(filePath, 'utf-8');
    }
  }
  
  return files;
}

