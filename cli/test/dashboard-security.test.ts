import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import type { Server as HttpServer } from 'http';
import { saveConfig, getDefaultConfig, saveState, getDefaultState } from '../src/config/loader.js';

describe('dashboard server hardening', () => {
  let tmp: string;
  let port: number;
  let server: HttpServer | null = null;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-dash-sec-'));
    vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    await fs.ensureDir(path.join(tmp, '.riper'));
    await saveConfig({ ...getDefaultConfig(), projectPath: tmp });
    await saveState({ ...getDefaultState(), currentMode: 'execute' });
    // Use a unique port per test run to avoid EADDRINUSE across parallel test files
    port = 39500 + Math.floor(Math.random() * 400);
  });

  afterEach(async () => {
    // Close the server so the port is freed before the next test
    if (server) {
      await new Promise<void>((resolve) => {
        server!.close(() => resolve());
      });
      server = null;
    }
    vi.restoreAllMocks();
    await fs.remove(tmp);
  });

  it('writes a 64-hex-char token to .riper/dashboard.token with mode 600', async () => {
    const { startWebDashboard } = await import('../src/dashboard/server.js');
    server = await startWebDashboard({ port, host: '127.0.0.1', detach: true });

    const tokenPath = path.join(tmp, '.riper', 'dashboard.token');
    expect(await fs.pathExists(tokenPath)).toBe(true);

    if (process.platform !== 'win32') {
      const stat = await fs.stat(tokenPath);
      expect(stat.mode & 0o777).toBe(0o600);
    }

    const content = (await fs.readFile(tokenPath, 'utf-8')).trim();
    expect(content).toMatch(/^[0-9a-f]{64}$/);
  });

  it('POST /api/mode without token returns 401', async () => {
    const { startWebDashboard } = await import('../src/dashboard/server.js');
    server = await startWebDashboard({ port, host: '127.0.0.1', detach: true });

    const res = await fetch(`http://127.0.0.1:${port}/api/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'research' }),
    });
    expect(res.status).toBe(401);
  });

  it('POST /api/mode with valid token + execute mode allowed returns 200', async () => {
    const { startWebDashboard } = await import('../src/dashboard/server.js');
    server = await startWebDashboard({ port, host: '127.0.0.1', detach: true });

    const token = (await fs.readFile(path.join(tmp, '.riper', 'dashboard.token'), 'utf-8')).trim();
    const res = await fetch(`http://127.0.0.1:${port}/api/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-RIPER-Token': token },
      body: JSON.stringify({ mode: 'review' }),
    });
    expect(res.status).toBe(200);
  });

  it('POST /api/mode with valid token but research mode blocks via enforce returns 403', async () => {
    // research mode → write is blocked by enforce
    await saveState({ ...getDefaultState(), currentMode: 'research' });

    const { startWebDashboard } = await import('../src/dashboard/server.js');
    server = await startWebDashboard({ port, host: '127.0.0.1', detach: true });

    const token = (await fs.readFile(path.join(tmp, '.riper', 'dashboard.token'), 'utf-8')).trim();
    const res = await fetch(`http://127.0.0.1:${port}/api/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-RIPER-Token': token },
      body: JSON.stringify({ mode: 'execute' }),
    });
    expect(res.status).toBe(403);
  });

  it('GET responses include security headers', async () => {
    const { startWebDashboard } = await import('../src/dashboard/server.js');
    server = await startWebDashboard({ port, host: '127.0.0.1', detach: true });

    const res = await fetch(`http://127.0.0.1:${port}/api/status`);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
  });

  it('POST /api/watcher/stop without token returns 401', async () => {
    const { startWebDashboard } = await import('../src/dashboard/server.js');
    server = await startWebDashboard({ port, host: '127.0.0.1', detach: true });

    const res = await fetch(`http://127.0.0.1:${port}/api/watcher/stop`, {
      method: 'POST',
    });
    expect(res.status).toBe(401);
  });

  it('GET / (primary dashboard page) includes security headers', async () => {
    const { startWebDashboard } = await import('../src/dashboard/server.js');
    server = await startWebDashboard({ port, host: '127.0.0.1', detach: true });

    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
  });
});
