export type ProtectionLevel = 'none' | 'warn' | 'confirm' | 'review' | 'locked' | 'frozen';

export interface Protection {
  id: ProtectionLevel;
  name: string;
  symbol: string;
  emoji: string;
  description: string;
  allowsWrite: boolean;
  allowsDelete: boolean;
  requiresApproval: boolean;
}

export const PROTECTION_LEVELS: Record<ProtectionLevel, Protection> = {
  none: {
    id: 'none',
    name: 'Open',
    symbol: '○',
    emoji: '🔓',
    description: 'No restrictions - full access',
    allowsWrite: true,
    allowsDelete: true,
    requiresApproval: false
  },
  warn: {
    id: 'warn',
    name: 'Warn',
    symbol: '⚐',
    emoji: '⚠️',
    description: 'Shows warning before changes',
    allowsWrite: true,
    allowsDelete: true,
    requiresApproval: false
  },
  confirm: {
    id: 'confirm',
    name: 'Confirm',
    symbol: '◉',
    emoji: '✅',
    description: 'Requires confirmation before changes',
    allowsWrite: true,
    allowsDelete: false,
    requiresApproval: false
  },
  review: {
    id: 'review',
    name: 'Review',
    symbol: '◎',
    emoji: '👁️',
    description: 'Requires review before changes',
    allowsWrite: true,
    allowsDelete: false,
    requiresApproval: true
  },
  locked: {
    id: 'locked',
    name: 'Locked',
    symbol: '◈',
    emoji: '🔒',
    description: 'Locked - admin only changes',
    allowsWrite: false,
    allowsDelete: false,
    requiresApproval: true
  },
  frozen: {
    id: 'frozen',
    name: 'Frozen',
    symbol: '❄️',
    emoji: '🧊',
    description: 'Completely frozen - no changes allowed',
    allowsWrite: false,
    allowsDelete: false,
    requiresApproval: false
  }
};

export interface FileProtection {
  path: string;
  level: ProtectionLevel;
  allowedRoles: string[];
  exceptions: string[];
}

export function getProtection(level: string): Protection | undefined {
  return PROTECTION_LEVELS[level as ProtectionLevel];
}

export function listProtectionLevels(): Protection[] {
  return Object.values(PROTECTION_LEVELS);
}

export function canWrite(protection: ProtectionLevel): boolean {
  return PROTECTION_LEVELS[protection].allowsWrite;
}

export function canDelete(protection: ProtectionLevel): boolean {
  return PROTECTION_LEVELS[protection].allowsDelete;
}

export function needsApproval(protection: ProtectionLevel): boolean {
  return PROTECTION_LEVELS[protection].requiresApproval;
}

/**
 * Protection Enforcement Result
 */
export interface ProtectionEnforcementResult {
  allowed: boolean;
  level: ProtectionLevel;
  action: 'read' | 'write' | 'delete';
  reason?: string;
  requiresApproval: boolean;
  severity: 'none' | 'warn' | 'block';
}

/**
 * File Protection Registry - tracks protection levels for files/paths
 */
export interface ProtectionRegistry {
  [path: string]: ProtectionLevel;
}

/**
 * Default protected paths for RIPER memory bank
 */
export const DEFAULT_PROTECTED_PATHS: ProtectionRegistry = {
  '.riper/projectbrief.md': 'locked',
  '.riper/protection.md': 'locked',
  '.cursor/rules/riper.mdc': 'locked',
  '.claude/CLAUDE.md': 'locked',
  '.claude/rules/riper.md': 'locked',
  'AGENTS.md': 'locked'
};

/**
 * Check if an operation is allowed on a protected file
 */
