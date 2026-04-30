import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { gateCommand } from '../src/commands/gate.js';
import {
  saveState,
  getDefaultState,
  saveConfig,
  getDefaultConfig,
  loadState,
} from '../src/config/loader.js';

async function setupProject(role: string): Promise<string> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-gate-approve-'));
  await fs.ensureDir(path.join(tmp, '.riper'));
  const spy = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
  try {
    await saveConfig(getDefaultConfig());
    await saveState({
      ...getDefaultState(),
      currentMode: 'execute',
      currentRole: role as any,
    });
  } finally {
    spy.mockRestore();
  }
  return tmp;
}

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

describe('gate approve authorization', () => {
  it('blocks approval when current role is not in requiredApprovals', async () => {
    // dev is not a required approver for the design gate (po, architect)
    const tmp = await setupProject('dev');
    const spy = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    try {
      const { exitCode, output } = await runWithExitGuard(() => gateCommand('approve', 'design'));
      expect(exitCode).toBe(1);
      expect(output).toMatch(/not authorized|cannot approve/i);
      const state = await loadState();
      expect(state?.gateStatuses?.design).toBeUndefined();
    } finally {
      spy.mockRestore();
      await fs.remove(tmp);
    }
  });

  it('allows approval when current role is required', async () => {
    const tmp = await setupProject('po');
    const spy = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    try {
      const { exitCode } = await runWithExitGuard(() => gateCommand('approve', 'design'));
      expect(exitCode).toBeNull();
      const state = await loadState();
      expect(state?.gateStatuses?.design?.approved).toBe(true);
      // The recorded approver must be the real role, not 'current-user'
      expect(state?.gateStatuses?.design?.approvers).toContain('po');
      expect(state?.gateStatuses?.design?.approvers).not.toContain('current-user');
    } finally {
      spy.mockRestore();
      await fs.remove(tmp);
    }
  });
});
