import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { withLock } from '../memory/lock.js';
import { AnalyticsDatabase } from './database.js';

export interface AnalyticsEvent {
  timestamp: string;
  event: string;
  data: Record<string, unknown>;
  tool?: string;
}

let sqliteWarningPrinted = false;

export class AnalyticsStorage {
  private filePath: string;
  private projectPath: string;
  private cachedEvents: AnalyticsEvent[] | null = null;
  private db: AnalyticsDatabase | null = null;
  private dbInitTried: boolean = false;

  constructor(projectPath?: string) {
    this.projectPath = projectPath || process.cwd();
    this.filePath = path.join(this.projectPath, '.riper', 'analytics.jsonl');
  }

  private async ensureDb(): Promise<AnalyticsDatabase | null> {
    if (this.dbInitTried) return this.db;
    this.dbInitTried = true;
    const candidate = new AnalyticsDatabase(this.projectPath);
    try {
      await candidate.initialize();
      if (candidate.isSQLiteAvailable()) {
        this.db = candidate;
      } else if (!sqliteWarningPrinted) {
        sqliteWarningPrinted = true;
        // Only print on a TTY so test runs stay quiet
        if (process.stderr.isTTY) {
          console.error(chalk.gray('  ⓘ better-sqlite3 not loaded — analytics will use JSONL only.'));
        }
      }
    } catch {
      // Silently continue with JSONL only
    }
    return this.db;
  }

  /**
   * Force a fresh read of analytics.jsonl into the in-memory cache. Call
   * before bulk aggregation to ensure subsequent getStats/getModeHistory/
   * getCommandUsage share a single disk pass.
   */
  async snapshot(): Promise<void> {
    this.cachedEvents = null;
    await this.getEvents();
  }

  private async getEvents(): Promise<AnalyticsEvent[]> {
    if (this.cachedEvents) return this.cachedEvents;

    if (!(await fs.pathExists(this.filePath))) {
      this.cachedEvents = [];
      return this.cachedEvents;
    }

    const content = await fs.readFile(this.filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const events: AnalyticsEvent[] = [];
    for (const line of lines) {
      try {
        events.push(JSON.parse(line) as AnalyticsEvent);
      } catch {
        // Skip invalid lines
      }
    }

    this.cachedEvents = events;
    return events;
  }

  async write(event: AnalyticsEvent): Promise<void> {
    await fs.ensureFile(this.filePath);
    const line = JSON.stringify(event) + '\n';

    await withLock(this.filePath, async () => {
      await fs.appendFile(this.filePath, line, 'utf-8');

      // Write-through to SQLite. On any failure, JSONL has the canonical
      // record, so we just continue.
      const db = await this.ensureDb();
      if (db) {
        try {
          await db.recordEvent({
            timestamp: event.timestamp,
            type: event.event,
            data: event.data,
            tool: event.tool,
          });
        } catch {
          // Don't let SQLite hiccups kill an analytics append.
        }
      }
    });

    this.cachedEvents = null; // Invalidate so the next read sees the append
  }

  async read(limit: number = 100, since?: string): Promise<AnalyticsEvent[]> {
    const all = await this.getEvents();
    const filtered = since ? all.filter(e => e.timestamp >= since) : all;
    return filtered.slice(-limit);
  }

  async getStats(): Promise<{
    totalEvents: number;
    modeChanges: number;
    commandsRun: number;
    adaptersInstalled: number;
    mcpActions: number;
    firstEvent: string | null;
    lastEvent: string | null;
  }> {
    const events = await this.getEvents();
    return {
      totalEvents: events.length,
      modeChanges: events.filter(e => e.event === 'mode_change').length,
      commandsRun: events.filter(e => e.event === 'command_run').length,
      adaptersInstalled: events.filter(e => e.event === 'adapter_install').length,
      mcpActions: events.filter(e => e.event.startsWith('mcp_')).length,
      firstEvent: events.length > 0 ? events[0].timestamp : null,
      lastEvent: events.length > 0 ? events[events.length - 1].timestamp : null,
    };
  }

  async getModeHistory(): Promise<Array<{mode: string; timestamp: string; count: number}>> {
    const events = await this.getEvents();
    const modeEvents = events.filter(e => e.event === 'mode_change');

    const modeMap = new Map<string, number>();
    for (const event of modeEvents) {
      const mode = (event.data.toMode as string) || (event.data.mode as string) || 'unknown';
      modeMap.set(mode, (modeMap.get(mode) || 0) + 1);
    }

    return Array.from(modeMap.entries()).map(([mode, count]) => ({
      mode,
      timestamp:
        modeEvents.find(e => (e.data.toMode as string) === mode || (e.data.mode as string) === mode)?.timestamp || '',
      count,
    }));
  }

  async getCommandUsage(): Promise<Array<{command: string; count: number}>> {
    const events = await this.getEvents();
    const commandEvents = events.filter(e => e.event === 'command_run');

    const cmdMap = new Map<string, number>();
    for (const event of commandEvents) {
      const cmd = (event.data.command as string) || 'unknown';
      cmdMap.set(cmd, (cmdMap.get(cmd) || 0) + 1);
    }

    return Array.from(cmdMap.entries()).map(([command, count]) => ({ command, count }));
  }

  async clear(): Promise<void> {
    this.cachedEvents = null;
    if (await fs.pathExists(this.filePath)) {
      await fs.remove(this.filePath);
    }
  }

  getFilePath(): string {
    return this.filePath;
  }

  /**
   * Wipe the SQLite index and rebuild it from the canonical JSONL log.
   * Returns the number of rows inserted. Useful when SQLite was added
   * after JSONL accumulated history, or after a manual JSONL edit.
   */
  async rebuildSQLiteFromJSONL(): Promise<{ migrated: number; errors: number }> {
    // Reset dbInitTried so ensureDb re-initializes against the (possibly
    // newly created) db file after a deletion.
    this.dbInitTried = false;
    this.db = null;
    const db = await this.ensureDb();
    if (!db) return { migrated: 0, errors: 0 };
    return db.migrateFromJSONL(this.filePath);
  }
}

const storageInstances: Map<string, AnalyticsStorage> = new Map();

export function getAnalyticsStorage(projectPath?: string): AnalyticsStorage {
  const resolved = projectPath ?? process.cwd();
  let instance = storageInstances.get(resolved);
  if (!instance) {
    instance = new AnalyticsStorage(resolved);
    storageInstances.set(resolved, instance);
  }
  return instance;
}

export function createAnalyticsStorage(projectPath?: string): AnalyticsStorage {
  return new AnalyticsStorage(projectPath);
}
