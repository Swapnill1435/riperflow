import { MODES, PHASES, MEMORY_FILES, PROTECTION_LEVELS } from '../core/modes.js';
import { ROLES } from '../core/roles.js';
import { GateStage, listGates, type QualityGate } from '../core/gates.js';
import type { ModeDefinition, PermissionMatrix } from '../core/types.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATES_DIR = path.join(__dirname, '../../templates');

function loadTemplate(templateName: string): string | null {
  const templatePath = path.join(TEMPLATES_DIR, 'adapters', templateName);
  if (fs.existsSync(templatePath)) {
    return fs.readFileSync(templatePath, 'utf-8');
  }
  return null;
}

function formatPermissionMatrix(permissions: PermissionMatrix): string {
  const { read, create, update, delete: del } = permissions;
  return `R:${read ? '✓' : '✗'} C:${create ? '✓' : '✗'} U:${update ? '✓' : '✗'} D:${del ? '✓' : '✗'}`;
}

function formatPermissionMatrixSymbolic(permissions: PermissionMatrix): string {
  const { read, create, update, delete: del } = permissions;
  return `{R:${read ? '✓' : '✗'},C:${create ? '✓' : '~'},U:${update ? '✓' : '~'},D:${del ? '✓' : '~'}}`;
}

function generateModePermissionsTable(): string {
  return Object.values(MODES).map(mode => {
    const perms = formatPermissionMatrix(mode.permissions);
    return `| ${mode.symbol} ${mode.emoji} | **${mode.name}** | ${perms} | ${mode.description} |`;
  }).join('\n');
}

function generateModeShortcuts(): string {
  return Object.values(MODES).map(mode => {
    const shortcut = mode.id[0].toLowerCase();
    return `- **/${shortcut}** or **/${mode.id}** - Switch to ${mode.symbol} ${mode.name}`;
  }).join('\n');
}

function generateMemoryFilesTable(): string {
  return Object.values(MEMORY_FILES).map(file => {
    return `| ${file.symbol} ${file.emoji} | **${file.name}** | \`${file.filename}\` | ${file.description} | ~${file.maxSize} tokens |`;
  }).join('\n');
}

function generateProtectionLevelsTable(): string {
  return Object.values(PROTECTION_LEVELS).map(level => {
    return `| ${level.symbol} ${level.emoji} | **${level.name}** | ${level.description} |`;
  }).join('\n');
}

function generateRolesTable(): string {
  return Object.values(ROLES).map(role => {
    const perms = Object.entries(role.permissions)
      .filter(([_, v]) => v)
      .map(([k]) => k)
      .join(', ');
    return `| **${role.name}** | ${role.symbol} | ${role.description} | ${perms} |`;
  }).join('\n');
}

function generateGateStagesTable(): string {
  const gates = listGates();
  return gates.map((gate: QualityGate) => {
    return `| **${gate.name}** | ${gate.symbol} | ${gate.description} | ${gate.requiredApprovals.join(', ')} | None |`;
  }).join('\n');
}

function generateModeInstructions(): string {
  return Object.values(MODES).map(mode => {
    return `### ${mode.symbol} ${mode.emoji} ${mode.name} Mode

**Permissions**: ${formatPermissionMatrix(mode.permissions)}

**Allowed Operations**:
${mode.allowedOperations.map(op => `- ${op}`).join('\n')}

**Forbidden Operations**:
${mode.forbiddenOperations.map(op => `- ${op}`).join('\n')}

**Required Context Files**:
${mode.contextFiles.map(file => `- \`${file}\``).join('\n')}

---`;
  }).join('\n');
}

function generateBMADContext(currentMode?: string, currentRole?: string, currentGate?: string): string {
  const mode = currentMode ? MODES[currentMode as keyof typeof MODES] : null;
  const role = currentRole ? ROLES[currentRole as keyof typeof ROLES] : null;
  
  return `### Current BMAD Context

${mode ? `- **Mode**: ${mode.symbol} ${mode.emoji} ${mode.name}
  - Permissions: ${formatPermissionMatrix(mode.permissions)}
  - Context Required: ${mode.contextFiles.join(', ')}` : '- **Mode**: Not set'}

${role ? `- **Role**: ${role.symbol} ${role.name}
  - Permissions: ${Object.entries(role.permissions).filter(([_, v]) => v).map(([k]) => k).join(', ')}
  - Can approve: ${role.permissions.approve ? 'Yes' : 'No'}` : '- **Role**: Not set'}

${currentGate ? `- **Active Gate**: ${currentGate}` : '- **Gate**: Not set'}

**Protection Registry**: Check \`Σ₆ protection.md\` for locked/frozen regions before any modifications.

**Enforcement**: 
- You MUST verify current mode permissions before operations
- You MUST check protection levels before file modifications
- You MUST respect gate stage blockers
- Violations will be logged to \`.riper/violations.jsonl\``;
}

