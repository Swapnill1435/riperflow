import { promises as fs } from 'fs';
import * as path from 'path';
import { Mode } from './types.js';
import { GateStage } from './gates.js';
import { withLock } from '../memory/lock.js';

/**
 * Violation Severity Levels
 */
export type ViolationSeverity = 'info' | 'warn' | 'error' | 'critical';

/**
 * Violation Type - categorizes what kind of violation occurred
 */
export type ViolationType = 
  | 'mode_violation'
  | 'role_violation' 
  | 'gate_violation'
  | 'protection_violation'
  | 'unauthorized_write'
  | 'unauthorized_delete'
  | 'missing_approval'
  | 'blocked_operation'
  | 'invalid_mode_switch'
  | 'invalid_gate_advancement';

/**
 * Violation Record - stores all details about a single violation
 */
export interface ViolationRecord {
  id: string;
  timestamp: string;
  type: ViolationType;
  severity: ViolationSeverity;
  mode: Mode;
  role?: string;
  gate?: GateStage;
  path?: string;
  action?: string;
  description: string;
  reason?: string;
  resolution?: 'blocked' | 'warned' | 'allowed_with_approval' | 'denied';
  metadata?: Record<string, unknown>;
}

/**
 * Violation Logger Configuration
 */
export interface ViolationLoggerConfig {
  projectPath: string;
  logDir: string;
  logFile: string;
  maxEntries: number;
  consoleOutput: boolean;
}

/**
 * Default logger configuration
 */
const DEFAULT_CONFIG: Partial<ViolationLoggerConfig> = {
  logDir: '.riper',
  logFile: 'violations.jsonl',
  maxEntries: 10000,
  consoleOutput: true
};

/**
 * Generate unique violation ID
 */
function generateViolationId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `V-${timestamp}-${random}`.toUpperCase();
}

/**
 * Violation Logger class
 * Handles all violation logging to .riper/violations.jsonl
 */
export class ViolationLogger {
  private config: ViolationLoggerConfig;
  private initialized: boolean = false;

