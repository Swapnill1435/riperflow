import * as lockfile from 'proper-lockfile';
import * as path from 'path';
import * as fs from 'fs-extra';

export interface LockOptions {
  stale?: number;      // Consider lock stale after X ms (default: 10000)
  updateInterval?: number;  // Update lock file every X ms (default: 5000)
  retries?: number;    // Number of retries (default: 10)
  realpath?: boolean;  // Resolve symlinks (default: true)
}

export interface LockInfo {
  file: string;
  owner: string;
  acquiredAt: string;
}

/**
 * File locking mechanism for RIPER memory files
 * Prevents concurrent modifications using proper-lockfile
 */
export class MemoryFileLock {
  private projectPath: string;
  private locks: Map<string, () => Promise<void>> = new Map();

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Acquire lock on a file
   */
  async acquireLock(
    filePath: string, 
    options?: LockOptions
  ): Promise<{ release: () => Promise<void>; update: () => Promise<void> }> {
    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(this.projectPath, filePath);

    // Ensure file exists before locking
    await fs.ensureFile(fullPath);

    const lockOptions = {
      stale: options?.stale ?? 10000,
      updateInterval: options?.updateInterval ?? 5000,
      retries: options?.retries ?? 10,
      realpath: options?.realpath ?? true
    };

    try {
      const release = await lockfile.lock(fullPath, lockOptions);
      
      // Store release function
      this.locks.set(fullPath, release);

      // Return release function and update function
      return {
        release: async () => {
          await release();
          this.locks.delete(fullPath);
        },
        update: async () => {
          // proper-lockfile handles updates automatically
          // This is here for API compatibility
        }
      };
    } catch (error) {
      throw new Error(`Failed to acquire lock on ${filePath}: ${error}`);
    }
  }

  /**
   * Try to acquire lock without waiting
   */
  async tryLock(
    filePath: string,
    options?: LockOptions
  ): Promise<{ release: () => Promise<void>; update: () => Promise<void> } | null> {
    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(this.projectPath, filePath);

    await fs.ensureFile(fullPath);

    const lockOptions = {
      ...options,
      stale: options?.stale ?? 10000,
      updateInterval: options?.updateInterval ?? 5000,
      retries: 0, // Don't retry, fail immediately
      realpath: options?.realpath ?? true
    };

    try {
      const release = await lockfile.lock(fullPath, lockOptions);
      
      this.locks.set(fullPath, release);

      return {
        release: async () => {
          await release();
          this.locks.delete(fullPath);
        },
        update: async () => {
          // No-op - proper-lockfile handles updates
        }
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if a file is locked
   */
  async isLocked(filePath: string): Promise<boolean> {
    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(this.projectPath, filePath);

    return lockfile.check(fullPath);
  }

  /**
   * Release all held locks
   */
  async releaseAll(): Promise<void> {
    const releases = Array.from(this.locks.entries());
    
    for (const [filePath, release] of releases) {
      try {
        await release();
        this.locks.delete(filePath);
      } catch (error) {
        console.warn(`Failed to release lock on ${filePath}:`, error);
      }
    }
  }

  /**
   * Get lock info for a file
   */
  async getLockInfo(filePath: string): Promise<LockInfo | null> {
    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(this.projectPath, filePath);

    const isLocked = await lockfile.check(fullPath);
    if (!isLocked) return null;

    // Read lock file content if available
    try {
      const lockFilePath = `${fullPath}.lock`;
      if (await fs.pathExists(lockFilePath)) {
        const content = await fs.readFile(lockFilePath, 'utf-8');
        const parsed = JSON.parse(content);
        return {
          file: filePath,
          owner: parsed.owner || 'unknown',
          acquiredAt: parsed.time || 'unknown'
        };
      }
    } catch {
      // Ignore parse errors
    }

    return {
      file: filePath,
      owner: 'unknown',
      acquiredAt: 'unknown'
    };
  }

  /**
   * Wait for lock to be released
   */
  async waitForLock(
    filePath: string, 
    timeout: number = 30000
  ): Promise<boolean> {
    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(this.projectPath, filePath);

    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      const isLocked = await lockfile.check(fullPath);
      if (!isLocked) return true;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return false;
  }

  /**
   * Execute operation with automatic locking
   */
  async withLock<T>(
    filePath: string,
    operation: () => Promise<T>,
    options?: LockOptions
  ): Promise<T> {
    const { release } = await this.acquireLock(filePath, options);
    
    try {
      return await operation();
    } finally {
      await release();
    }
  }

  /**
   * Get all active locks held by this instance
   */
  getActiveLocks(): string[] {
    return Array.from(this.locks.keys());
  }
}

let lockInstance: MemoryFileLock | null = null;

export function getMemoryFileLock(projectPath: string): MemoryFileLock {
  if (!lockInstance) {
    lockInstance = new MemoryFileLock(projectPath);
  }
  return lockInstance;
}

export function createMemoryFileLock(projectPath: string): MemoryFileLock {
  return new MemoryFileLock(projectPath);
}

/**
 * Free-function lock helper. Serializes concurrent writers on `file` via
 * proper-lockfile. The file is created if missing. The lock is released
 * even when `fn` throws.
 */
export async function withLock<T>(
  file: string,
  fn: () => Promise<T>,
  options?: { retries?: number; minTimeout?: number; maxTimeout?: number; stale?: number }
): Promise<T> {
  await fs.ensureFile(file);

  const release = await lockfile.lock(file, {
    retries: {
      retries: options?.retries ?? 20,
      minTimeout: options?.minTimeout ?? 10,
      maxTimeout: options?.maxTimeout ?? 100,
    },
    stale: options?.stale ?? 10000,
    realpath: false,
  });

  try {
    return await fn();
  } finally {
    await release();
  }
}
