import { ProjectConfig, RuntimeState } from '../core/types.js';
import path from 'path';
import fs from 'fs-extra';
import { homedir } from 'os';
import chalk from 'chalk';
import { MEMORY_FILES } from '../core/modes.js';
import { fileURLToPath } from 'url';
import { _doBackupCopy } from '../commands/backup.js';
import { withLock } from '../memory/lock.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATES_DIR = path.join(__dirname, '../../templates');

const DEFAULT_CONFIG: ProjectConfig = {
  version: '1.0.0',
  projectName: '',
  projectPath: process.cwd(),
  tools: {
    cursor: true,
    claudeCode: true,
    opencode: true,
    kilocode: false,
    vscode: false,
    roo: false,
    aider: false,
    windsurf: false
  },
  memory: {
    location: 'memory-bank',
    format: 'markdown'
  },
  mcp: {
    enabled: true,
    servers: ['github', 'websearch', 'browser', 'docker']
  },
  telemetry: {
    enabled: true,
    anonymous: true
  },
  dashboard: {
    port: 3456,
    detach: false
  },
  backup: {
    auto: true,
    interval: 'daily',
    maxBackups: 10
  }
};

const DEFAULT_STATE: RuntimeState = {
  currentMode: 'research',
  currentPhase: 'uninitiated',
  lastModeChange: new Date().toISOString(),
  session: {
    startTime: new Date().toISOString(),
    modeHistory: []
  }
};

export function getProjectPath(): string {
  return process.cwd();
}

export function getRiperDir(): string {
  return path.join(getProjectPath(), '.riper');
}

export function getMemoryBankDir(): string {
  return path.join(getProjectPath(), 'memory-bank');
}

export function getGlobalConfigPath(): string {
  return path.join(homedir(), '.config', 'riper-for-all', 'config.json');
}

export function getGlobalDir(): string {
  return path.join(homedir(), '.config', 'riper-for-all');
}

export async function ensureDirectories(): Promise<void> {
  const dirs = [
    getRiperDir(),
    getMemoryBankDir(),
    getGlobalDir(),
    path.join(getRiperDir(), 'backups')
  ];

  for (const dir of dirs) {
    await fs.ensureDir(dir);
  }
}

export async function loadConfig(): Promise<ProjectConfig | null> {
  const configPath = path.join(getRiperDir(), 'config.json');
  
  try {
    if (await fs.pathExists(configPath)) {
      const data = await fs.readJson(configPath);
      return { ...DEFAULT_CONFIG, ...data };
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }
  
  return null;
}

export async function saveConfig(config: ProjectConfig): Promise<void> {
  const configPath = path.join(getRiperDir(), 'config.json');
  await withLock(configPath, async () => {
    await _doBackupCopy(configPath, true);
    await fs.writeJson(configPath, config, { spaces: 2 });
  });
}

export async function loadState(): Promise<RuntimeState | null> {
  const statePath = path.join(getRiperDir(), 'state.json');
  
  try {
    if (await fs.pathExists(statePath)) {
      const data = await fs.readJson(statePath);
      return { ...DEFAULT_STATE, ...data };
    }
  } catch (error) {
    console.error('Error loading state:', error);
  }
  
  return null;
}

export async function saveState(state: RuntimeState): Promise<void> {
  const statePath = path.join(getRiperDir(), 'state.json');
  await withLock(statePath, async () => {
    await _doBackupCopy(statePath, true);
    await fs.writeJson(statePath, state, { spaces: 2 });
  });
}

export function getDefaultConfig(): ProjectConfig {
  return { ...DEFAULT_CONFIG };
}

export function getDefaultState(): RuntimeState {
  return { ...DEFAULT_STATE };
}

function getBasicTemplate(fileName: string): string {
  const date = new Date().toISOString().split('T')[0];
  return `# ${fileName}\n*v1.0 | Created: ${date} | Updated: ${date}*\n*Π: UNINITIATED | Ω: RESEARCH*\n\n---\n\nStart writing your ${fileName} here...\n`;
}

function getTemplateContent(fileId: string): string {
  const templatePath = path.join(TEMPLATES_DIR, 'universal/memory', `${fileId}.md`);
  const date = new Date().toISOString().split('T')[0];
  
  if (fs.existsSync(templatePath)) {
    let content = fs.readFileSync(templatePath, 'utf-8');
    content = content.replace(/\[DATE\]/g, date);
    return content;
  }
  
  return getBasicTemplate(fileId);
}

export async function ensureMemoryBank(): Promise<void> {
  const memoryDir = getMemoryBankDir();
  await fs.ensureDir(memoryDir);
  
  for (const [key, file] of Object.entries(MEMORY_FILES)) {
    const filePath = path.join(memoryDir, file.filename);
    if (!(await fs.pathExists(filePath))) {
      const content = getTemplateContent(key);
      await fs.writeFile(filePath, content);
    }
  }

  console.log(chalk.green('✓ Memory bank initialized'));
}

export async function initializeState(): Promise<RuntimeState> {
  const state = getDefaultState();
  await saveState(state);
  return state;
}

export async function resetConfig(): Promise<void> {
  const configPath = path.join(getRiperDir(), 'config.json');
  await fs.writeJson(configPath, DEFAULT_CONFIG, { spaces: 2 });
}

export async function resetState(): Promise<void> {
  const statePath = path.join(getRiperDir(), 'state.json');
  await fs.writeJson(statePath, DEFAULT_STATE, { spaces: 2 });
}
