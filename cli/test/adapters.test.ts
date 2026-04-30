import { describe, it, expect } from 'vitest';
import { createAdapter, ADAPTER_IDS } from '../src/adapters/base.js';
import * as os from 'os';
import * as fs2 from 'fs-extra';
import * as path2 from 'path';

describe('adapter registry', () => {
  it('exposes ADAPTER_IDS as a non-empty list', () => {
    expect(Array.isArray(ADAPTER_IDS)).toBe(true);
    expect(ADAPTER_IDS.length).toBeGreaterThan(0);
  });

  it('returns an adapter instance for every registered id', async () => {
    for (const id of ADAPTER_IDS) {
      const a = await createAdapter(id, '/tmp/riper-test-fake');
      expect(a, `adapter for "${id}" should be non-null`).not.toBeNull();
      expect(typeof (a as any).install).toBe('function');
    }
  });

  it('returns null for unknown id', async () => {
    const a = await createAdapter('definitely-not-a-tool', '/tmp/riper-test-fake');
    expect(a).toBeNull();
  });

  it('routes the five previously-unreachable adapters', async () => {
    for (const id of ['cline', 'codex', 'aider', 'roo', 'windsurf']) {
      const a = await createAdapter(id, '/tmp/riper-test-fake');
      expect(a, `adapter for "${id}"`).not.toBeNull();
    }
  });

  it('vscode adapter writes to .vscode/.riper.md', async () => {
    const fs = await import('fs-extra');
    const os = await import('os');
    const path = await import('path');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-vscode-'));
    try {
      const adapter = await createAdapter('vscode', root);
      expect(adapter).not.toBeNull();
      const result = await adapter!.install(false);
      expect(result.success).toBe(true);
      expect(await fs.pathExists(path.join(root, '.vscode/.riper.md'))).toBe(true);
      // Should NOT create a rules/ subdir
      expect(await fs.pathExists(path.join(root, '.vscode/rules'))).toBe(false);
    } finally {
      await fs.remove(root);
    }
  });

  it('vscode dryRun writes nothing', async () => {
    const fs = await import('fs-extra');
    const os = await import('os');
    const path = await import('path');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-vscode-dry-'));
    try {
      const adapter = await createAdapter('vscode', root);
      const result = await adapter!.install(true);
      expect(result.success).toBe(true);
      expect(await fs.pathExists(path.join(root, '.vscode/.riper.md'))).toBe(false);
    } finally {
      await fs.remove(root);
    }
  });
});

describe('install(dryRun)', () => {
  // Helper: snapshot file tree
  async function listAll(root: string): Promise<string[]> {
    if (!(await fs2.pathExists(root))) return [];
    const out: string[] = [];
    async function walk(dir: string) {
      for (const entry of await fs2.readdir(dir, { withFileTypes: true })) {
        const full = path2.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else out.push(full);
      }
    }
    await walk(root);
    return out.sort();
  }

  for (const id of ADAPTER_IDS) {
    it(`${id}: dryRun writes no files and reports filesCreated`, async () => {
      const root = await fs2.mkdtemp(path2.join(os.tmpdir(), `riper-${id}-dry-`));
      try {
        const before = await listAll(root);
        const adapter = await createAdapter(id, root);
        expect(adapter, id).not.toBeNull();
        const result = await adapter!.install(true);
        const after = await listAll(root);
        expect(after, `${id} should write nothing on dry-run`).toEqual(before);
        expect(result.success).toBe(true);
        // Every adapter should report at least one file it WOULD have created
        expect(Array.isArray(result.filesCreated)).toBe(true);
        expect(result.filesCreated!.length, `${id} should report filesCreated`).toBeGreaterThan(0);
      } finally {
        await fs2.remove(root);
      }
    });
  }
});
