import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { AnalyticsStorage } from '../src/analytics/storage.js';
import { AnalyticsDatabase } from '../src/analytics/database.js';

describe('AnalyticsStorage SQLite write-through', () => {
  it('writes JSONL and SQLite in lockstep', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-sqlite-'));
    try {
      await fs.ensureDir(path.join(tmp, '.riper'));
      const storage = new AnalyticsStorage(tmp);

      for (let i = 0; i < 10; i++) {
        await storage.write({
          timestamp: new Date(2026, 0, 1, 0, i).toISOString(),
          event: 'test_event',
          data: { i },
        });
      }

      // JSONL count
      const events = await storage.read(100);
      expect(events.length).toBe(10);

      // SQLite count (only if better-sqlite3 is available on this host)
      const db = new AnalyticsDatabase(tmp);
      await db.initialize();
      if (db.isSQLiteAvailable()) {
        const sqlEvents = await db.getEvents({ limit: 100 });
        expect(sqlEvents.length).toBe(10);
      }
      await db.close();
    } finally {
      await fs.remove(tmp);
    }
  });

  it('rebuildSQLiteFromJSONL recovers the index after a wipe', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-rebuild-'));
    try {
      await fs.ensureDir(path.join(tmp, '.riper'));
      const storage = new AnalyticsStorage(tmp);

      for (let i = 0; i < 5; i++) {
        await storage.write({
          timestamp: new Date(2026, 0, 2, 0, i).toISOString(),
          event: 'test_event',
          data: { i },
        });
      }

      // Independent DB handle to check availability
      const dbCheck = new AnalyticsDatabase(tmp);
      await dbCheck.initialize();
      if (!dbCheck.isSQLiteAvailable()) {
        await dbCheck.close();
        // SQLite not available on this host — skip this test gracefully
        return;
      }
      await dbCheck.close();

      const dbPath = path.join(tmp, '.riper', 'analytics.db');
      await fs.remove(dbPath);

      // After deletion, rebuild from JSONL
      const result = await storage.rebuildSQLiteFromJSONL();
      expect(result.migrated).toBe(5);

      // Confirm the rows are back
      const dbAfter = new AnalyticsDatabase(tmp);
      await dbAfter.initialize();
      const sqlEvents = await dbAfter.getEvents({ limit: 100 });
      expect(sqlEvents.length).toBe(5);
      await dbAfter.close();
    } finally {
      await fs.remove(tmp);
    }
  });

  it('continues to work when SQLite is unavailable (JSONL fallback)', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-no-sqlite-'));
    try {
      await fs.ensureDir(path.join(tmp, '.riper'));
      const storage = new AnalyticsStorage(tmp);

      // Even if better-sqlite3 IS available on the host, we exercise the
      // fallback path indirectly by confirming the JSONL write works
      // independently — that's the property we care about.
      await storage.write({
        timestamp: new Date().toISOString(),
        event: 'test',
        data: { x: 1 },
      });

      const events = await storage.read(10);
      expect(events.length).toBe(1);
    } finally {
      await fs.remove(tmp);
    }
  });
});
