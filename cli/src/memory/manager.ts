import fs from 'fs-extra';
import path from 'path';
import { getMemoryBankDir, getRiperDir } from '../config/loader.js';
import { MEMORY_FILES } from '../core/modes.js';
import { autoBackupFile, _doBackupCopy } from '../commands/backup.js';
import { withLock } from './lock.js';

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

export interface TruncateResult {
  file: string;
  beforeBytes: number;
  afterBytes: number;
  archivedBytes: number;
}

/**
 * For every MEMORY_FILES entry whose source on disk exceeds its maxSize,
 * append the overflow to .riper/archive/<key>.md and rewrite the source
 * with the head trimmed to maxSize plus a trailer pointing at the archive.
 *
 * Returns one entry per file actually trimmed; files under their cap are
 * skipped silently.
 */
export async function truncateMemoryBank(): Promise<TruncateResult[]> {
  const bankDir = getMemoryBankDir();
  const archiveDir = path.join(getRiperDir(), 'archive');
  await fs.ensureDir(archiveDir);

  const results: TruncateResult[] = [];

  for (const [key, file] of Object.entries(MEMORY_FILES)) {
    const max = file.maxSize ?? 0;
    if (!max) continue;

    const sourcePath = path.join(bankDir, file.filename);
    if (!(await fs.pathExists(sourcePath))) continue;

    const stat = await fs.stat(sourcePath);
    if (stat.size <= max) continue;

    await withLock(sourcePath, async () => {
      // Re-stat under lock so we don't race with a concurrent writer
      const statLocked = await fs.stat(sourcePath);
      if (statLocked.size <= max) return;

      const content = await fs.readFile(sourcePath, 'utf-8');
      // Trim to maxSize bytes at a paragraph boundary if possible
      const head = content.slice(0, max);
      const lastBreak = head.lastIndexOf('\n\n');
      const splitAt = lastBreak > max * 0.6 ? lastBreak : max;
      const trimmedHead = content.slice(0, splitAt);
      const overflow = content.slice(splitAt);

      // Append to archive (use timestamp marker to keep history readable)
      const archivePath = path.join(archiveDir, `${key}.md`);
      const stamp = new Date().toISOString();
      const archiveBlock = `\n<!-- archived ${stamp} from ${file.filename} (${overflow.length} bytes) -->\n${overflow}\n`;
      await fs.ensureFile(archivePath);
      await fs.appendFile(archivePath, archiveBlock, 'utf-8');

      // Rewrite the source with the trimmed head + trailer
      const trailer = `\n\n<!-- earlier content moved to .riper/archive/${key}.md (${stamp}) -->\n`;
      // Use _doBackupCopy (no lock) — we already hold the lock on sourcePath;
      // calling autoBackupFile here would re-acquire it and deadlock.
      await _doBackupCopy(sourcePath, true);
      await fs.writeFile(sourcePath, trimmedHead + trailer, 'utf-8');

      results.push({
        file: file.filename,
        beforeBytes: statLocked.size,
        afterBytes: trimmedHead.length + trailer.length,
        archivedBytes: archiveBlock.length,
      });
    });
  }

  return results;
}

