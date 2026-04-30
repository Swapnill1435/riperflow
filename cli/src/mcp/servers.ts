export interface MCPServerConfig {
  name: string;
  symbol: string;
  description: string;
  package?: string;
  npmPackage?: string;
  envVars: Record<string, string>;
  cursor?: {
    config: Record<string, unknown>;
  };
  claudeCode?: {
    config: Record<string, unknown>;
  };
  opencode?: {
    config: Record<string, unknown>;
  };
  kilocode?: {
    config: Record<string, unknown>;
  };
  vscode?: {
    config: Record<string, unknown>;
  };
}

export const MCPServers: Record<string, MCPServerConfig> = {
  github: {
    name: 'GitHub',
    symbol: 'Θ',
    description: 'Interact with GitHub repositories, issues, PRs',
    npmPackage: '@modelcontextprotocol/server-github',
    envVars: {
      GITHUB_PERSONAL_ACCESS_TOKEN: 'your-github-token'
    },
    cursor: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: {
          GITHUB_PERSONAL_ACCESS_TOKEN: '${GITHUB_TOKEN}'
        }
      }
    },
    claudeCode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github']
      }
    },
    opencode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github']
      }
    },
    kilocode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github']
      }
    },
    vscode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github']
      }
    }
  },
  websearch: {
    name: 'Web Search',
    symbol: 'Λ',
    description: 'Search the web for information',
    npmPackage: '@modelcontextprotocol/server-brave-search',
    envVars: {
      BRAVE_API_KEY: 'your-brave-api-key'
    },
    cursor: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-brave-search'],
        env: {
          BRAVE_API_KEY: '${BRAVE_API_KEY}'
        }
      }
    },
    claudeCode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-brave-search']
      }
    },
    opencode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-brave-search']
      }
    },
    kilocode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-brave-search']
      }
    },
    vscode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-brave-search']
      }
    }
  },
  browser: {
    name: 'Browser',
    symbol: 'Υ',
    description: 'Control a headless browser for web interactions',
    npmPackage: '@modelcontextprotocol/server-playwright',
    envVars: {},
    cursor: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-playwright']
      }
    },
    claudeCode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-playwright']
      }
    },
    opencode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-playwright']
      }
    },
    kilocode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-playwright']
      }
    },
    vscode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-playwright']
      }
    }
  },
  docker: {
    name: 'Docker',
    symbol: 'Ξ',
    description: 'Interact with Docker containers and images',
    npmPackage: '@modelcontextprotocol/server-docker',
    envVars: {
      DOCKER_HOST: 'unix:///var/run/docker.sock'
    },
    cursor: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-docker']
      }
    },
    claudeCode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-docker']
      }
    },
    opencode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-docker']
      }
    },
    kilocode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-docker']
      }
    },
    vscode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-docker']
      }
    }
  }
};

export function getMCPServer(name: string): MCPServerConfig | undefined {
  return MCPServers[name.toLowerCase()];
}

export function listMCPServers(): MCPServerConfig[] {
  return Object.values(MCPServers);
}

/**
 * Get list of available server names
 */
export function listMCPServerNames(): string[] {
  return Object.keys(MCPServers);
}

/**
 * Check if a server is available
 */
export function hasMCPServer(name: string): boolean {
  return name.toLowerCase() in MCPServers;
}

/**
 * Get MCP configuration for a specific tool
 */
export function getToolMCPConfig(
  tool: 'cursor' | 'claudeCode' | 'opencode' | 'kilocode' | 'vscode',
  serverNames: string[]
): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  for (const name of serverNames) {
    const server = getMCPServer(name);
    if (server && server[tool]) {
      config[name] = server[tool].config;
    }
  }

  return config;
}

/**
 * Get environment variables required for enabled servers
 */
export function getRequiredEnvVars(serverNames: string[]): Array<{ server: string; vars: Record<string, string> }> {
  return serverNames
    .map(name => {
      const server = getMCPServer(name);
      if (!server || Object.keys(server.envVars).length === 0) return null;
      return {
        server: name,
        vars: server.envVars
      };
    })
    .filter((item): item is { server: string; vars: Record<string, string> } => item !== null);
}

/**
 * Validate that required environment variables are set
 */
export function validateMCPEnv(
  serverName: string,
  env: Record<string, string | undefined>
): { valid: boolean; missing: string[] } {
  const server = getMCPServer(serverName);
  if (!server) {
    return { valid: false, missing: ['Server not found'] };
  }

  const missing = Object.keys(server.envVars).filter(
    key => !env[key] || env[key] === '' || env[key] === `your-${key.toLowerCase().replace(/_/g, '-')}`
  );

  return { valid: missing.length === 0, missing };
}

/**
 * Get installation command for a server
 */
export function getServerInstallCommand(serverName: string, mode: 'global' | 'npx' = 'npx'): string | null {
  const server = getMCPServer(serverName);
  if (!server?.npmPackage) return null;
  return mode === 'global'
    ? `npm install -g ${server.npmPackage}`
    : `npx -y ${server.npmPackage}`;
}

/**
 * Check if server is installed globally
 */
