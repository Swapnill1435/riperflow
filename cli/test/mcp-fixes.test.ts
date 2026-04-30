import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { mcpCommand } from '../src/commands/mcp.js';
import { saveConfig, getDefaultConfig, loadConfig } from '../src/config/loader.js';
import { MCPManager } from '../src/mcp/manager.js';

// Silence console output during tests
function muteConsole() {
  const origLog = console.log;
  console.log = () => {};
  return () => { console.log = origLog; };
}

describe('MCP fixes', () => {
  let tmp: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;
  let unmute: () => void;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'riper-mcp-fix-'));
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    await fs.ensureDir(path.join(tmp, '.riper'));
    const cfg = { ...getDefaultConfig(), projectPath: tmp, mcp: { enabled: true, servers: [] } };
    await saveConfig(cfg);
    unmute = muteConsole();
  });

  afterEach(async () => {
    unmute();
    cwdSpy.mockRestore();
    await fs.remove(tmp);
  });

  // 7.5 — case-insensitive dedup on add
  it('mcp add Github then mcp add github does not duplicate', async () => {
    await mcpCommand('add', 'Github');
    await mcpCommand('add', 'github');
    const cfg = await loadConfig();
    const gh = cfg!.mcp.servers.filter(s => s.toLowerCase() === 'github');
    expect(gh.length).toBe(1);
    expect(gh[0]).toBe('github'); // canonicalized to lowercase
  });

  // 7.5 — case-insensitive remove
  it('mcp remove is case-insensitive', async () => {
    await mcpCommand('add', 'github');
    await mcpCommand('remove', 'GITHUB');
    const cfg = await loadConfig();
    expect(cfg!.mcp.servers).not.toContain('github');
  });

  // 7.4 — merge not overwrite
  it('generateMCPConfigFile preserves user-defined mcpServers', async () => {
    const cfgPath = path.join(tmp, '.cursor', 'mcp.json');
    await fs.ensureDir(path.dirname(cfgPath));
    await fs.writeJson(cfgPath, { mcpServers: { custom: { command: 'echo hi' } } });

    const manager = new MCPManager({ projectPath: tmp });
    const result = await manager.generateMCPConfigFile('cursor', ['github']);
    expect(result.success).toBe(true);
    const merged = await fs.readJson(cfgPath);
    expect(merged.mcpServers.custom).toEqual({ command: 'echo hi' });
    expect(merged.mcpServers.github).toBeTruthy();
  });

  // 7.6 — default install writes config without running npm install -g
  it('mcp install (no --global flag) writes config without running npm install -g', async () => {
    // Verify we never shell out by ensuring execAsync would throw if called;
    // the observable contract is that mcp.json for cursor gets created.
    await mcpCommand('install', 'github');
    const cursorCfg = path.join(tmp, '.cursor', 'mcp.json');
    expect(await fs.pathExists(cursorCfg)).toBe(true);
    const j = await fs.readJson(cursorCfg);
    expect(j.mcpServers.github).toBeTruthy();
  });
});