export function generateHybridRules(options: {
  tool: string;
  currentMode?: string;
  currentRole?: string;
  currentGate?: string;
}): string {
  const { tool = 'universal', currentMode, currentRole, currentGate } = options;
  
  return `# RIPER-for-All - ${tool} Hybrid Rules
*Version: 1.0.0 | Generated: ${new Date().toISOString().split('T')[0]}*

## 📋 TL;DR (Executive Summary)

**Current State**: ${currentMode ? `${MODES[currentMode as keyof typeof MODES]?.symbol} ${MODES[currentMode as keyof typeof MODES]?.name}` : 'Not set'}

**Quick Commands**: /r (research) | /i (innovate) | /p (plan) | /e (execute) | /rev (review)

**Before ANY modification**: Check mode permissions → Verify protection levels → Log to activeContext.md

---

## 🔣 Symbolic Notation (For AI Context Efficiency)

### Core Symbols
- **Ω** (Omega): Modes (Ω₁-Ω₅)
- **ℙ** (P): Permission matrix
- **Σ** (Sigma): Memory files (Σ₁-Σ₆)
- **Ψ** (Psi): Protection levels (Ψ₁-Ψ₆)
- **Π** (Pi): Phases (Π₁-Π₄)
- **Γ** (Gamma): Quality gates
- **ρ** (Rho): Roles

### Permission Encoding
ℙ{R:✓/✗ C:✓/~ U:✓/~ D:✓/~}
- ✓ = Allowed
- ✗ = Forbidden
- ~ = Conditional/Warning

---

## 🎯 Mode Reference (Ω)

${Object.values(MODES).map(mode => `### ${mode.symbol} ${mode.emoji} ${mode.name}
**Encoding**: Ω${mode.id === 'research' ? '₁' : mode.id === 'innovate' ? '₂' : mode.id === 'plan' ? '₃' : mode.id === 'execute' ? '₄' : '₅'}
**Permissions**: ℙ${formatPermissionMatrixSymbolic(mode.permissions)}
**Plain Text**: ${formatPermissionMatrix(mode.permissions)}

${mode.description}

✅ **ALLOWED**:
${mode.allowedOperations.map(op => `- ${op}`).join('\n')}

❌ **FORBIDDEN**:
${mode.forbiddenOperations.map(op => `- ${op}`).join('\n')}

📚 **Context Files**: ${mode.contextFiles.join(', ')}

---`).join('\n')}

## 📁 Memory Files (Σ)

${Object.values(MEMORY_FILES).map(file => `- **${file.symbol} ${file.emoji}** \`${file.filename}\`: ${file.description}`).join('\n')}

## 🛡️ Protection Levels (Ψ)

${Object.values(PROTECTION_LEVELS).map(level => `- **${level.symbol} ${level.emoji} ${level.name}**: ${level.description}`).join('\n')}

## 👤 Roles (ρ)

${Object.values(ROLES).map(role => `- **${role.symbol} ${role.name}**: ${role.description}`).join('\n')}

## 🚦 Quality Gates (Γ)

${listGates().map((gate: QualityGate) => `- **${gate.symbol} ${gate.name}**: ${gate.description} (Requires: ${gate.requiredApprovals.join(', ')})`).join('\n')}

## ⚡ Quick Reference Card

| Command | Mode | Symbol | ℙ(R/C/U/D) |
|---------|------|--------|-----------|
| /r, /research | Research | Ω₁ 🔍 | ${formatPermissionMatrix(MODES.research.permissions)} |
| /i, /innovate | Innovate | Ω₂ 💡 | ${formatPermissionMatrix(MODES.innovate.permissions)} |
| /p, /plan | Plan | Ω₃ 📝 | ${formatPermissionMatrix(MODES.plan.permissions)} |
| /e, /execute | Execute | Ω₄ ⚙️ | ${formatPermissionMatrix(MODES.execute.permissions)} |
| /rev, /review | Review | Ω₅ 🔎 | ${formatPermissionMatrix(MODES.review.permissions)} |

