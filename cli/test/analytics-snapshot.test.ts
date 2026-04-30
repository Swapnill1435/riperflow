import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { AnalyticsStorage } from '../src/analytics/storage.js';

describe('AnalyticsStorage snapshot cache', () => {
  afterEach(() => vi.restoreAllMocks());

  it('three aggregators share one read after snapshot()', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-snapshot-'));
    try {
      await fs.ensureDir(path.join(tmp, '.riper'));
      const storage = new AnalyticsStorage(tmp);
      // Seed some events
      await storage.write({ timestamp: '2026-01-01T00:00:00Z', event: 'mode_change', data: { toMode: 'execute' } });
      await storage.write({ timestamp: '2026-01-02T00:00:00Z', event: 'command_run', data: { command: 'mode' } });
      await storage.write({ timestamp: '2026-01-03T00:00:00Z', event: 'command_run', data: { command: 'sync' } });

      // Spy on fs.readFile (the underlying module-default — fs-extra wraps node:fs)
      const fsExtra = await import('fs-extra');
      const spy = vi.spyOn(fsExtra.default, 'readFile' as any);

      await storage.snapshot();
      const stats = await storage.getStats();
      const modeHistory = await storage.getModeHistory();
      const cmdUsage = await storage.getCommandUsage();

      expect(spy.mock.calls.length).toBe(1);
      expect(stats.totalEvents).toBe(3);
      expect(modeHistory.length).toBeGreaterThan(0);
      expect(cmdUsage.length).toBeGreaterThan(0);
    } finally {
      await fs.remove(tmp);
    }
  });

  it('write() invalidates the snapshot', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-invalidate-'));
    try {
      await fs.ensureDir(path.join(tmp, '.riper'));
      const storage = new AnalyticsStorage(tmp);
      await storage.write({ timestamp: '2026-01-01T00:00:00Z', event: 'a', data: {} });

      const fsExtra = await import('fs-extra');
      const spy = vi.spyOn(fsExtra.default, 'readFile' as any);

      await storage.snapshot();
      const before = await storage.getStats();
      expect(before.totalEvents).toBe(1);

      // A new write must invalidate the cache
      await storage.write({ timestamp: '2026-01-02T00:00:00Z', event: 'b', data: {} });

      const after = await storage.getStats();
      expect(after.totalEvents).toBe(2);
      // Two reads total: one for the snapshot, one after invalidation
      expect(spy.mock.calls.length).toBe(2);
    } finally {
      await fs.remove(tmp);
    }
  });

  it('aggregators auto-snapshot when no explicit snapshot was taken', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-auto-snap-'));
    try {
      await fs.ensureDir(path.join(tmp, '.riper'));
      const storage = new AnalyticsStorage(tmp);
      await storage.write({ timestamp: '2026-01-01T00:00:00Z', event: 'mode_change', data: { toMode: 'execute' } });

      // No explicit snapshot()
      const stats = await storage.getStats();
      expect(stats.totalEvents).toBe(1);
    } finally {
      await fs.remove(tmp);
    }
  });
});
