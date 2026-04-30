import { BaseAdapter, AdapterConfig, AdapterResult } from './base.js';
import { generateHybridRules, generateToolConfig } from './rules-generator.js';
import path from 'path';
import fs from 'fs-extra';

export interface RooMCPConfig {
  mcpServers: Record<string, {
    command: string;
    args: string[];
    env?: Record<string, string>;
  }>;
}

export class RooCodeAdapter extends BaseAdapter {
  private currentMode?: string;
  private currentRole?: string;
  private currentGate?: string;

  constructor(projectPath: string, options?: { mode?: string; role?: string; gate?: string }) {
    const config: AdapterConfig = {
      name: 'rooCode',
      displayName: 'Roo Code',
      configDir: '.roo',
      rulesDir: 'rules',
      ruleExtension: '.md'
    };
    super(config, projectPath);
    this.currentMode = options?.mode;
    this.currentRole = options?.role;
    this.currentGate = options?.gate;
  }

  /**
   * Generate comprehensive rules for Roo Code
   * Uses .roo/rules/riper.md with custom instructions
   */
  getRulesContent(): string {
    return generateHybridRules({
      tool: 'roo-code',
      currentMode: this.currentMode,
      currentRole: this.currentRole,
      currentGate: this.currentGate
    });
  }

  /**
   * Get Roo-specific system prompt additions
   */
  getSystemPromptAdditions(): string {
    return `
# RIPER Mode System for Roo Code

## Mode Switching Commands
- Type "/mode research" → Research Mode (read-only)
- Type "/mode innovate" → Innovate Mode (suggest only)  
- Type "/mode plan" → Plan Mode (docs/plans only)
- Type "/mode execute" → Execute Mode (full access)
- Type "/mode review" → Review Mode (read + approve)

## Protection Check Commands
- Type "/protect <path>" to check file protection level
- Type "/gate" to show current gate status
- Type "/role <role>" to switch roles

## Memory Bank Access
Roo Code can access RIPER memory files:
- Read: .riper/*.md files for context
- Update: activeContext.md, progress.md (in Execute mode only)
- NEVER modify: projectbrief.md without explicit approval

## Custom Instructions Format
When given custom instructions, prepend with:
"[CURRENT MODE: Ωₓ | ROLE: ρₓ | GATE: Γₓ]"
Then follow normal Roo Code instructions.
`;
  }

  /**
   * Install Roo Code configuration
   * Creates .roo/rules/riper.md and settings
   */
  async install(dryRun: boolean = false): Promise<AdapterResult> {
    const result = await super.install(dryRun);
    if (!result.success) return result;

    const extraFiles: string[] = [];

    const settingsPath = path.join(this.projectPath, '.roo', 'settings.json');
    extraFiles.push(settingsPath);

    if (!dryRun) {
      try {
        // Create Roo-specific settings
        const settings = {
          customInstructions: this.getSystemPromptAdditions(),
          ripperMode: this.currentMode || 'research',
          ripperRole: this.currentRole || 'developer',
          ripperGate: this.currentGate || 'design'
        };

        await fs.ensureDir(path.dirname(settingsPath));
        await fs.writeJson(settingsPath, settings, { spaces: 2 });
      } catch (error) {
        return { success: false, message: `Failed to create settings: ${error}` };
      }
    }

    return {
      ...result,
      filesCreated: [...(result.filesCreated ?? []), ...extraFiles]
    };
  }

  /**
   * Generate MCP configuration for Roo Code
   */
  generateMCPConfig(enabledServers: string[] = []): Record<string, unknown> {
    const baseConfig = generateToolConfig('roo-code') || {};
    return {
      ...baseConfig,
      enabledServers
    };
  }

  /**
   * Update Roo Code settings with current BMAD state
   */
  async updateSettings(mode?: string, role?: string, gate?: string): Promise<void> {
    const settingsPath = path.join(this.projectPath, '.roo', 'settings.json');
    
    try {
      let settings: Record<string, unknown> = {};
      if (await fs.pathExists(settingsPath)) {
        settings = await fs.readJson(settingsPath);
      }

      if (mode) settings.ripperMode = mode;
      if (role) settings.ripperRole = role;
      if (gate) settings.ripperGate = gate;

      await fs.writeJson(settingsPath, settings, { spaces: 2 });
    } catch {
      // Silently fail - settings update is not critical
    }
  }
}
