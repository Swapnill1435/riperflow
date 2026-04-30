import { BaseAdapter, AdapterConfig, AdapterResult } from './base.js';
import { generateHybridRules, generateToolConfig } from './rules-generator.js';
import path from 'path';
import fs from 'fs-extra';

export interface CodexConfig {
  instructions: string;
  mode: string;
  role: string;
  gate: string;
  ripper: {
    enabled: boolean;
    enforcePermissions: boolean;
    checkProtection: boolean;
  };
}

export class CodexAdapter extends BaseAdapter {
  private currentMode?: string;
  private currentRole?: string;
  private currentGate?: string;

  constructor(projectPath: string, options?: { mode?: string; role?: string; gate?: string }) {
    const config: AdapterConfig = {
      name: 'codex',
      displayName: 'OpenAI Codex CLI',
      configDir: '.codex',
      rulesDir: '',
      ruleExtension: '.md'
    };
    super(config, projectPath);
    this.currentMode = options?.mode;
    this.currentRole = options?.role;
    this.currentGate = options?.gate;
  }

  /**
   * Generate Codex instructions
   * Codex uses AGENT.md or codex.md for system instructions
   */
  getRulesContent(): string {
    return generateHybridRules({
      tool: 'codex',
      currentMode: this.currentMode,
      currentRole: this.currentRole,
      currentGate: this.currentGate
    });
  }

  /**
   * Get full Codex AGENT.md content
   */
  getAgentContent(): string {
    const baseRules = this.getRulesContent();
    
    return `# OpenAI Codex CLI - RIPER Configuration

${baseRules}

---

## Codex-Specific Instructions

### Codex CLI Integration
Codex CLI can be run with RIPER mode enforcement:

\`\`\`bash
# Run Codex with RIPER mode
codex --mode research "Analyze this codebase"
codex --mode execute "Implement the feature"
codex --mode review "Check for bugs"
\`\`\`

### Mode-Aware Prompting
When you start Codex in a specific mode, it automatically:
1. Loads the appropriate memory bank files
2. Enforces mode permissions
3. Uses role-appropriate tools
4. Follows gate restrictions

### Codex Commands with RIPER
- **codex /mode [name]** - Switch mode
- **codex /role [name]** - Switch role  
- **codex /gate** - Show gate status
- **codex /protect [path]** - Check protection
- **codex /context** - Load memory bank context

### File Operations
Codex respects RIPER protection levels:
- Reads any file (all modes)
- Writes only in Execute mode (with protection checks)
- Suggests in Innovate/Plan modes
- Reviews in Review mode

### Approval Flow
Codex CLI can be configured to require approval:
\`\`\`json
{
  "autoApprove": {
    "read": true,
    "write": false,
    "command": false
  }
}
\`\`\`

### Memory Bank Access
Codex automatically reads:
- AGENT.md (this file) - system instructions
- .riper/projectbrief.md - project context
- .riper/techContext.md - technical context
- .riper/activeContext.md - current session

Codex updates (in Execute mode):
- .riper/activeContext.md with current work
- .riper/progress.md with completed tasks
`;
  }

  /**
   * Codex uses AGENT.md for instructions
   */
  async install(dryRun: boolean = false): Promise<AdapterResult> {
    const result = await super.install(dryRun);
    if (!result.success) return result;

    const extraFiles: string[] = [];

    const agentPath = path.join(this.projectPath, 'AGENT.md');
    extraFiles.push(agentPath);
    const configPath = path.join(this.projectPath, '.codex', 'config.json');
    extraFiles.push(configPath);
    const instructionsPath = path.join(this.projectPath, '.codex', 'instructions.md');
    extraFiles.push(instructionsPath);

    if (!dryRun) {
      try {
        // Create AGENT.md in project root (Codex convention)
        const agentContent = this.getAgentContent();
        await fs.ensureDir(path.dirname(agentPath));
        await fs.writeFile(agentPath, agentContent, 'utf8');

        // Create .codex/config.json
        const config: CodexConfig = {
          instructions: 'AGENT.md',
          mode: this.currentMode || 'research',
          role: this.currentRole || 'developer',
          gate: this.currentGate || 'design',
          ripper: {
            enabled: true,
            enforcePermissions: true,
            checkProtection: true
          }
        };
        await fs.ensureDir(path.dirname(configPath));
        await fs.writeJson(configPath, config, { spaces: 2 });

        // Create .codex/instructions.md as alternative
        await fs.ensureDir(path.dirname(instructionsPath));
        await fs.writeFile(instructionsPath, agentContent, 'utf8');
      } catch (error) {
        return { success: false, message: `Failed to create Codex config: ${error}` };
      }
    }

    return {
      ...result,
      filesCreated: [...(result.filesCreated ?? []), ...extraFiles]
    };
  }

  /**
   * Update Codex configuration with current BMAD state
   */
  async updateSettings(mode?: string, role?: string, gate?: string): Promise<void> {
    const configPath = path.join(this.projectPath, '.codex', 'config.json');
    const agentPath = path.join(this.projectPath, 'AGENT.md');
    const instructionsPath = path.join(this.projectPath, '.codex', 'instructions.md');
    
    try {
      this.currentMode = mode || this.currentMode;
      this.currentRole = role || this.currentRole;
      this.currentGate = gate || this.currentGate;

      // Update config.json
      if (await fs.pathExists(configPath)) {
        const config = await fs.readJson(configPath);
        config.mode = this.currentMode;
        config.role = this.currentRole;
        config.gate = this.currentGate;
        config.lastUpdated = new Date().toISOString();
        await fs.writeJson(configPath, config, { spaces: 2 });
      }

      // Regenerate AGENT.md with new BMAD context
      const newContent = this.getAgentContent();
      await fs.writeFile(agentPath, newContent, 'utf8');
      await fs.writeFile(instructionsPath, newContent, 'utf8');
    } catch {
      // Silently fail
    }
  }

  /**
   * Get Codex CLI command examples
   */
  getCLIExamples(): string {
    return `
# Codex CLI with RIPER Examples

## Research Mode
\`\`\`bash
codex --mode research "Explain the architecture of this codebase"
codex --mode research --read-only "What does src/core/enforcer.ts do?"
\`\`\`

## Innovate Mode  
\`\`\`bash
codex --mode innovate "Brainstorm caching strategies for this API"
codex --mode innovate "Suggest improvements to the data model"
\`\`\`

## Plan Mode
\`\`\`bash
codex --mode plan "Create implementation plan for user auth"
codex --mode plan --output docs/auth-plan.md "Design the auth system"
\`\`\`

## Execute Mode
\`\`\`bash
codex --mode execute "Implement the login endpoint"
codex --mode execute "Add tests for the user service"
\`\`\`

## Review Mode
\`\`\`bash
codex --mode review "Find bugs in src/components/"
codex --mode review "Check test coverage"
\`\`\`

## With Role Specification
\`\`\`bash
codex --mode execute --role architect "Refactor the core module"
codex --mode execute --role devops "Update deployment script"
\`\`\`
`;
  }

  generateMCPConfig(enabledServers: string[] = []): Record<string, unknown> {
    const baseConfig = generateToolConfig('codex') || {};
    return {
      ...baseConfig,
      enabledServers
    };
  }
}
