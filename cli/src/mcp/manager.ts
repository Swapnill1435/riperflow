import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import fs from 'fs-extra';
import * as path from 'path';
import { getMCPServer, MCPServerConfig, getAnyMCPServer, validateMCPEnv, getServerInstallCommand, isServerInstalled } from './servers.js';

const execAsync = promisify(exec);

export interface MCPManagerOptions {
  projectPath: string;
  verbose?: boolean;
}

/**
 * Installation result with detailed status
 */
export interface InstallResult {
  success: boolean;
  serverName: string;
  message: string;
  installed: boolean;
  envValid: boolean;
  missingEnvVars?: string[];
  error?: Error;
  duration?: number;
}

/**
 * Batch installation results
 */
export interface BatchInstallResult {
  results: InstallResult[];
  successful: number;
  failed: number;
  skipped: number;
  total: number;
}

/**
 * Environment validation result
 */
export interface EnvValidationResult {
  serverName: string;
  valid: boolean;
  missing: string[];
  warnings: string[];
}

export class MCPManager {
  private projectPath: string;
  private verbose: boolean;

  constructor(options: MCPManagerOptions) {
    this.projectPath = options.projectPath;
    this.verbose = options.verbose ?? false;
  }

  private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    if (!this.verbose && level === 'info') return;
    
    const colors: Record<typeof level, (msg: string) => string> = {
      info: chalk.cyan,
      warn: chalk.yellow,
      error: chalk.red
    };
    
