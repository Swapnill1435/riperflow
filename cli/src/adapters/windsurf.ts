import { BaseAdapter, AdapterConfig, AdapterResult } from './base.js';
import { generateHybridRules, generateToolConfig } from './rules-generator.js';
import path from 'path';
import fs from 'fs-extra';

export class WindsurfAdapter extends BaseAdapter {
  private currentMode?: string;
  private currentRole?: string;
  private currentGate?: string;

  constructor(projectPath: string, options?: { mode?: string; role?: string; gate?: string }) {
    const config: AdapterConfig = {
      name: 'windsurf',
      displayName: 'Windsurf',
      configDir: '.windsurf',
      rulesDir: 'rules',
      ruleExtension: '.md'
    };
    super(config, projectPath);
    this.currentMode = options?.mode;
    this.currentRole = options?.role;
    this.currentGate = options?.gate;
  }

  /**
   * Generate Windsurf's cascade rules
   * Windsurf uses .windsurf/rules/ for Cascade context
   */
  getRulesContent(): string {
    return generateHybridRules({
      tool: 'windsurf',
      currentMode: this.currentMode,
      currentRole: this.currentRole,
      currentGate: this.currentGate
    });
  }

  /**
   * Windsurf uses cascade.md for global instructions
   */
  getCascadeContent(): string {
    return `# RIPER-for-All - Windsurf Cascade Instructions

${this.getRulesContent()}

---

## Cascade-Specific Instructions

### Mode Awareness
Cascade should ALWAYS be aware of the current RIPER mode and enforce it:

- In **Research Mode**: Cascade provides information, reads files, NEVER writes
- In **Innovate Mode**: Cascade brainstorms, suggests ideas, creates design docs
- In **Plan Mode**: Cascade creates implementation plans, architecture docs
- In **Execute Mode**: Cascade writes code, runs commands, implements features
- In **Review Mode**: Cascade reviews code, finds bugs, suggests improvements

### Cascade Commands
Use these special Cascade commands:
- **/mode [research|innovate|plan|execute|review]** - Switch RIPER mode
- **/role [po|architect|developer|qa|devops]** - Switch role
- **/gate [design|development|testing|review|deploy]** - Show/advance gate
- **/protect [path]** - Check file protection level

### Memory Bank Integration
Cascade automatically reads from:
1. .windsurf/rules/riper.md (this file)
2. .riper/projectbrief.md (project context)
3. .riper/activeContext.md (current session)
4. .riper/progress.md (what's done)

Cascade updates (in Execute mode):
- .riper/activeContext.md with current work
- .riper/progress.md with completed tasks

### Protection Enforcement
Before ANY write operation, Cascade checks protection:
- 🔒 Locked files: Blocked completely
- 🛡️ Guarded files: Require explicit confirmation
- ⚠️ Warning files: Log warning but proceed
- ✅ Open files: No restrictions

### Commit Message Format
Cascade generates commits with RIPER prefixes:
\`\`\`
[Ω₄-Execute] Implemented user authentication
[Ω₁-Research] Analyzed API options
[Ω₅-Review] Fixed memory leak in parser
\`\`\`
`;
  }

  async install(dryRun: boolean = false): Promise<AdapterResult> {
    const result = await super.install(dryRun);
    if (!result.success) return result;

    const extraFiles: string[] = [];

    const cascadePath = path.join(this.projectPath, '.windsurf', 'cascade.md');
    extraFiles.push(cascadePath);
    const configPath = path.join(this.projectPath, '.windsurf', 'config.json');
    extraFiles.push(configPath);

    if (!dryRun) {
      try {
        // Create Windsurf cascade.md (global instructions)
        await fs.writeFile(cascadePath, this.getCascadeContent(), 'utf8');

        // Create .windsurf/config.json for RIPER settings
        const config = {
          ripper: {
            enabled: true,
            mode: this.currentMode || 'research',
            role: this.currentRole || 'developer',
            gate: this.currentGate || 'design',
            enforcement: {
              blockProtectedWrites: true,
              confirmGuardedWrites: true,
              logAllOperations: true
            }
          },
          cascade: {
            autoReadMemoryBank: true,
            updateContextOnModeSwitch: true,
            suggestModeTransitions: true
          }
        };
        await fs.writeJson(configPath, config, { spaces: 2 });
      } catch (error) {
        return { success: false, message: `Failed to create Windsurf config: ${error}` };
      }
    }

    return {
      ...result,
      filesCreated: [...(result.filesCreated ?? []), ...extraFiles]
    };
  }

  /**
   * Update Windsurf configuration with current BMAD state
   */
  async updateSettings(mode?: string, role?: string, gate?: string): Promise<void> {
    const configPath = path.join(this.projectPath, '.windsurf', 'config.json');
    const rulesPath = path.join(this.projectPath, '.windsurf', 'rules', 'riper.md');
    const cascadePath = path.join(this.projectPath, '.windsurf', 'cascade.md');
    
    try {
      // Update config.json
      let config: Record<string, unknown> = {};
      if (await fs.pathExists(configPath)) {
        config = await fs.readJson(configPath);
      }
      
      config.ripper = {
        ...(config.ripper as Record<string, unknown> || {}),
        ...(mode && { mode }),
        ...(role && { role }),
        ...(gate && { gate }),
        lastUpdated: new Date().toISOString()
      };
      
      await fs.writeJson(configPath, config, { spaces: 2 });

      // Regenerate rules with new BMAD context
      const newRules = generateHybridRules({
        tool: 'windsurf',
        currentMode: mode || this.currentMode,
        currentRole: role || this.currentRole,
        currentGate: gate || this.currentGate
      });
      
      if (await fs.pathExists(rulesPath)) {
        await fs.writeFile(rulesPath, newRules, 'utf8');
      }

      // Update cascade.md
      this.currentMode = mode || this.currentMode;
      this.currentRole = role || this.currentRole;
      this.currentGate = gate || this.currentGate;
      
      const newCascade = this.getCascadeContent();
      await fs.writeFile(cascadePath, newCascade, 'utf8');
    } catch {
      // Silently fail - settings update is not critical
    }
  }

  generateMCPConfig(enabledServers: string[] = []): Record<string, unknown> {
    const baseConfig = generateToolConfig('windsurf') || {};
    return {
      ...baseConfig,
      enabledServers
    };
  }
}
