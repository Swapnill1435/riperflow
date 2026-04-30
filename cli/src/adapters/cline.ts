import { BaseAdapter, AdapterConfig, AdapterResult } from './base.js';
import { generateHybridRules, generateToolConfig } from './rules-generator.js';
import path from 'path';
import fs from 'fs-extra';

export interface ClineGlobalInstructions {
  version: string;
  instructions: string[];
  ripper: {
    enabled: boolean;
    currentMode: string;
    currentRole: string;
    currentGate: string;
    autoEnforce: boolean;
  };
}

export class ClineAdapter extends BaseAdapter {
  private currentMode?: string;
  private currentRole?: string;
  private currentGate?: string;

  constructor(projectPath: string, options?: { mode?: string; role?: string; gate?: string }) {
    const config: AdapterConfig = {
      name: 'cline',
      displayName: 'Cline',
      configDir: '.cline',
      rulesDir: 'instructions',
      ruleExtension: '.md'
    };
    super(config, projectPath);
    this.currentMode = options?.mode;
    this.currentRole = options?.role;
    this.currentGate = options?.gate;
  }

  /**
   * Generate Cline's global instructions
   * Cline uses global_instructions.json for system prompts
   */
  getRulesContent(): string {
    return generateHybridRules({
      tool: 'cline',
      currentMode: this.currentMode,
      currentRole: this.currentRole,
      currentGate: this.currentGate
    });
  }

  /**
   * Get Cline global instructions object
   */
  getGlobalInstructions(): ClineGlobalInstructions {
    return {
      version: '1.0.0',
      instructions: [
        'Always respect RIPER mode permissions',
        'Check file protection before writing',
        'Follow gate progression rules',
        'Use role-appropriate permissions',
        'Update memory bank after significant changes'
      ],
      ripper: {
        enabled: true,
        currentMode: this.currentMode || 'research',
        currentRole: this.currentRole || 'developer',
        currentGate: this.currentGate || 'design',
        autoEnforce: true
      }
    };
  }

  /**
   * Cline uses global_instructions.json + custom instructions
   */
  async install(dryRun: boolean = false): Promise<AdapterResult> {
    const result = await super.install(dryRun);
    if (!result.success) return result;

    const extraFiles: string[] = [];

    const instructionsPath = path.join(this.projectPath, '.cline', 'global_instructions.json');
    extraFiles.push(instructionsPath);
    const customInstructionsPath = path.join(this.projectPath, '.cline', 'instructions', 'riper.md');
    extraFiles.push(customInstructionsPath);
    const settingsPath = path.join(this.projectPath, '.cline', 'settings.json');
    extraFiles.push(settingsPath);

    if (!dryRun) {
      try {
        // Create Cline global instructions
        await fs.ensureDir(path.dirname(instructionsPath));
        await fs.writeJson(instructionsPath, this.getGlobalInstructions(), { spaces: 2 });

        // Create custom instructions file
        await fs.ensureDir(path.dirname(customInstructionsPath));
        await fs.writeFile(customInstructionsPath, this.getRulesContent(), 'utf8');

        // Create .cline/settings.json
        const settings = {
          autoApprove: {
            readFiles: true,
            writeFiles: false, // RIPER enforces protection
            executeCommands: false
          },
          ripper: {
            enforceModePermissions: true,
            checkProtectionBeforeWrite: true,
            autoUpdateContext: true,
            mode: this.currentMode || 'research',
            role: this.currentRole || 'developer',
            gate: this.currentGate || 'design'
          }
        };
        await fs.ensureDir(path.dirname(settingsPath));
        await fs.writeJson(settingsPath, settings, { spaces: 2 });
      } catch (error) {
        return { success: false, message: `Failed to create Cline config: ${error}` };
      }
    }

    return {
      ...result,
      filesCreated: [...(result.filesCreated ?? []), ...extraFiles]
    };
  }

  /**
   * Update Cline configuration with current mode/role/gate
   */
  async updateSettings(mode?: string, role?: string, gate?: string): Promise<void> {
    const instructionsPath = path.join(this.projectPath, '.cline', 'global_instructions.json');
    const settingsPath = path.join(this.projectPath, '.cline', 'settings.json');
    const customInstructionsPath = path.join(this.projectPath, '.cline', 'instructions', 'riper.md');
    
    try {
      this.currentMode = mode || this.currentMode;
      this.currentRole = role || this.currentRole;
      this.currentGate = gate || this.currentGate;

      // Update global_instructions.json
      if (await fs.pathExists(instructionsPath)) {
        const instructions = await fs.readJson(instructionsPath);
        instructions.ripper = {
          ...instructions.ripper,
          currentMode: this.currentMode,
          currentRole: this.currentRole,
          currentGate: this.currentGate,
          lastUpdated: new Date().toISOString()
        };
        await fs.writeJson(instructionsPath, instructions, { spaces: 2 });
      }

      // Update settings.json
      if (await fs.pathExists(settingsPath)) {
        const settings = await fs.readJson(settingsPath);
        settings.ripper = {
          ...settings.ripper,
          mode: this.currentMode,
          role: this.currentRole,
          gate: this.currentGate
        };
        await fs.writeJson(settingsPath, settings, { spaces: 2 });
      }

      // Regenerate custom instructions
      const newContent = generateHybridRules({
        tool: 'cline',
        currentMode: this.currentMode,
        currentRole: this.currentRole,
        currentGate: this.currentGate
      });
      await fs.writeFile(customInstructionsPath, newContent, 'utf8');
    } catch {
      // Silently fail
    }
  }

  /**
   * Get Cline-specific command reference
   */
  getCommandsReference(): string {
    return `
# Cline + RIPER Commands

## Mode Switching
- **@mode research** or **@Ω₁** - Research mode
- **@mode innovate** or **@Ω₂** - Innovate mode  
- **@mode plan** or **@Ω₃** - Plan mode
- **@mode execute** or **@Ω₄** - Execute mode
- **@mode review** or **@Ω₅** - Review mode

## Role Commands
- **@role architect** (ρ₁) - Architect permissions
- **@role developer** (ρ₂) - Developer permissions
- **@role qa** (ρ₃) - QA permissions
- **@role devops** (ρ₄) - DevOps permissions
- **@role po** (ρ₅) - Product Owner permissions

## Protection Commands
- **@protect [path]** - Check protection level
- **@lock [path]** - Lock a file
- **@unlock [path]** - Unlock a file

## Gate Commands
- **@gate** - Show current gate
- **@gate next** - Advance gate (if approved)
- **@gate status** - Full gate status
`;
  }

  generateMCPConfig(enabledServers: string[] = []): Record<string, unknown> {
    const baseConfig = generateToolConfig('cline') || {};
    return {
      ...baseConfig,
      enabledServers
    };
  }
}
