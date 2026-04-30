import { describe, it, expect, beforeEach } from 'vitest';
import { detectTools, clearDetectToolsCache } from '../src/utils/detection.js';

describe('detectTools cache', () => {
  beforeEach(() => clearDetectToolsCache());

  it('returns the same array reference on subsequent calls within TTL', async () => {
    const a = await detectTools();
    const b = await detectTools();
    expect(b).toBe(a); // same reference proves cache hit
  });

  it('RIPER_FORCE_DETECT=1 bypasses the cache', async () => {
    const a = await detectTools();
    process.env.RIPER_FORCE_DETECT = '1';
    try {
      const b = await detectTools();
      expect(b).not.toBe(a);
    } finally {
      delete process.env.RIPER_FORCE_DETECT;
    }
  });

  it('clearDetectToolsCache resets the cache', async () => {
    const a = await detectTools();
    clearDetectToolsCache();
    const b = await detectTools();
    expect(b).not.toBe(a);
  });
});