---

${generateBMADContext(currentMode, currentRole, currentGate)}

---

## 🔄 Enforcement Rules (CRITICAL)

1. **ALWAYS** check ℙ before operations
2. **ALWAYS** consult Σ₆ before modifying files
3. **ALWAYS** respect current Γ stage blockers
4. **ALWAYS** log mode switches to activeContext.md
5. **NEVER** exceed mode permissions without explicit approval
6. **NEVER** modify Ψ₁ 🔒 PROTECTED files
7. **NEVER** skip gate requirements

*Violation of these rules will be logged to \`.riper/violations.jsonl\`*

---
*RIPER-for-All v1.0 | ${tool} Adapter | Generated: ${new Date().toISOString().split('T')[0]}*
`;
}

export function generateToolConfig(toolName: string): Record<string, unknown> | null {
  const configs: Record<string, Record<string, unknown>> = {
    cursor: {
      version: '1.0.0',
      rulesLocation: '.cursor/rules/',
      mcpConfig: '.cursor/mcp.json',
      supportedModes: Object.keys(MODES),
      features: ['mode_switching', 'protection_checks', 'gate_awareness']
    },
    'claude-code': {
      version: '1.0.0',
      rulesLocation: '.claude/rules/',
      claudeMdLocation: 'CLAUDE.md',
      mcpConfig: '.claude/mcp.json',
      supportedModes: Object.keys(MODES),
      features: ['mode_switching', 'tool_use_instructions', 'memory_bank_access']
    },
    opencode: {
      version: '1.0.0',
      rulesLocation: '.opencode/',
      agentsLocation: '.opencode/agents/',
      mcpConfig: '.opencode/mcp.json',
      supportedModes: Object.keys(MODES),
      features: ['agent_mode_switching', 'mcp_integration']
    }
  };
  
  return configs[toolName.toLowerCase()] || null;
}

export function estimateTokenCount(content: string): number {
  // Rough estimation: ~4 characters per token on average
  return Math.ceil(content.length / 4);
}

export function validateRulesLength(content: string, maxTokens: number = 2000): { valid: boolean; tokens: number; exceedsBy?: number } {
  const tokens = estimateTokenCount(content);
  if (tokens > maxTokens) {
    return { valid: false, tokens, exceedsBy: tokens - maxTokens };
  }
  return { valid: true, tokens };
}

export function generateUniversalRules(options?: { 
  currentMode?: string; 
  currentRole?: string; 
  currentGate?: string;
  includeBMAD?: boolean;
}): string {
  const opts = { includeBMAD: true, ...options };
  
  const template = loadTemplate('universal.md');
  if (template) {
    return template
      .replace(/{{DATE}}/g, new Date().toISOString().split('T')[0])
      .replace(/{{BMAD_CONTEXT}}/g, opts.includeBMAD ? generateBMADContext(opts.currentMode, opts.currentRole, opts.currentGate) : '');
  }
  
  return `# RIPER-for-All - Universal Rules
*Version: 1.0.0 | Generated: ${new Date().toISOString().split('T')[0]}*

## 📚 Quick Reference

📂 = memory-bank/ | 📦 = memory-bank/backups/

### Modes (Ω) & Permissions (ℙ)

| Mode | Name | Permissions (R/C/U/D) | Description |
|------|------|----------------------|-------------|
${generateModePermissionsTable()}

### Memory Files (Σ)

| ID | Name | File | Purpose | Size |
|----|------|------|---------|------|
${generateMemoryFilesTable()}

### Phases (Π) & Protection (Ψ)

| Phase | Symbol | Description |
|-------|--------|-------------|
| **UNINITIATED** | Π₁ 🌱 | Framework installed but not started |
| **INITIALIZING** | Π₂ 🚧 | Setup in progress |
| **DEVELOPMENT** | Π₃ 🏗️ | Main development work |
| **MAINTENANCE** | Π₄ 🔧 | Long-term support |

| Level | Symbol | Description |
|-------|--------|-------------|
${generateProtectionLevelsTable()}

### Roles (ρ) & Responsibilities

| Role | Symbol | Description | Key Permissions |
|------|--------|-------------|---------------|
${generateRolesTable()}

### Quality Gates (Γ)

| Gate | Symbol | Description | Required Approvals | Blockers |
|------|--------|-------------|-------------------|----------|
${generateGateStagesTable()}

## ⚡ Commands

${generateModeShortcuts()}

## 📋 Mode Details

${generateModeInstructions()}

${opts.includeBMAD ? generateBMADContext(opts.currentMode, opts.currentRole, opts.currentGate) : ''}

## 🛡️ Protection Enforcement

**CRITICAL**: Before ANY file modification:
1. Check current mode permissions (ℙ)
2. Verify protection level (Ψ) in protection.md
3. Confirm gate stage allows modifications
4. Log intended changes to activeContext.md

**Protection Levels**:
- Ψ₁ 🔒 PROTECTED: NEVER modify without explicit approval
- Ψ₂ 🛡️ GUARDED: Ask before modifying
- Ψ₃ ℹ️ INFO: Context notes
- Ψ₄ 🐛 DEBUG: Debugging code
- Ψ₅ 🧪 TEST: Testing code  
- Ψ₆ ⚠️ CRITICAL: Business logic - extra care

## 📂 Files

State: \`.riper/state.json\` | Memory: 📂*.md | Backups: 📦*/

---
*RIPER-for-All - Universal AI Development Framework*
`;
}