export async function isServerInstalled(serverName: string): Promise<boolean> {
  const server = getMCPServer(serverName);
  if (!server?.npmPackage) return false;

  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    await execAsync(`npm list -g ${server.npmPackage} --depth=0`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get server categories/types
 */
export function getServerCategory(serverName: string): 'vcs' | 'search' | 'browser' | 'infra' | 'db' | 'fs' | 'memory' | 'unknown' {
  const categories: Record<string, typeof getServerCategory extends (n: string) => infer R ? R : never> = {
    github: 'vcs',
    websearch: 'search',
    browser: 'browser',
    docker: 'infra',
    postgres: 'db',
    sqlite: 'db',
    filesystem: 'fs',
    memory: 'memory'
  };
  
  return categories[serverName.toLowerCase()] || 'unknown';
}

/**
 * Server capability flags
 */
export interface MCPServerCapabilities {
  canRead: boolean;
  canWrite: boolean;
  requiresAuth: boolean;
  networkRequired: boolean;
  localOnly: boolean;
}

/**
 * Get capabilities for a server
 */
export function getServerCapabilities(serverName: string): MCPServerCapabilities | null {
  const caps: Record<string, MCPServerCapabilities> = {
    github: {
      canRead: true,
      canWrite: true,
      requiresAuth: true,
      networkRequired: true,
      localOnly: false
    },
    websearch: {
      canRead: true,
      canWrite: false,
      requiresAuth: true,
      networkRequired: true,
      localOnly: false
    },
    browser: {
      canRead: true,
      canWrite: false,
      requiresAuth: false,
      networkRequired: true,
      localOnly: false
    },
    docker: {
      canRead: true,
      canWrite: true,
      requiresAuth: false,
      networkRequired: false,
      localOnly: true
    },
    postgres: {
      canRead: true,
      canWrite: true,
      requiresAuth: true,
      networkRequired: false,
      localOnly: true
    },
    sqlite: {
      canRead: true,
      canWrite: true,
      requiresAuth: false,
      networkRequired: false,
      localOnly: true
    },
    filesystem: {
      canRead: true,
      canWrite: true,
      requiresAuth: false,
      networkRequired: false,
      localOnly: true
    },
    memory: {
      canRead: true,
      canWrite: true,
      requiresAuth: false,
      networkRequired: false,
      localOnly: true
    }
  };

  return caps[serverName.toLowerCase()] || null;
}

/**
 * Additional MCP Servers
 */
export const ADDITIONAL_MCP_SERVERS: Record<string, MCPServerConfig> = {
  postgres: {
    name: 'PostgreSQL',
    symbol: 'Ρ',
    description: 'Interact with PostgreSQL databases',
    npmPackage: '@modelcontextprotocol/server-postgres',
    envVars: {
      DATABASE_URL: 'postgresql://user:pass@localhost/db'
    },
    cursor: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-postgres'],
        env: {
          DATABASE_URL: '${DATABASE_URL}'
        }
      }
    },
    claudeCode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-postgres']
      }
    },
    opencode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-postgres']
      }
    },
    kilocode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-postgres']
      }
    },
    vscode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-postgres']
      }
    }
  },
  sqlite: {
    name: 'SQLite',
    symbol: 'Σ',
    description: 'Interact with SQLite databases',
    npmPackage: '@modelcontextprotocol/server-sqlite',
    envVars: {},
    cursor: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-sqlite', '${SQLITE_DB_PATH:-./data.db}']
      }
    },
    claudeCode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-sqlite']
      }
    },
    opencode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-sqlite']
      }
    },
    kilocode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-sqlite']
      }
    },
    vscode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-sqlite']
      }
    }
  },
  filesystem: {
    name: 'File System',
    symbol: 'Φ',
    description: 'Read and write files in allowed directories',
    npmPackage: '@modelcontextprotocol/server-filesystem',
    envVars: {},
    cursor: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '${PROJECT_ROOT:-.}']
      }
    },
    claudeCode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '.']
      }
    },
    opencode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '.']
      }
    },
    kilocode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '.']
      }
    },
    vscode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '.']
      }
    }
  },
  memory: {
    name: 'Knowledge Graph Memory',
    symbol: 'Μ',
    description: 'Persistent memory using knowledge graph',
    npmPackage: '@modelcontextprotocol/server-memory',
    envVars: {},
    cursor: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-memory']
      }
    },
    claudeCode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-memory']
      }
    },
    opencode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-memory']
      }
    },
    kilocode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-memory']
      }
    },
    vscode: {
      config: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-memory']
      }
    }
  }
};

/**
 * Merge all servers into complete registry
 */
export const ALL_MCP_SERVERS: Record<string, MCPServerConfig> = {
  ...MCPServers,
  ...ADDITIONAL_MCP_SERVERS
};

/**
 * Get all available servers including additional ones
 */
export function getAllMCPServers(): MCPServerConfig[] {
  return Object.values(ALL_MCP_SERVERS);
}

/**
 * Get a server from complete registry
 */
export function getAnyMCPServer(name: string): MCPServerConfig | undefined {
  return ALL_MCP_SERVERS[name.toLowerCase()];
}
