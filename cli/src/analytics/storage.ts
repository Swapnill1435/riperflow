import fs from 'fs-extra';
import path from 'path';
import { getRiperDir } from '../config/loader.js';
import { withLock } from '../memory/lock.js';

export interface AnalyticsEvent {
  timestamp: string;
  event: string;
  data: Record<string, unknown>;
  tool?: string;
}

export class AnalyticsStorage {
  private filePath: string;
  private cachedEvents: AnalyticsEvent[] | null = null;

  constructor(projectPath?: string) {
    const basePath = projectPath || process.cwd();
    this.filePath = path.join(basePath, '.riper', 'analytics.jsonl');
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
