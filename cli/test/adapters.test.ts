import { describe, it, expect } from 'vitest';
import { createAdapter, ADAPTER_IDS } from '../src/adapters/base.js';

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