    console.log(colors[level](message));
  }

  /**
   * Pre-flight check before installation
   */
  async preflightCheck(serverName: string): Promise<{
    canProceed: boolean;
    alreadyInstalled: boolean;
    envValid: boolean;
    missingEnvVars: string[];
    warnings: string[];
  }> {
    const server = getAnyMCPServer(serverName);
    const warnings: string[] = [];
    
    if (!server) {
      return {
        canProceed: false,
        alreadyInstalled: false,
        envValid: false,
        missingEnvVars: [],
        warnings: ['Server not found in registry']
      };
    }

    if (!server.npmPackage) {
      return {
        canProceed: false,
        alreadyInstalled: false,
        envValid: true,
        missingEnvVars: [],
        warnings: [`${server.name} doesn't require npm installation`]
      };
    }

    // Check if already installed
    const alreadyInstalled = await isServerInstalled(serverName);
    if (alreadyInstalled) {
      warnings.push(`${server.name} is already installed`);
    }

    // Validate environment
    const envValidation = validateMCPEnv(serverName, process.env);
    
    return {
      canProceed: !alreadyInstalled || envValidation.missing.length > 0,
      alreadyInstalled,
      envValid: envValidation.valid,
      missingEnvVars: envValidation.missing,
      warnings
    };
  }

  /**
   * Robust server installation with pre-flight checks and validation
   */
  async installServer(serverName: string, options?: {
    skipEnvCheck?: boolean;
    force?: boolean;
    timeout?: number;
  }): Promise<InstallResult> {
    const startTime = Date.now();
    const server = getAnyMCPServer(serverName);
    
    if (!server) {
      return {
        success: false,
        serverName,
        message: `Unknown MCP server: ${serverName}`,
        installed: false,
        envValid: false,
        duration: Date.now() - startTime
      };
    }

    if (!server.npmPackage) {
      return {
        success: true,
        serverName,
        message: `${server.name} doesn't require npm installation`,
        installed: true,
        envValid: true,
        duration: Date.now() - startTime
      };
    }

    // Pre-flight check
    const preflight = await this.preflightCheck(serverName);
    
    if (preflight.alreadyInstalled && !options?.force) {
      return {
        success: true,
        serverName,
        message: `${server.name} is already installed (use --force to reinstall)`,
        installed: true,
        envValid: preflight.envValid,
        missingEnvVars: preflight.missingEnvVars,
        duration: Date.now() - startTime
      };
    }

    // Check environment unless skipped
    if (!options?.skipEnvCheck && !preflight.envValid) {
      return {
        success: false,
        serverName,
        message: `Environment validation failed: ${preflight.missingEnvVars.join(', ')}`,
        installed: false,
        envValid: false,
        missingEnvVars: preflight.missingEnvVars,
        duration: Date.now() - startTime
      };
    }

    // Perform installation
    try {
      this.log(`Installing ${server.name} MCP server...`);
      
      const installCmd = getServerInstallCommand(serverName, 'global');
      if (!installCmd) {
        throw new Error('No installation command available');
      }

      const timeout = options?.timeout || 120000; // 2 minutes default
      await execAsync(installCmd, { 
        cwd: this.projectPath,
        timeout
      });
      
      // Verify installation
      const verified = await isServerInstalled(serverName);
      
      return {
        success: verified,
        serverName,
        message: verified 
          ? `Successfully installed ${server.name} MCP server`
          : `Installation appeared to succeed but verification failed`,
        installed: verified,
        envValid: preflight.envValid,
        duration: Date.now() - startTime
      };
    } catch (error) {
      const err = error as Error;
      this.log(`Failed to install ${server.name}: ${err.message}`, 'error');
      
      return {
        success: false,
        serverName,
        message: `Installation failed: ${err.message}`,
        installed: false,
        envValid: preflight.envValid,
        missingEnvVars: preflight.missingEnvVars,
        error: err,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Batch install multiple servers
   */
  async installMultipleServers(
    serverNames: string[],
    options?: { skipEnvCheck?: boolean; force?: boolean }
  ): Promise<BatchInstallResult> {
    const results: InstallResult[] = [];
    let successful = 0;
    let failed = 0;
    let skipped = 0;

    for (const serverName of serverNames) {
      const result = await this.installServer(serverName, options);
      results.push(result);
      
      if (result.success) {
        if (result.message.includes('already installed')) {
          skipped++;
        } else {
          successful++;
        }
      } else {
        failed++;
      }
    }

    return {
      results,
      successful,
      failed,
      skipped,
      total: serverNames.length
    };
  }

  /**
   * Uninstall a server with verification
   */
  async uninstallServer(serverName: string, options?: { force?: boolean }): Promise<InstallResult> {
    const startTime = Date.now();
    const server = getAnyMCPServer(serverName);
    
    if (!server || !server.npmPackage) {
      return {
        success: false,
        serverName,
        message: `Unknown MCP server: ${serverName}`,
        installed: false,
        envValid: true,
        duration: Date.now() - startTime
      };
    }

    // Check if actually installed
    const isInstalled = await this.isInstalled(serverName);
    if (!isInstalled && !options?.force) {
      return {
        success: true,
        serverName,
        message: `${server.name} is not installed`,
        installed: false,
        envValid: true,
        duration: Date.now() - startTime
      };
    }

    try {
      this.log(`Uninstalling ${server.name} MCP server...`);
      await execAsync(`npm uninstall -g ${server.npmPackage}`, { cwd: this.projectPath });
      
      // Verify uninstallation
      const stillInstalled = await this.isInstalled(serverName);
      
      return {
        success: !stillInstalled,
        serverName,
        message: stillInstalled 
          ? `Uninstall command ran but ${server.name} still appears to be installed`
          : `Successfully uninstalled ${server.name}`,
        installed: stillInstalled,
        envValid: true,
        duration: Date.now() - startTime
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        serverName,
        message: `Uninstall failed: ${err.message}`,
        installed: true,
        envValid: true,
        error: err,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Validate environment for multiple servers
   */
  async validateEnvironments(serverNames: string[]): Promise<EnvValidationResult[]> {
    return serverNames.map(serverName => {
      const validation = validateMCPEnv(serverName, process.env);
      const warnings: string[] = [];
      
      if (!validation.valid) {
        warnings.push(`Missing environment variables: ${validation.missing.join(', ')}`);
      }
      
      return {
        serverName,
        valid: validation.valid,
        missing: validation.missing,
        warnings
      };
    });
  }

  /**
   * Get detailed status for a server
   */
  async getServerStatus(serverName: string): Promise<{
    installed: boolean;
    envValid: boolean;
    missingEnvVars: string[];
    npmPackage?: string;
    hasConfig: boolean;
  }> {
    const server = getAnyMCPServer(serverName);
    const installed = await isServerInstalled(serverName);
    const envValidation = validateMCPEnv(serverName, process.env);
    
    return {
      installed,
      envValid: envValidation.valid,
      missingEnvVars: envValidation.missing,
      npmPackage: server?.npmPackage,
      hasConfig: !!server && Object.keys(server).some(k => 
        ['cursor', 'claudeCode', 'opencode', 'kilocode', 'vscode'].includes(k)
      )
    };
  }

  async generateToolConfig(serverName: string, tool: string): Promise<string | null> {
    const server = getMCPServer(serverName);
    if (!server) return null;

    const toolConfig = server[tool as keyof MCPServerConfig] as { config: Record<string, unknown> } | undefined;
    if (!toolConfig) return null;

    return JSON.stringify(toolConfig.config, null, 2);
  }

  async isInstalled(serverName: string): Promise<boolean> {
    return isServerInstalled(serverName);
  }

  getRequiredEnvVars(serverName: string): Record<string, string> {
    const server = getMCPServer(serverName);
    return server?.envVars || {};
  }

  async checkAllServers(): Promise<Record<string, boolean>> {
    const servers = ['github', 'websearch', 'browser', 'docker', 'postgres', 'sqlite', 'filesystem', 'memory'];
    const results: Record<string, boolean> = {};

    for (const server of servers) {
      results[server] = await this.isInstalled(server);
    }

    return results;
  }

  getMCPConfigPath(tool: string): string {
    const configPaths: Record<string, string> = {
      cursor: path.join(this.projectPath, '.cursor', 'mcp.json'),
      claudecode: path.join(this.projectPath, '.claude', 'mcp.json'),
      'claude-code': path.join(this.projectPath, '.claude', 'mcp.json'),
      opencode: path.join(this.projectPath, '.opencode', 'mcp.json'),
      kilocode: path.join(this.projectPath, '.kilocode', 'mcp.json'),
      vscode: path.join(this.projectPath, '.vscode', 'mcp.json')
    };
    return configPaths[tool.toLowerCase()] || '';
  }

  /**
   * Generate MCP config for a specific tool with environment substitution
   */
  async generateMCPConfigFile(
    tool: string, 
    servers: string[],
    options?: { 
      substituteEnv?: boolean;
      validateEnv?: boolean;
    }
  ): Promise<{ success: boolean; message: string; filePath?: string; warnings?: string[] }> {
    const configPath = this.getMCPConfigPath(tool);
    if (!configPath) {
      return { success: false, message: `Unknown tool: ${tool}` };
    }

    const warnings: string[] = [];
    
    // Validate environments if requested
    if (options?.validateEnv) {
      const envValidations = await this.validateEnvironments(servers);
      for (const validation of envValidations) {
        if (!validation.valid) {
          warnings.push(...validation.warnings);
        }
      }
    }

    const toolKey = tool.toLowerCase().replace('claude-code', 'claudeCode');
    const mcpServers: Record<string, unknown> = {};

    for (const serverName of servers) {
      const server = getMCPServer(serverName);
      if (!server) {
        warnings.push(`Unknown server: ${serverName}`);
        continue;
      }

      const toolConfig = server[toolKey as keyof MCPServerConfig] as { config: Record<string, unknown> } | undefined;
      if (!toolConfig) {
        warnings.push(`No config available for ${serverName} on ${tool}`);
        continue;
      }

      // Deep clone config for potential environment substitution
      let config = JSON.parse(JSON.stringify(toolConfig.config));
      
      if (options?.substituteEnv) {
        config = this.substituteEnvironmentVariables(config);
      }

      mcpServers[serverName] = config;
    }

    if (Object.keys(mcpServers).length === 0) {
      return { success: false, message: 'No valid server configurations found', warnings };
    }

    try {
      await fs.ensureDir(path.dirname(configPath));

      // Read existing config (if any) so user-defined mcpServers survive.
      let existing: Record<string, unknown> = {};
      if (await fs.pathExists(configPath)) {
        try {
          existing = await fs.readJson(configPath);
        } catch {
          // Corrupt file — overwrite.
          existing = {};
        }
      }

      const existingServers = (existing.mcpServers as Record<string, unknown> | undefined) ?? {};
      const merged = {
        ...existing,
        mcpServers: {
          ...existingServers,
          ...mcpServers, // ours win on collision (documented)
        },
      };

      await fs.writeJson(configPath, merged, { spaces: 2 });
      return {
        success: true,
        message: `MCP config written with ${Object.keys(merged.mcpServers).length} servers`,
        filePath: configPath,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to write config: ${error}`,
        warnings
      };
    }
  }

  /**
   * Substitute environment variables in config
   */
  private substituteEnvironmentVariables(obj: unknown): unknown {
    if (typeof obj === 'string') {
      // Replace ${VAR:-default} or ${VAR} patterns
      return obj.replace(/\$\{([^}]+)\}/g, (match, varExpr) => {
        const [varName, defaultValue] = varExpr.split(':-');
        const envValue = process.env[varName];
        return envValue || defaultValue || match;
      });
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.substituteEnvironmentVariables(item));
    }
    
    if (obj && typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.substituteEnvironmentVariables(value);
      }
      return result;
    }
    
    return obj;
  }

  async generateAllMCPConfigs(servers: string[]): Promise<Record<string, { success: boolean; message: string; filePath?: string }>> {
    const tools = ['cursor', 'claude-code', 'opencode', 'kilocode', 'vscode'];
    const results: Record<string, { success: boolean; message: string; filePath?: string }> = {};

    for (const tool of tools) {
      const result = await this.generateMCPConfigFile(tool, servers);
      results[tool] = result;
    }

    return results;
  }

  /**
   * Get comprehensive system status
   */
  async getSystemStatus(): Promise<{
    totalServers: number;
    installedServers: string[];
    missingServers: string[];
    envIssues: Array<{ server: string; missing: string[] }>;
  }> {
    const allServers = ['github', 'websearch', 'browser', 'docker', 'postgres', 'sqlite', 'filesystem', 'memory'];
    const installed: string[] = [];
    const missing: string[] = [];
    const envIssues: Array<{ server: string; missing: string[] }> = [];

    for (const server of allServers) {
      const isInstalled = await this.isInstalled(server);
      if (isInstalled) {
        installed.push(server);
      } else {
        missing.push(server);
      }

      const envValidation = validateMCPEnv(server, process.env);
      if (!envValidation.valid) {
        envIssues.push({ server, missing: envValidation.missing });
      }
    }

    return {
      totalServers: allServers.length,
      installedServers: installed,
      missingServers: missing,
      envIssues
    };
  }
}

/**
 * Create MCP Manager instance (convenience function)
 */
export function createMCPManager(projectPath: string): MCPManager {
  return new MCPManager({ projectPath });
}
