import * as fs from 'fs-extra';
import * as path from 'path';
import { MEMORY_FILES } from '../core/modes.js';

export interface ContextTier {
  id: number;
  name: string;
  maxTokens: number;
  description: string;
}

export interface TieredContext {
  tier: ContextTier;
  files: Array<{
    id: string;
    content: string;
    tokens: number;
    priority: number;
  }>;
  totalTokens: number;
}

// Token estimation: ~4 chars per token (rough estimate)
const CHARS_PER_TOKEN = 4;

/**
 * Context Tiers for progressive loading
 * - Tier 1: Core symbols (~500 tokens) - Mode, role, gate indicators
 * - Tier 2: Active context (~200 tokens) - Current session state
 * - Tier 3: Full memory (~800 tokens) - Complete memory bank
 */
export const CONTEXT_TIERS: Record<number, ContextTier> = {
  1: {
    id: 1,
    name: 'Core Symbols',
    maxTokens: 500,
    description: 'Essential BMAD indicators and current state'
  },
  2: {
    id: 2,
    name: 'Active Context',
    maxTokens: 200,
    description: 'Current session and recent changes'
  },
  3: {
    id: 3,
    name: 'Full Memory',
    maxTokens: 800,
    description: 'Complete memory bank with history'
  }
};

/**
 * Estimate token count from text
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Truncate content to fit within token limit
 */
export function truncateToTokens(content: string, maxTokens: number): string {
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  if (content.length <= maxChars) return content;
  
  // Try to truncate at a sensible boundary
  const truncated = content.substring(0, maxChars);
  const lastBoundary = Math.max(
    truncated.lastIndexOf('\n\n'),
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('---')
  );
  
  if (lastBoundary > maxChars * 0.8) {
    return truncated.substring(0, lastBoundary) + '\n\n[...truncated...]';
  }
  
  return truncated + '\n\n[...truncated...]';
}

/**
 * Load context for a specific tier
 */
export async function loadTieredContext(
  projectPath: string,
  tier: number,
  options?: {
    currentMode?: string;
    currentRole?: string;
    currentGate?: string;
  }
): Promise<TieredContext> {
  const tierConfig = CONTEXT_TIERS[tier];
  if (!tierConfig) {
    throw new Error(`Invalid context tier: ${tier}`);
  }

  const riperDir = path.join(projectPath, '.riper');
  const files: TieredContext['files'] = [];
  let totalTokens = 0;

  // Tier 1: Core symbols only
  if (tier >= 1) {
    const coreContent = generateCoreSymbols(options);
    const tokens = estimateTokens(coreContent);
    files.push({
      id: 'core-symbols',
      content: coreContent,
      tokens,
      priority: 1
    });
    totalTokens += tokens;
  }

  // Tier 2: Active context
  if (tier >= 2) {
    const activeContextPath = path.join(riperDir, MEMORY_FILES.activeContext.filename);
    if (await fs.pathExists(activeContextPath)) {
      const content = await fs.readFile(activeContextPath, 'utf-8');
      const tokens = estimateTokens(content);
      const availableTokens = tierConfig.maxTokens - totalTokens;
      
      files.push({
        id: 'active-context',
        content: truncateToTokens(content, availableTokens),
        tokens: Math.min(tokens, availableTokens),
        priority: 2
      });
      totalTokens += Math.min(tokens, availableTokens);
    }
  }

  // Tier 3: Full memory bank
  if (tier >= 3) {
    const memoryFiles = [
      { id: 'projectbrief', file: MEMORY_FILES.projectbrief },
      { id: 'systemPatterns', file: MEMORY_FILES.systemPatterns },
      { id: 'techContext', file: MEMORY_FILES.techContext },
      { id: 'progress', file: MEMORY_FILES.progress }
    ];

    for (const { id, file } of memoryFiles) {
      const filePath = path.join(riperDir, file.filename);
      if (await fs.pathExists(filePath)) {
        const content = await fs.readFile(filePath, 'utf-8');
        const tokens = estimateTokens(content);
        const availableTokens = tierConfig.maxTokens - totalTokens;
        
        if (availableTokens > 50) { // Minimum chunk size
          files.push({
            id,
            content: truncateToTokens(content, availableTokens),
            tokens: Math.min(tokens, availableTokens),
            priority: 3
          });
          totalTokens += Math.min(tokens, availableTokens);
        }
      }
    }
  }

  return {
    tier: tierConfig,
    files,
    totalTokens
  };
}

/**
 * Generate core symbols content
 */
function generateCoreSymbols(options?: {
  currentMode?: string;
  currentRole?: string;
  currentGate?: string;
}): string {
  const lines = [
    '# RIPER Core Context',
    '',
    `Mode: ${options?.currentMode || 'research'}`,
    `Role: ${options?.currentRole || 'dev'}`,
    `Gate: ${options?.currentGate || 'design'}`,
    '',
    '## Mode Permissions',
    '- Research: Read-only',
    '- Innovate: Suggest only',
    '- Plan: Docs/plans only',
    '- Execute: Full access',
    '- Review: Read + approve',
    '',
    '## Quick Commands',
    '- /mode <name> - Switch mode',
    '- /role <name> - Switch role',
    '- /gate - Show gate status',
    '- /protect <path> - Check protection',
  ];

  return lines.join('\n');
}

/**
 * Smart context loader that selects appropriate tier based on operation
 */
export async function loadSmartContext(
  projectPath: string,
  operation: 'read' | 'write' | 'plan' | 'review',
  options?: {
    currentMode?: string;
    currentRole?: string;
    currentGate?: string;
  }
): Promise<TieredContext> {
  // Select tier based on operation type
  const tierMap: Record<string, number> = {
    read: 1,    // Core symbols only for simple reads
    write: 2,   // Active context for writes
    plan: 3,    // Full memory for planning
    review: 2   // Active context for reviews
  };

  const tier = tierMap[operation] || 1;
  return loadTieredContext(projectPath, tier, options);
}

/**
 * Format context for LLM consumption
 */
export function formatContextForLLM(context: TieredContext): string {
  const sections: string[] = [
    `<!-- RIPER Context: ${context.tier.name} (${context.totalTokens} tokens) -->`,
    ''
  ];

  // Sort by priority
  const sortedFiles = [...context.files].sort((a, b) => a.priority - b.priority);

  for (const file of sortedFiles) {
    sections.push(file.content);
    sections.push('');
    sections.push('---');
    sections.push('');
  }

  return sections.join('\n');
}

/**
 * Get context statistics
 */
export async function getContextStats(projectPath: string): Promise<{
  totalFiles: number;
  totalTokens: number;
  byTier: Record<number, { files: number; tokens: number }>;
}> {
  const byTier: Record<number, { files: number; tokens: number }> = {};

  for (let tier = 1; tier <= 3; tier++) {
    const context = await loadTieredContext(projectPath, tier);
    byTier[tier] = {
      files: context.files.length,
      tokens: context.totalTokens
    };
  }

  return {
    totalFiles: byTier[3].files,
    totalTokens: byTier[3].tokens,
    byTier
  };
}
