import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { configCommand } from '../src/commands/config.js';
import { saveConfig, getDefaultConfig, loadConfig } from '../src/config/loader.js';

async function runWithExitGuard(fn: () => Promise<unknown>) {
  let exitCode: number | null = null;
  const lines: string[] = [];
  const origExit = process.exit;
  const origLog = console.log;
  process.exit = ((code?: number) => { exitCode = code ?? 0; throw new Error(`exit:${code}`); }) as any;
  console.log = (...args: any[]) => lines.push(args.join(' '));
  try {
    await fn().catch((e) => {
      if (!(e instanceof Error) || !e.message.startsWith('exit:')) throw e;
    });
  } finally {
    process.exit = origExit;
    console.log = origLog;
  }
  return { exitCode, output: lines.join('\n') };
}

describe('config set coercion', () => {
  it.each([
    ['telemetry.enabled', 'false', false],
    ['telemetry.anonymous', 'true', true],
    ['backup.auto', 'no', false],
    ['backup.maxBackups', '7', 7],
    ['dashboard.port', '4000', 4000],
    ['memory.format', 'markdown', 'markdown'],
    ['backup.interval', 'weekly', 'weekly'],
  ])('config set %s %s coerces to %o', async (key, raw, expected) => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-config-set-'));
    const spy = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    try {
      await fs.ensureDir(path.join(tmp, '.riper'));
      await saveConfig(getDefaultConfig());
      await configCommand('set', key, raw);
      const cfg = await loadConfig();
      const actual = key.split('.').reduce<any>((acc, p) => acc?.[p], cfg);
      expect(actual).toStrictEqual(expected);
    } finally {
      spy.mockRestore();
      await fs.remove(tmp);
    }
  });

  it('rejects unknown keys with exit 1', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-config-set-'));
    const spy = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    try {
      await fs.ensureDir(path.join(tmp, '.riper'));
      await saveConfig(getDefaultConfig());
      const { exitCode, output } = await runWithExitGuard(() =>
        configCommand('set', 'nonsense.field', 'x')
      );
      expect(exitCode).toBe(1);
      expect(output).toMatch(/unknown.*key|invalid/i);
    } finally {
      spy.mockRestore();
      await fs.remove(tmp);
    }
  });

  it('rejects malformed numbers with exit 1', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-config-set-'));
    const spy = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    try {
      await fs.ensureDir(path.join(tmp, '.riper'));
      await saveConfig(getDefaultConfig());
      const { exitCode } = await runWithExitGuard(() =>
        configCommand('set', 'backup.maxBackups', 'not-a-number')
      );
      expect(exitCode).toBe(1);
    } finally {
      spy.mockRestore();
      await fs.remove(tmp);
    }
  });
});
