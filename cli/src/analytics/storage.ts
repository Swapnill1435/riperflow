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

  constructor(projectPath?: string) {
    const basePath = projectPath || process.cwd();
    this.filePath = path.join(basePath, '.riper', 'analytics.jsonl');
  }

  async write(event: AnalyticsEvent): Promise<void> {
    await fs.ensureFile(this.filePath);
    const line = JSON.stringify(event) + '\n';
    await withLock(this.filePath, async () => {
      await fs.appendFile(this.filePath, line, 'utf-8');
    });
  }

  async read(limit: number = 100, since?: string): Promise<AnalyticsEvent[]> {
    if (!await fs.pathExists(this.filePath)) {
      return [];
    }

    const content = await fs.readFile(this.filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    
    const events: AnalyticsEvent[] = [];
    for (const line of lines) {
      try {
        const event = JSON.parse(line) as AnalyticsEvent;
        if (since && event.timestamp < since) continue;
        events.push(event);
      } catch {
        // Skip invalid lines
      }
    }

    return events.slice(-limit);
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
    const events = await this.read(10000);
    
    return {
      totalEvents: events.length,
      modeChanges: events.filter(e => e.event === 'mode_change').length,
      commandsRun: events.filter(e => e.event === 'command_run').length,
      adaptersInstalled: events.filter(e => e.event === 'adapter_install').length,
      mcpActions: events.filter(e => e.event.startsWith('mcp_')).length,
      firstEvent: events.length > 0 ? events[0].timestamp : null,
      lastEvent: events.length > 0 ? events[events.length - 1].timestamp : null
    };
  }

  async getModeHistory(): Promise<Array<{mode: string; timestamp: string; count: number}>> {
    const events = await this.read(10000);
    const modeEvents = events.filter(e => e.event === 'mode_change');
    
    const modeMap = new Map<string, number>();
    for (const event of modeEvents) {
      const mode = event.data.toMode as string || event.data.mode as string || 'unknown';
      modeMap.set(mode, (modeMap.get(mode) || 0) + 1);
    }

    return Array.from(modeMap.entries()).map(([mode, count]) => ({
      mode,
      timestamp: modeEvents.find(e => (e.data.toMode as string) === mode || (e.data.mode as string) === mode)?.timestamp || '',
      count
    }));
  }

  async getCommandUsage(): Promise<Array<{command: string; count: number}>> {
    const events = await this.read(10000);
    const commandEvents = events.filter(e => e.event === 'command_run');
    
    const cmdMap = new Map<string, number>();
    for (const event of commandEvents) {
      const cmd = event.data.command as string || 'unknown';
      cmdMap.set(cmd, (cmdMap.get(cmd) || 0) + 1);
    }

    return Array.from(cmdMap.entries()).map(([command, count]) => ({ command, count }));
  }

  async clear(): Promise<void> {
    if (await fs.pathExists(this.filePath)) {
      await fs.remove(this.filePath);
    }
  }

  getFilePath(): string {
    return this.filePath;
  }
}

let storageInstance: AnalyticsStorage | null = null;

export function getAnalyticsStorage(projectPath?: string): AnalyticsStorage {
  if (!storageInstance) {
    storageInstance = new AnalyticsStorage(projectPath);
  }
  return storageInstance;
}

export function createAnalyticsStorage(projectPath?: string): AnalyticsStorage {
  return new AnalyticsStorage(projectPath);
}
