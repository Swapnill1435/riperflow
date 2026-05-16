import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

// These tests run the COMPILED dist/ CLI as a subprocess so that ESM-only
// regressions (e.g. `import * as fs from 'fs-extra'` losing its named methods)
// are caught even when vitest's TS transformer would silently normalize them.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI = path.resolve(__dirname, '..', 'dist', 'index.js');

function run(cwd: string, args: string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf-8' });
  return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

describe('dist smoke (ESM regression guard)', () => {
  let tmp: string;

  beforeAll(() => {
    if (!fs.existsSync(CLI)) {
      throw new Error(`dist build missing at ${CLI} — run \`npm run build\` first`);
    }
  });

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'riper-dist-smoke-'));
    run(tmp, ['init', '--yes']);
  });

  afterEach(() => {
    fs.removeSync(tmp);
  });

  it('mcp generate writes config without TypeError (Bug #4)', () => {
    run(tmp, ['mcp', 'add', 'github']);
    const r = run(tmp, ['mcp', 'generate']);
    const combined = r.stdout + r.stderr;
    expect(combined).not.toMatch(/TypeError/);
    expect(combined).not.toMatch(/fs\.writeJson is not a function/);
    expect(combined).toMatch(/✓.*claude-code/);
  });

  it('analytics migrate runs without TypeError (Bug #5)', () => {
    const r = run(tmp, ['analytics', 'migrate']);
    const combined = r.stdout + r.stderr;
    expect(combined).not.toMatch(/TypeError/);
    expect(combined).not.toMatch(/fs\.readFile is not a function/);
    expect(r.code).toBe(0);
  });
});

describe('init UX', () => {
  let tmp: string;

  beforeAll(() => {
    if (!fs.existsSync(CLI)) {
      throw new Error(`dist build missing at ${CLI} — run \`npm run build\` first`);
    }
  });

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'riper-init-ux-'));
  });

  afterEach(() => {
    fs.removeSync(tmp);
  });

  it('init with no flags and non-TTY stdin falls back to defaults (Bug #3)', () => {
    // spawnSync inherits a non-TTY stdin by default — exactly the CI/Docker case
    const r = run(tmp, ['init']);
    expect(r.code).toBe(0);
    expect(r.stderr + r.stdout).not.toMatch(/ERR_USE_AFTER_CLOSE/);
    expect(fs.existsSync(path.join(tmp, '.riper', 'config.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'memory-bank'))).toBe(true);
  });

  it('init output is free of stack traces and JSON parse warnings (Bug #11)', () => {
    const r = run(tmp, ['init', '--yes']);
    const combined = r.stdout + r.stderr;
    expect(combined).not.toMatch(/SyntaxError/);
    expect(combined).not.toMatch(/Unexpected end of JSON input/);
    expect(combined).not.toMatch(/at JSON\.parse/);
    expect(combined).not.toMatch(/Error loading config/);
  });
});