export function generateSymbolicRules(options?: {
  currentMode?: string;
  currentRole?: string;
  currentGate?: string;
}): string {
  const template = loadTemplate('cursor.mdc');
  if (template) {
    return template
      .replace(/{{DATE}}/g, new Date().toISOString().split('T')[0])
      .replace(/{{MODE}}/g, options?.currentMode || 'unknown')
      .replace(/{{ROLE}}/g, options?.currentRole || 'unknown')
      .replace(/{{GATE}}/g, options?.currentGate || 'unknown');
  }
  
  return `# RIPER-for-All Σ
*2026 | v1.0*

## Ω/ℙ/Σ/Ψ/Γ System

Ω₁=🔍R→ℙ${formatPermissionMatrixSymbolic(MODES.research.permissions)}→Research
Ω₂=💡I→ℙ${formatPermissionMatrixSymbolic(MODES.innovate.permissions)}→Innovate
Ω₃=📝P→ℙ${formatPermissionMatrixSymbolic(MODES.plan.permissions)}→Plan
Ω₄=⚙️E→ℙ${formatPermissionMatrixSymbolic(MODES.execute.permissions)}→Execute
Ω₅=🔎RV→ℙ${formatPermissionMatrixSymbolic(MODES.review.permissions)}→Review

📂memory-bank/
Σ₁📋projectbrief.md
Σ₂🏛️systemPatterns.md
Σ₃💻techContext.md
Σ₄🔮activeContext.md
Σ₅📊progress.md
Σ₆🛡️protection.md

${Object.values(MODES).map(m => `ℙ${m.symbol}=${formatPermissionMatrixSymbolic(m.permissions)}`).join('\n')}

/r/research /i/innovate /p/plan /e/execute /rev/review

BMAD Context:
M:${options?.currentMode || '?'}
R:${options?.currentRole || '?'}
G:${options?.currentGate || '?'}
`;
}

const TOOL_TEMPLATE_MAP: Record<string, string> = {
  cursor: 'cursor.mdc',
  'claude-code': 'claude.md',
  claudecode: 'claude.md',
  opencode: 'opencode.md',
  kilocode: 'kilocode.md',
  vscode: 'vscode.md',
  roo: 'roo.md',
  aider: 'aider.md',
  windsurf: 'windsurf.md',
  cline: 'cline.md',
  codex: 'codex.md'
};

export function generateToolRules(toolName: string, options?: {
  currentMode?: string;
  currentRole?: string;
  currentGate?: string;
  hybrid?: boolean;
}): string {
  const templateFile = TOOL_TEMPLATE_MAP[toolName.toLowerCase()];
  
  // If hybrid mode is requested, generate hybrid rules
  if (options?.hybrid) {
    return generateHybridRules({ tool: toolName, ...options });
  }
  
  // Try to load tool-specific template
  if (templateFile) {
    const template = loadTemplate(templateFile);
    if (template) {
      return template
        .replace(/{{DATE}}/g, new Date().toISOString().split('T')[0])
        .replace(/{{MODE}}/g, options?.currentMode || 'unknown')
        .replace(/{{ROLE}}/g, options?.currentRole || 'unknown')
        .replace(/{{GATE}}/g, options?.currentGate || 'unknown');
    }
  }
  
  // Fallback to symbolic rules
  return generateSymbolicRules(options);
}
