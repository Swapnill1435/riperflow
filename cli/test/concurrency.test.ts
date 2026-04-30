import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { AnalyticsStorage } from '../src/analytics/storage.js';
import { saveState, loadState, getDefaultState } from '../src/config/loader.js';

describe('concurrent writes', () => {
  it('analytics write survives 50 concurrent calls without lost events', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-concurrency-'));
    try {
      // AnalyticsStorage takes projectPath; ensure .riper exists
      await fs.ensureDir(path.join(tmp, '.riper'));
      const storage = new AnalyticsStorage(tmp);
      await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          storage.write({
            timestamp: new Date().toISOString(),
            event: 'cmd',
            data: { i }
          })
        )
      );
      const events = await storage.read(100);
      expect(events.length).toBe(50);
      // Each i value 0..49 must appear exactly once — proves no torn writes
      const seen = new Set(events.map((e: any) => e.data?.i));
      expect(seen.size).toBe(50);
    } finally {
      await fs.remove(tmp);
    }
  });

  it('saveState survives 30 concurrent writers', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-state-conc-'));
    try {
      await fs.ensureDir(path.join(tmp, '.riper'));
      // Redirect process.cwd() so loader uses our temp directory
      const spy = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
      try {
        await Promise.all(
          Array.from({ length: 30 }, (_, i) =>
            saveState({ ...getDefaultState(), lastModeChange: `iter-${i}` } as any)
          )
        );
        const final = await loadState();
        expect(final).not.toBeNull();
        // The last-write-wins value must be one of the 30 — proves the file is well-formed
        expect(typeof final!.lastModeChange).toBe('string');
        expect(final!.lastModeChange).toMatch(/^iter-\d+$/);
      } finally {
        spy.mockRestore();
      }
    } finally {
      await fs.remove(tmp);
    }
  });
});
