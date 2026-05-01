import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { assertWithinDir, PathTraversalError } from '../src/utils/path-safety.js';
import { restoreCommand } from '../src/commands/restore.js';
import { prdCommand } from '../src/commands/prd.js';
import { saveConfig, getDefaultConfig } from '../src/config/loader.js';

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

describe('assertWithinDir', () => {
  it('allows the root itself', () => {
    expect(() => assertWithinDir('/tmp/foo', ['/tmp/foo'])).not.toThrow();
  });

  it('allows descendants', () => {
    expect(() => assertWithinDir('/tmp/foo/bar/baz', ['/tmp/foo'])).not.toThrow();
  });

  it('blocks lexical traversal with ..', () => {
    expect(() => assertWithinDir('/tmp/foo/../bar', ['/tmp/foo'])).toThrow(PathTraversalError);
  });

  it('blocks sibling paths via prefix-only matches', () => {
    // /tmp/foobar should NOT be considered inside /tmp/foo
    expect(() => assertWithinDir('/tmp/foobar', ['/tmp/foo'])).toThrow(PathTraversalError);
  });

  it('accepts a candidate inside any of multiple allowed roots', () => {
    expect(() => assertWithinDir('/tmp/b/file', ['/tmp/a', '/tmp/b', '/tmp/c'])).not.toThrow();
  });
});

describe('restore --backup traversal', () => {
  it('rejects ../-prefixed backup name with exit 1', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-restore-traverse-'));
    const spy = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    try {
      await fs.ensureDir(path.join(tmp, '.riper', 'backups'));
      await saveConfig({ ...getDefaultConfig(), projectPath: tmp });
      // Plant a "real" file outside the backups dir to confirm we never reach the copy
      const evil = path.join(tmp, '..', 'evil.bak');
      await fs.writeFile(evil, 'OWNED');
      try {
        const { exitCode } = await runWithExitGuard(() =>
          restoreCommand({ backup: '../evil.bak' })
        );
        // Either: we exit 1 from path-safety check, OR we exit 1 from "backup not found"
        // (because backupPath = .riper/backups/../evil.bak resolves outside, and the
        // path-safety check fires before fs.pathExists). Test the strong contract.
        expect(exitCode).toBe(1);
      } finally {
        await fs.remove(evil);
      }
    } finally {
      spy.mockRestore();
      await fs.remove(tmp);
    }
  });
});

describe('prd command path traversal', () => {
  it('rejects ../-prefixed prd id with exit 1', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-prd-traverse-'));
    const spy = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    try {
      await fs.ensureDir(path.join(tmp, '.riper'));
      await saveConfig({ ...getDefaultConfig(), projectPath: tmp });
      const { exitCode } = await runWithExitGuard(() =>
        prdCommand('view', '../../etc/passwd')
      );
      expect(exitCode).toBe(1);
    } finally {
      spy.mockRestore();
      await fs.remove(tmp);
    }
  });
});

describe('analytics export --output traversal', () => {
  it('rejects --output paths outside project root', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-analytics-traverse-'));
    const spy = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    try {
      await fs.ensureDir(path.join(tmp, '.riper'));
      await saveConfig({ ...getDefaultConfig(), projectPath: tmp });

      const evil = path.join(tmp, '..', 'evil-export.json');
      const { analyticsCommand } = await import('../src/commands/analytics.js');
      const { exitCode } = await runWithExitGuard(() =>
        analyticsCommand('export', { format: 'json', output: evil } as any)
      );
      expect(exitCode).toBe(1);
      expect(await fs.pathExists(evil)).toBe(false);
    } finally {
      spy.mockRestore();
      await fs.remove(tmp);
    }
  });

  it('accepts --output paths inside project root', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-analytics-inside-'));
    const spy = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    try {
      await fs.ensureDir(path.join(tmp, '.riper'));
      await saveConfig({ ...getDefaultConfig(), projectPath: tmp });

      const target = path.join(tmp, 'analytics-out.json');
      const { analyticsCommand } = await import('../src/commands/analytics.js');
      // No exit expected — should write the file
      await analyticsCommand('export', { format: 'json', output: target } as any);
      expect(await fs.pathExists(target)).toBe(true);
    } finally {
      spy.mockRestore();
      await fs.remove(tmp);
    }
  });
});
