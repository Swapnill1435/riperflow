import { describe, it, expect } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { withLock } from '../src/memory/lock.js';

describe('withLock', () => {
  it('serializes 20 concurrent writers without lost updates', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-lock-'));
    const file = path.join(dir, 'counter.txt');
    try {
      await fs.writeFile(file, '0', 'utf-8');

      await Promise.all(
        Array.from({ length: 20 }, () =>
          withLock(file, async () => {
            const v = parseInt(await fs.readFile(file, 'utf-8'), 10);
            // small delay to widen the race window
            await new Promise(r => setTimeout(r, 5));
            await fs.writeFile(file, String(v + 1), 'utf-8');
          })
        )
      );

      const final = parseInt(await fs.readFile(file, 'utf-8'), 10);
      expect(final).toBe(20);
    } finally {
      await fs.remove(dir);
    }
  });

  it('returns the inner result', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-lock-result-'));
    const file = path.join(dir, 'data.txt');
    try {
      await fs.writeFile(file, 'seed', 'utf-8');
      const r = await withLock(file, async () => 42);
      expect(r).toBe(42);
    } finally {
      await fs.remove(dir);
    }
  });

  it('releases the lock after a thrown error', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-lock-throw-'));
    const file = path.join(dir, 'data.txt');
    try {
      await fs.writeFile(file, 'seed', 'utf-8');
      await expect(withLock(file, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
      // Lock must be releasable for a second call
      const r = await withLock(file, async () => 'ok');
      expect(r).toBe('ok');
    } finally {
      await fs.remove(dir);
    }
  });
});
