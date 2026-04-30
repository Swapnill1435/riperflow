import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { sync } from '../src/commands/sync.js';
import { saveConfig, getDefaultConfig, ensureMemoryBank } from '../src/config/loader.js';

describe('sync', () => {
  it('regenerates rule files for every enabled adapter', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-sync-'));
    const spy = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    try {
      await fs.ensureDir(path.join(tmp, '.riper'));
      const cfg = getDefaultConfig();
      // Enable a known subset
      cfg.tools = { cursor: true, 'claude-code': true, kilocode: false };
      await saveConfig(cfg);
      await ensureMemoryBank();

      const result = await sync({ dryRun: false });
      // Filter writes by tool root
      const cursorWrites = result.updated.filter(p => p.includes('/.cursor/'));
      const claudeWrites = result.updated.filter(p => p.includes('/.claude/'));
      const kiloWrites = result.updated.filter(p => p.includes('/.kilocode/'));
      expect(cursorWrites.length, 'cursor regenerated').toBeGreaterThan(0);
      expect(claudeWrites.length, 'claude-code regenerated').toBeGreaterThan(0);
      expect(kiloWrites.length, 'kilocode disabled').toBe(0);
      // The reported files actually exist on disk
      for (const f of result.updated) {
        expect(await fs.pathExists(f), `expected ${f} on disk`).toBe(true);
      }
    } finally {
      spy.mockRestore();
      await fs.remove(tmp);
    }
  });

  it('--dry-run reports targets but writes nothing', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-sync-dry-'));
    const spy = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    try {
      await fs.ensureDir(path.join(tmp, '.riper'));
      const cfg = getDefaultConfig();
      cfg.tools = { cursor: true };
      await saveConfig(cfg);
      await ensureMemoryBank();

      const result = await sync({ dryRun: true });
      expect(result.updated.length).toBeGreaterThan(0);
      // None of the reported files should exist (dry-run)
      for (const f of result.updated) {
        expect(await fs.pathExists(f), `dry-run should not have created ${f}`).toBe(false);
      }
    } finally {
      spy.mockRestore();
      await fs.remove(tmp);
    }
  });

  it('emits a sync analytics event with updated/skipped/dryRun fields', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-sync-analytics-'));
    const spy = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    try {
      await fs.ensureDir(path.join(tmp, '.riper'));
      const cfg = getDefaultConfig();
      cfg.tools = { cursor: true };
      await saveConfig(cfg);
      await ensureMemoryBank();

      await sync({ dryRun: false });

      const log = path.join(tmp, '.riper', 'analytics.jsonl');
      expect(await fs.pathExists(log)).toBe(true);
      const lines = (await fs.readFile(log, 'utf-8')).trim().split('\n').filter(Boolean);
      const events = lines.map(l => JSON.parse(l));
      const syncEvent = events.find(e => e.event === 'sync');
      expect(syncEvent, 'sync event recorded').toBeTruthy();
      expect(syncEvent.data.updated).toBeGreaterThan(0);
      expect(syncEvent.data.skipped).toBe(0);
      expect(syncEvent.data.dryRun).toBe(false);
    } finally {
      spy.mockRestore();
      await fs.remove(tmp);
    }
  });

  it('skips disabled and unknown tool ids gracefully', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-sync-skip-'));
    const spy = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    try {
      await fs.ensureDir(path.join(tmp, '.riper'));
      const cfg = getDefaultConfig();
      cfg.tools = { cursor: false, fakeTool: true } as any;
      await saveConfig(cfg);
      await ensureMemoryBank();

      const result = await sync({ dryRun: false });
      expect(result.updated.length).toBe(0);
      expect(result.skipped).toContain('fakeTool');
    } finally {
      spy.mockRestore();
      await fs.remove(tmp);
    }
  });
});
