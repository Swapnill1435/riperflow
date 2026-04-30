import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { autoBackupFile } from '../src/commands/backup.js';
import { saveConfig, getDefaultConfig } from '../src/config/loader.js';

describe('autoBackupFile retention', () => {
  it('retains exactly config.backup.maxBackups files per source', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-maxbackups-'));
    const spy = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    try {
      await fs.ensureDir(path.join(tmp, '.riper'));
      const cfg = getDefaultConfig();
      cfg.backup.maxBackups = 3;
      await saveConfig(cfg);

      const source = path.join(tmp, '.riper', 'state.json');
      await fs.writeJson(source, { v: 0 });
      // Take 7 backups serially with a tiny pause so timestamps differ
      for (let i = 0; i < 7; i++) {
        await autoBackupFile(source, true);
        await new Promise(r => setTimeout(r, 10));
      }

      const backupsDir = path.join(tmp, '.riper', 'backups');
      const baks = (await fs.readdir(backupsDir)).filter(f => f.startsWith('state.json.') && f.endsWith('.bak'));
      expect(baks.length).toBe(3);
    } finally {
      spy.mockRestore();
      await fs.remove(tmp);
    }
  });

  it('falls back to a sensible default when config is missing', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-maxbackups-default-'));
    const spy = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    try {
      await fs.ensureDir(path.join(tmp, '.riper'));
      const source = path.join(tmp, '.riper', 'state.json');
      await fs.writeJson(source, { v: 0 });
      // No config saved; loadConfig() returns null. cleanupOldBackups should
      // fall through to the schema default (10).
      for (let i = 0; i < 12; i++) {
        await autoBackupFile(source, true);
        await new Promise(r => setTimeout(r, 5));
      }

      const backupsDir = path.join(tmp, '.riper', 'backups');
      const baks = (await fs.readdir(backupsDir)).filter(f => f.startsWith('state.json.') && f.endsWith('.bak'));
      expect(baks.length).toBe(10);
    } finally {
      spy.mockRestore();
      await fs.remove(tmp);
    }
  });
});
