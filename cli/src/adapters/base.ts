import fs from 'fs-extra';
import path from 'path';

export interface AdapterConfig {
  name: string;
  displayName: string;
  configDir: string;
  rulesDir: string;
  ruleExtension: string;
}

export interface AdapterResult {
  success: boolean;
  message: string;
  filesCreated?: string[];
  filesModified?: string[];
  filesDeleted?: string[];
}

export interface DryRunResult {
  wouldCreate: string[];
  wouldModify: string[];
  wouldDelete: string[];
}

export abstract class BaseAdapter {
  protected config: AdapterConfig;
  protected projectPath: string;

  constructor(config: AdapterConfig, projectPath: string) {
    this.config = config;
    this.projectPath = projectPath;
  }

  abstract getRulesContent(): string;

  getConfigDir(): string {
    return path.join(this.projectPath, this.config.configDir);
  }

  getRulesDir(): string {
    return path.join(this.getConfigDir(), this.config.rulesDir);
  }

  getRulesFilePath(): string {
    return path.join(this.getRulesDir(), `riper${this.config.ruleExtension}`);
  }

  async isInstalled(): Promise<boolean> {
    return await fs.pathExists(this.getRulesFilePath());
  }

  async install(dryRun: boolean = false): Promise<AdapterResult> {
    const rulesFilePath = this.getRulesFilePath();
    const rulesDir = this.getRulesDir();
    const rulesContent = this.getRulesContent();

    if (dryRun) {
      return {
        success: true,
        message: `Would create ${rulesFilePath}`,
        filesCreated: [rulesFilePath]
      };
    }

    try {
      await fs.ensureDir(rulesDir);
      await fs.writeFile(rulesFilePath, rulesContent, 'utf-8');

      return {
        success: true,
        message: `Installed RIPER rules to ${this.config.displayName}`,
        filesCreated: [rulesFilePath]
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to install: ${error}`
      };
    }
  }

  async uninstall(dryRun: boolean = false): Promise<AdapterResult> {
    const rulesFilePath = this.getRulesFilePath();

    if (dryRun) {
      return {
        success: true,
        message: `Would delete ${rulesFilePath}`,
        filesDeleted: [rulesFilePath]
      };
    }

    try {
      if (await fs.pathExists(rulesFilePath)) {
        await fs.remove(rulesFilePath);
        return {
          success: true,
          message: `Uninstalled RIPER rules from ${this.config.displayName}`,
          filesDeleted: [rulesFilePath]
        };
      }
      return {
        success: true,
        message: `No rules file found to remove`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to uninstall: ${error}`
      };
    }
  }

  async update(dryRun: boolean = false): Promise<AdapterResult> {
    return this.install(dryRun);
  }

  getAdapterInfo(): AdapterConfig {
    return { ...this.config };
  }
}

type AdapterFactory = (projectPath: string, options?: { mode?: string; role?: string; gate?: string }) => Promise<BaseAdapter>;

const ADAPTER_REGISTRY: Record<string, AdapterFactory> = {
  cursor: async (p, o) => { const { CursorAdapter } = await import('./cursor.js'); return new CursorAdapter(p, o); },
  'claude-code': async (p, o) => { const { ClaudeCodeAdapter } = await import('./claude-code.js'); return new ClaudeCodeAdapter(p, o); },
  claudecode: async (p, o) => { const { ClaudeCodeAdapter } = await import('./claude-code.js'); return new ClaudeCodeAdapter(p, o); },
  opencode: async (p, o) => { const { OpenCodeAdapter } = await import('./opencode.js'); return new OpenCodeAdapter(p, o); },
  kilocode: async (p) => { const { KiloCodeAdapter } = await import('./kilocode.js'); return new KiloCodeAdapter(p); },
  cline: async (p, o) => { const { ClineAdapter } = await import('./cline.js'); return new ClineAdapter(p, o); },
  codex: async (p, o) => { const { CodexAdapter } = await import('./codex.js'); return new CodexAdapter(p, o); },
  aider: async (p, o) => { const { AiderAdapter } = await import('./aider.js'); return new AiderAdapter(p, o); },
  roo: async (p, o) => { const { RooCodeAdapter } = await import('./roo-code.js'); return new RooCodeAdapter(p, o); },
  'roo-code': async (p, o) => { const { RooCodeAdapter } = await import('./roo-code.js'); return new RooCodeAdapter(p, o); },
  windsurf: async (p, o) => { const { WindsurfAdapter } = await import('./windsurf.js'); return new WindsurfAdapter(p, o); },
  vscode: async (p, o) => { const { VSCodeAdapter } = await import('./vscode.js'); return new VSCodeAdapter(p, o); },
};

// Distinct id list (deduped, canonical names — used by sync, init prompts, and tests)
export const ADAPTER_IDS: string[] = ['cursor', 'claude-code', 'opencode', 'kilocode', 'cline', 'codex', 'aider', 'roo', 'windsurf', 'vscode'];

export async function createAdapter(
  toolName: string,
  projectPath: string,
  options?: { mode?: string; role?: string; gate?: string }
): Promise<BaseAdapter | null> {
  const factory = ADAPTER_REGISTRY[toolName.toLowerCase()];
  return factory ? factory(projectPath, options) : null;
}
