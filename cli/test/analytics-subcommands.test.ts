import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { analyticsCommand } from '../src/commands/analytics.js';
import {
  saveConfig,
  getDefaultConfig,
} from '../src/config/loader.js';
import { AnalyticsStorage } from '../src/analytics/storage.js';

async function setupProject(): Promise<string> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-analytics-sub-'));
  await fs.ensureDir(path.join(tmp, '.riper'));
  return tmp;
}

async function captureStdout(fn: () => Promise<unknown>): Promise<string> {
  const chunks: string[] = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  (process.stdout.write as any) = (chunk: any) => {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf-8'));
    return true;
  };
  try {
    await fn();
  } finally {
    process.stdout.write = origWrite as any;
  }
  return chunks.join('');
}

describe('analytics subcommands', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await setupProject();
    vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    await saveConfig({ ...getDefaultConfig(), projectPath: tmp });
    const storage = new AnalyticsStorage(tmp);
    for (let i = 0; i < 3; i++) {
      await storage.write({
        timestamp: new Date(2026, 4, 1, 10, i).toISOString(),
        event: 'command_run',
        data: { command: 'mode' },
      });
    }
  });

  it('export --format json prints valid JSON to stdout', async () => {
    const out = await captureStdout(() => analyticsCommand('export', { format: 'json' }));
    const parsed = JSON.parse(out.trim());
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(3);
    expect(parsed[0].event).toBe('command_run');
  });

  it('export --format csv prints a header + rows', async () => {
    const out = await captureStdout(() => analyticsCommand('export', { format: 'csv' }));
    const lines = out.trim().split('\n');
    expect(lines[0]).toBe('timestamp,event,tool,data');
    expect(lines.length).toBe(4); // header + 3 events
  });

  it('export --output writes to a file', async () => {
    const target = path.join(tmp, 'out.json');
    await analyticsCommand('export', { format: 'json', output: target });
    const content = JSON.parse(await fs.readFile(target, 'utf-8'));
    expect(content.length).toBe(3);
  });

  it('migrate rebuilds SQLite index from JSONL', async () => {
    // Smoke check: invoking should not throw, and should emit a non-error
    // message. SQLite availability is host-dependent.
    const original = console.log;
    let logged = '';
    console.log = (...a: any[]) => { logged += a.join(' ') + '\n'; };
    try {
      await analyticsCommand('migrate', {});
    } finally {
      console.log = original;
    }
    expect(logged.toLowerCase()).toMatch(/migrated|nothing to migrate/);
  });

  it('rejects unknown actions with exit 1', async () => {
    const origExit = process.exit;
    let exitCode: number | null = null;
    process.exit = ((code?: number) => { exitCode = code ?? 0; throw new Error('exit'); }) as any;
    try {
      await analyticsCommand('nonsense', {}).catch(() => {});
    } finally {
      process.exit = origExit;
    }
    expect(exitCode).toBe(1);
  });
});