  constructor(projectPath: string, config?: Partial<ViolationLoggerConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      projectPath
    } as ViolationLoggerConfig;
  }

  /**
   * Initialize the logger - ensure directory exists
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const logDir = path.join(this.config.projectPath, this.config.logDir);
    
    try {
      await fs.mkdir(logDir, { recursive: true });
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize violation logger:', error);
      throw error;
    }
  }

  /**
   * Get full path to violations log file
   */
  private getLogFilePath(): string {
    return path.join(
      this.config.projectPath,
      this.config.logDir,
      this.config.logFile
    );
  }

  /**
   * Log a violation
   */
  async log(violation: Omit<ViolationRecord, 'id' | 'timestamp'>): Promise<ViolationRecord> {
    await this.initialize();

    const record: ViolationRecord = {
      ...violation,
      id: generateViolationId(),
      timestamp: new Date().toISOString()
    };

    const logLine = JSON.stringify(record) + '\n';
    const logFile = this.getLogFilePath();

    try {
      // Append to log file under an exclusive lock
      await withLock(logFile, async () => {
        await fs.appendFile(logFile, logLine, 'utf8');
      });

      // Console output if enabled
      if (this.config.consoleOutput) {
        this.logToConsole(record);
      }

      return record;
    } catch (error) {
      console.error('Failed to write violation log:', error);
      // Don't throw - violation logging should be non-blocking
      return record;
    }
  }

  /**
   * Log to console with appropriate formatting
   */
  private logToConsole(record: ViolationRecord): void {
    const severityIcons: Record<ViolationSeverity, string> = {
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌',
      critical: '🚨'
    };

    const icon = severityIcons[record.severity];
    const typeLabel = record.type.replace(/_/g, ' ').toUpperCase();
    
    console.log(`${icon} [${typeLabel}] ${record.description}`);
    
    if (record.reason) {
      console.log(`   └─ Reason: ${record.reason}`);
    }
    
    if (record.path) {
      console.log(`   └─ Path: ${record.path}`);
    }
  }

  /**
   * Log a mode violation
   */
  async logModeViolation(
    mode: Mode,
    action: string,
    reason: string,
    options?: { path?: string; severity?: ViolationSeverity }
  ): Promise<ViolationRecord> {
    return this.log({
      type: 'mode_violation',
      severity: options?.severity || 'error',
      mode,
      action,
      path: options?.path,
      description: `Mode violation: ${action} not allowed in ${mode} mode`,
      reason,
      resolution: 'blocked'
    });
  }

  /**
   * Log a role violation
   */
  async logRoleViolation(
    mode: Mode,
    role: string,
    action: string,
    reason: string,
    options?: { path?: string; severity?: ViolationSeverity }
  ): Promise<ViolationRecord> {
    return this.log({
      type: 'role_violation',
      severity: options?.severity || 'error',
      mode,
      role,
      action,
      path: options?.path,
      description: `Role violation: ${action} not allowed for role ${role}`,
      reason,
      resolution: 'blocked'
    });
  }

  /**
   * Log a gate violation
   */
  async logGateViolation(
    mode: Mode,
    gate: GateStage,
    action: string,
    reason: string,
    options?: { path?: string; severity?: ViolationSeverity }
  ): Promise<ViolationRecord> {
    return this.log({
      type: 'gate_violation',
      severity: options?.severity || 'error',
      mode,
      gate,
      action,
      path: options?.path,
      description: `Gate violation: ${action} blocked at ${gate} gate`,
      reason,
      resolution: 'blocked'
    });
  }

  /**
   * Log a protection violation
   */
  async logProtectionViolation(
    mode: Mode,
    path: string,
    action: string,
    reason: string,
    options?: { severity?: ViolationSeverity }
  ): Promise<ViolationRecord> {
    return this.log({
      type: 'protection_violation',
      severity: options?.severity || 'critical',
      mode,
      path,
      action,
      description: `Protection violation: ${action} on protected file ${path}`,
      reason,
      resolution: 'blocked'
    });
  }

  /**
   * Log an unauthorized write attempt
   */
  async logUnauthorizedWrite(
    mode: Mode,
    path: string,
    reason: string,
    options?: { role?: string; severity?: ViolationSeverity }
  ): Promise<ViolationRecord> {
    return this.log({
      type: 'unauthorized_write',
      severity: options?.severity || 'error',
      mode,
      role: options?.role,
      path,
      action: 'write',
      description: `Unauthorized write attempt: ${path}`,
      reason,
      resolution: 'blocked'
    });
  }

  /**
   * Log an unauthorized delete attempt
   */
  async logUnauthorizedDelete(
    mode: Mode,
    path: string,
    reason: string,
    options?: { role?: string; severity?: ViolationSeverity }
  ): Promise<ViolationRecord> {
    return this.log({
      type: 'unauthorized_delete',
      severity: options?.severity || 'critical',
      mode,
      role: options?.role,
      path,
      action: 'delete',
      description: `Unauthorized delete attempt: ${path}`,
      reason,
      resolution: 'blocked'
    });
  }

  /**
   * Read all violations from log file
   */
  async readViolations(options?: {
    type?: ViolationType;
    severity?: ViolationSeverity;
    since?: Date;
    limit?: number;
  }): Promise<ViolationRecord[]> {
    await this.initialize();

    const logFile = this.getLogFilePath();
    
    try {
      const content = await fs.readFile(logFile, 'utf8');
      const lines = content.trim().split('\n').filter(line => line);
      
      let violations = lines.map(line => {
        try {
          return JSON.parse(line) as ViolationRecord;
        } catch {
          return null;
        }
      }).filter((v): v is ViolationRecord => v !== null);

      // Apply filters
      if (options?.type) {
        violations = violations.filter(v => v.type === options.type);
      }
      
      if (options?.severity) {
        violations = violations.filter(v => v.severity === options.severity);
      }
      
      if (options?.since) {
        const sinceTimestamp = options.since.getTime();
        violations = violations.filter(v => new Date(v.timestamp).getTime() >= sinceTimestamp);
      }

      // Apply limit
      if (options?.limit && options.limit > 0) {
        violations = violations.slice(-options.limit);
      }

      return violations;
    } catch (error) {
      // File doesn't exist or is empty
      return [];
    }
  }

  /**
   * Get violation statistics
   */
  async getStats(): Promise<{
    total: number;
    byType: Record<ViolationType, number>;
    bySeverity: Record<ViolationSeverity, number>;
    recent: ViolationRecord[];
  }> {
    const violations = await this.readViolations();
    
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    
    violations.forEach(v => {
      byType[v.type] = (byType[v.type] || 0) + 1;
      bySeverity[v.severity] = (bySeverity[v.severity] || 0) + 1;
    });

    // Get last 5 violations
    const recent = violations.slice(-5);

    return {
      total: violations.length,
      byType: byType as Record<ViolationType, number>,
      bySeverity: bySeverity as Record<ViolationSeverity, number>,
      recent
    };
  }

  /**
   * Clear all violations (use with caution)
   */
  async clear(): Promise<void> {
    await this.initialize();
    const logFile = this.getLogFilePath();

    try {
      await withLock(logFile, async () => {
        await fs.writeFile(logFile, '', 'utf8');
      });
    } catch (error) {
      console.error('Failed to clear violation log:', error);
    }
  }

  /**
   * Archive old violations to a separate file
   */
  async archive(before?: Date): Promise<string | null> {
    await this.initialize();
    
    const cutoff = before || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const violations = await this.readViolations();
    
    const toArchive = violations.filter(v => new Date(v.timestamp) < cutoff);
    const toKeep = violations.filter(v => new Date(v.timestamp) >= cutoff);
    
    if (toArchive.length === 0) {
      return null;
    }

    const archiveFile = path.join(
      this.config.projectPath,
      this.config.logDir,
      `violations-archive-${Date.now()}.jsonl`
    );

    try {
      await withLock(this.getLogFilePath(), async () => {
        const archiveContent = toArchive.map(v => JSON.stringify(v)).join('\n') + '\n';
        await fs.writeFile(archiveFile, archiveContent, 'utf8');

        // Rewrite main log with kept violations
        const keepContent = toKeep.map(v => JSON.stringify(v)).join('\n') + (toKeep.length > 0 ? '\n' : '');
        await fs.writeFile(this.getLogFilePath(), keepContent, 'utf8');
      });

      return archiveFile;
    } catch (error) {
      console.error('Failed to archive violations:', error);
      return null;
    }
  }
}

/**
 * Create a violation logger instance
 */
export function createViolationLogger(projectPath: string): ViolationLogger {
  return new ViolationLogger(projectPath);
}

/**
 * Quick log function for single violations
 */
export async function logViolation(
  projectPath: string,
  violation: Omit<ViolationRecord, 'id' | 'timestamp'>
): Promise<ViolationRecord> {
  const logger = createViolationLogger(projectPath);
  return logger.log(violation);
}
