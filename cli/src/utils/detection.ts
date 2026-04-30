import fs from 'fs-extra';
import path from 'path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import chalk from 'chalk';

const execAsync = promisify(exec);

export interface DetectedTool {
  name: string;
  displayName: string;
  configDir: string;
  available: boolean;
}

const TOOL_CONFIGS = [
  {
    name: 'cursor',
    displayName: 'Cursor',
    configDir: '.cursor',
    checkPaths: [
      '.cursor',
      '.cursor/rules'
    ],
    executables: ['cursor']
  },
  {
    name: 'claudeCode',
    displayName: 'Claude Code',
    configDir: '.claude',
    checkPaths: [
      '.claude',
      '.claude/rules',
      'CLAUDE.md'
    ],
    executables: ['claude']
  },
  {
    name: 'opencode',
    displayName: 'OpenCode',
    configDir: '.opencode',
    checkPaths: [
      '.opencode',
      '.opencode/agents',
      'AGENTS.md',
      'opencode.json'
    ],
    executables: ['opencode']
  },
  {
    name: 'kilocode',
    displayName: 'KiloCode',
    configDir: '.kilocode',
    checkPaths: [
      '.kilocode'
    ],
    executables: ['kilocode']
  },
  {
    name: 'vscode',
    displayName: 'VS Code',
    configDir: '.vscode',
    checkPaths: [
      '.vscode'
    ],
    executables: ['code']
  },
  {
    name: 'roo',
    displayName: 'Roo Code',
    configDir: '.roo',
    checkPaths: [
      '.roo'
    ],
    executables: ['roo-code']
  },
  {
    name: 'aider',
    displayName: 'Aider',
    configDir: '.aider',
    checkPaths: [],
    executables: ['aider']
  },
  {
    name: 'windsurf',
    displayName: 'Windsurf',
    configDir: '.windsurf',
    checkPaths: [
      '.windsurf'
    ],
    executables: ['windsurf']
  }
];

async function isExecutableAvailable(name: string): Promise<boolean> {
  try {
    if (process.platform === 'win32') {
      await execAsync(`where ${name}`);
    } else {
      await execAsync(`which ${name}`);
    }
    return true;
  } catch {
    return false;
  }
}

function checkPathExists(checkPath: string): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), checkPath));
  } catch {
    return false;
  }
}

export async function detectTool(config: typeof TOOL_CONFIGS[0]): Promise<DetectedTool> {
  const hasConfigDir = config.checkPaths.some(p => checkPathExists(p));
  const executableChecks = await Promise.all(config.executables.map(isExecutableAvailable));
  const hasExecutable = executableChecks.some(Boolean);

  return {
    name: config.name,
    displayName: config.displayName,
    configDir: config.configDir,
    available: hasConfigDir || hasExecutable,
  };
}

let cachedTools: { tools: DetectedTool[]; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

export async function detectTools(): Promise<DetectedTool[]> {
  if (process.env.RIPER_FORCE_DETECT !== '1' && cachedTools && Date.now() < cachedTools.expiresAt) {
    return cachedTools.tools;
  }

  const results: DetectedTool[] = [];
  for (const config of TOOL_CONFIGS) {
    const tool = await detectTool(config);
    if (tool.available) {
      results.push(tool);
    }
  }

  cachedTools = { tools: results, expiresAt: Date.now() + CACHE_TTL_MS };
  return results;
}

// Allow tests to clear the cache between runs
export function clearDetectToolsCache(): void {
  cachedTools = null;
}

export async function detectAndPrintTools(): Promise<void> {
  const tools = await detectTools();
  
  if (tools.length === 0) {
    console.log(chalk.yellow('No AI coding tools detected in this project.'));
    console.log(chalk.gray('Run "riper-for-all setup --tools cursor,claude-code,opencode" to configure.'));
    return;
  }
  
  console.log(chalk.cyan('Detected AI coding tools:'));
  for (const tool of tools) {
    console.log(`  ${chalk.green('✓')} ${tool.displayName} (${tool.name})`);
  }
}

export function getToolConfig(name: string): typeof TOOL_CONFIGS[0] | undefined {
  return TOOL_CONFIGS.find(t => t.name === name);
}

export function getAllToolConfigs(): typeof TOOL_CONFIGS {
  return TOOL_CONFIGS;
}