export function checkFileProtection(
  filePath: string,
  action: 'read' | 'write' | 'delete',
  registry: ProtectionRegistry = DEFAULT_PROTECTED_PATHS
): ProtectionEnforcementResult {
  // Determine protection level (check exact match or parent directory)
  let protectionLevel: ProtectionLevel = 'none';
  
  // Check exact match first
  if (registry[filePath]) {
    protectionLevel = registry[filePath];
  } else {
    // Check if file is in a protected directory
    const protectedPaths = Object.keys(registry);
    for (const protectedPath of protectedPaths) {
      if (filePath.startsWith(protectedPath.replace(/\/[^/]*$/, '/'))) {
        protectionLevel = registry[protectedPath];
        break;
      }
    }
  }

  const protection = PROTECTION_LEVELS[protectionLevel];

  // Read is always allowed
  if (action === 'read') {
    return {
      allowed: true,
      level: protectionLevel,
      action,
      requiresApproval: false,
      severity: 'none'
    };
  }

  // frozen - complete block
  if (protectionLevel === 'frozen') {
    return {
      allowed: false,
      level: protectionLevel,
      action,
      reason: `🧊 ${filePath} is FROZEN - no changes allowed EVER`,
      requiresApproval: false,
      severity: 'block'
    };
  }

  // locked - requires admin approval
  if (protectionLevel === 'locked') {
    return {
      allowed: false,
      level: protectionLevel,
      action,
      reason: `🔒 ${filePath} is LOCKED - requires explicit admin approval`,
      requiresApproval: true,
      severity: 'block'
    };
  }

  // review - requires approval but allowed with warning
  if (protectionLevel === 'review') {
    return {
      allowed: true,
      level: protectionLevel,
      action,
      reason: `👁️ ${filePath} requires REVIEW - changes will be flagged`,
      requiresApproval: true,
      severity: 'warn'
    };
  }

  // confirm - requires user confirmation
  if (protectionLevel === 'confirm') {
    return {
      allowed: true,
      level: protectionLevel,
      action,
      reason: `✅ ${filePath} requires CONFIRMATION before changes`,
      requiresApproval: false,
      severity: 'warn'
    };
  }

  // warn - log warning but proceed
  if (protectionLevel === 'warn') {
    return {
      allowed: true,
      level: protectionLevel,
      action,
      reason: `⚠️ ${filePath} has WARNING level protection`,
      requiresApproval: false,
      severity: 'warn'
    };
  }

  // none - no restrictions
  return {
    allowed: true,
    level: 'none',
    action,
    requiresApproval: false,
    severity: 'none'
  };
}

/**
 * Batch check multiple files for protection violations
 */
export function checkBatchProtection(
  filePaths: string[],
  action: 'read' | 'write' | 'delete',
  registry: ProtectionRegistry = DEFAULT_PROTECTED_PATHS
): ProtectionEnforcementResult[] {
  return filePaths.map(path => checkFileProtection(path, action, registry));
}

/**
 * Get all protected files in a directory
 */
export function getProtectedFilesInDirectory(
  directory: string,
  registry: ProtectionRegistry = DEFAULT_PROTECTED_PATHS
): Array<{ path: string; level: ProtectionLevel }> {
  const dirPrefix = directory.endsWith('/') ? directory : `${directory}/`;
  
  return Object.entries(registry)
    .filter(([path]) => path.startsWith(dirPrefix) || path === directory)
    .map(([path, level]) => ({ path, level }));
}

/**
 * Add protection to a file or directory
 */
export function addProtection(
  registry: ProtectionRegistry,
  path: string,
  level: ProtectionLevel
): ProtectionRegistry {
  return {
    ...registry,
    [path]: level
  };
}

/**
 * Remove protection from a file or directory
 */
export function removeProtection(
  registry: ProtectionRegistry,
  path: string
): ProtectionRegistry {
  const newRegistry = { ...registry };
  delete newRegistry[path];
  return newRegistry;
}

/**
 * Check if any files would violate protection on write/delete
 */
export function wouldViolateProtection(
  filePaths: string[],
  action: 'write' | 'delete',
  registry: ProtectionRegistry = DEFAULT_PROTECTED_PATHS
): Array<{ path: string; reason: string }> {
  const violations: Array<{ path: string; reason: string }> = [];
  
  for (const path of filePaths) {
    const result = checkFileProtection(path, action, registry);
    if (!result.allowed || result.severity === 'block') {
      violations.push({
        path,
        reason: result.reason || 'Protection violation'
      });
    }
  }
  
  return violations;
}

/**
 * Format protection result for display
 */
export function formatProtectionResult(result: ProtectionEnforcementResult): string {
  const status = result.allowed ? '✓ ALLOWED' : '✗ BLOCKED';
  const emoji = PROTECTION_LEVELS[result.level]?.emoji || '';
  const symbol = PROTECTION_LEVELS[result.level]?.symbol || '';
  
  let output = `${status} [${symbol} ${emoji} ${result.level.toUpperCase()}] ${result.action.toUpperCase()}`;
  
  if (result.reason) {
    output += `\n  └─ ${result.reason}`;
  }
  
  if (result.requiresApproval) {
    output += '\n  └─ ⚠ Requires explicit approval';
  }
  
  return output;
}
