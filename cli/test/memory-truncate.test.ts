import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { truncateMemoryBank } from '../src/memory/manager.js';
import { saveConfig, getDefaultConfig, ensureMemoryBank } from '../src/config/loader.js';
import { MEMORY_FILES } from '../src/core/modes.js';

describe('truncateMemoryBank', () => {
  it('trims oversized files and archives the overflow', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-truncate-'));
    const spy = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    try {
      await fs.ensureDir(path.join(tmp, '.riper'));
      await saveConfig({ ...getDefaultConfig(), projectPath: tmp });
      await ensureMemoryBank();

      // Inflate progress.md well beyond its maxSize
      const progressPath = path.join(tmp, 'memory-bank', MEMORY_FILES.progress.filename);
      const filler = 'a'.repeat((MEMORY_FILES.progress.maxSize ?? 3072) * 3);
      await fs.writeFile(progressPath, filler, 'utf-8');

      const results = await truncateMemoryBank();
      const progressResult = results.find(r => r.file === MEMORY_FILES.progress.filename);
      expect(progressResult, 'progress.md should be trimmed').toBeTruthy();
      expect(progressResult!.afterBytes).toBeLessThanOrEqual((MEMORY_FILES.progress.maxSize ?? 3072) + 200);

      // Archive must contain the overflow
      const archivePath = path.join(tmp, '.riper', 'archive', 'progress.md');
      expect(await fs.pathExists(archivePath)).toBe(true);
      const archiveContent = await fs.readFile(archivePath, 'utf-8');
      expect(archiveContent).toContain('archived');

      // Source must contain the trailer pointer
      const sourceAfter = await fs.readFile(progressPath, 'utf-8');
      expect(sourceAfter).toContain('archive/progress.md');
    } finally {
      spy.mockRestore();
      await fs.remove(tmp);
    }
  });

  it('skips files already under the cap', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-truncate-skip-'));
    const spy = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    try {
      await fs.ensureDir(path.join(tmp, '.riper'));
      await saveConfig({ ...getDefaultConfig(), projectPath: tmp });
      await ensureMemoryBank();

      const results = await truncateMemoryBank();
      // Fresh templates fit under maxSize; no truncation should happen.
      expect(results.length).toBe(0);
    } finally {
      spy.mockRestore();
      await fs.remove(tmp);
    }
  });

  it('preserves head content during truncation', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-truncate-head-'));
    const spy = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    try {
      await fs.ensureDir(path.join(tmp, '.riper'));
      await saveConfig({ ...getDefaultConfig(), projectPath: tmp });
      await ensureMemoryBank();

      const progressPath = path.join(tmp, 'memory-bank', MEMORY_FILES.progress.filename);
      const head = '# IMPORTANT HEADING\n\nKey context that must survive.\n\n';
      const overflow = 'x'.repeat((MEMORY_FILES.progress.maxSize ?? 3072) * 3);
      await fs.writeFile(progressPath, head + overflow, 'utf-8');

      await truncateMemoryBank();
      const after = await fs.readFile(progressPath, 'utf-8');
      expect(after).toContain('IMPORTANT HEADING');
    } finally {
      spy.mockRestore();
      await fs.remove(tmp);
    }
  });
});
