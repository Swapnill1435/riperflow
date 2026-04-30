import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { MCPManager } from '../src/mcp/manager.js';
import { AnalyticsDatabase } from '../src/analytics/database.js';
import { MemoryFileLock } from '../src/memory/lock.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Integration Tests', () => {
  const testProjectPath = path.join(__dirname, '.test-project');

  beforeEach(async () => {
    await fs.ensureDir(testProjectPath);
    await fs.ensureDir(path.join(testProjectPath, '.riper'));
  });

  afterEach(async () => {
    await fs.remove(testProjectPath);
  });

  describe('MCP Manager', () => {
    it('should create MCP manager', () => {
      const manager = new MCPManager({ projectPath: testProjectPath });
      expect(manager).toBeDefined();
    });

    it('should get required env vars for github', async () => {
      const manager = new MCPManager({ projectPath: testProjectPath });
      const envVars = await manager.getRequiredEnvVars('github');
      expect(envVars).toHaveProperty('GITHUB_PERSONAL_ACCESS_TOKEN');
    });

    it('should check if server is not installed', async () => {
      const manager = new MCPManager({ projectPath: testProjectPath });
      const installed = await manager.isInstalled('nonexistent-server');
      expect(installed).toBe(false);
    });
  });

  describe('Analytics Database', () => {
    it('should initialize analytics database', async () => {
      const db = new AnalyticsDatabase(testProjectPath);
      await db.initialize();
      expect(db).toBeDefined();
    });

    it('should record events with fallback', async () => {
      const db = new AnalyticsDatabase(testProjectPath);
      await db.initialize();
      
      const eventId = await db.recordEvent({
        timestamp: new Date().toISOString(),
        type: 'test_event',
        data: { test: true }
      });
      
      // Should return -1 when using fallback (SQLite not available)
      expect(typeof eventId).toBe('number');
    });
  });

  describe('Memory File Lock', () => {
    it('should create lock instance', () => {
      const lock = new MemoryFileLock(testProjectPath);
      expect(lock).toBeDefined();
    });

    it('should acquire and release lock', async () => {
      const lock = new MemoryFileLock(testProjectPath);
      const filePath = path.join(testProjectPath, 'test-file.txt');
      await fs.writeFile(filePath, 'test');
      
      const { release } = await lock.acquireLock(filePath);
      expect(lock.getActiveLocks()).toContain(filePath);
      
      await release();
      expect(lock.getActiveLocks()).not.toContain(filePath);
    });

    it('should check if file is locked', async () => {
      const lock = new MemoryFileLock(testProjectPath);
      const filePath = path.join(testProjectPath, 'test-file.txt');
      await fs.writeFile(filePath, 'test');
      
      const { release } = await lock.acquireLock(filePath);
      const isLocked = await lock.isLocked(filePath);
      expect(isLocked).toBe(true);
      
      await release();
    });
  });

  describe('Tiered Context Loading', () => {
    it('should load tier 1 context', async () => {
      const { loadTieredContext } = await import('../src/memory/loader.js');

      // Create a test memory file
      await fs.writeFile(
        path.join(testProjectPath, '.riper', 'activeContext.md'),
        '# Active Context\n\nTest content'
      );

      const context = await loadTieredContext(testProjectPath, 1);
      expect(context.tier.id).toBe(1);
      expect(context.files.length).toBeGreaterThan(0);
      expect(context.totalTokens).toBeGreaterThan(0);
    });

    it('should load tier 3 context without dereferencing missing keys', async () => {
      const { loadTieredContext } = await import('../src/memory/loader.js');

      for (const name of ['projectbrief.md', 'systemPatterns.md', 'techContext.md', 'progress.md']) {
        await fs.writeFile(path.join(testProjectPath, '.riper', name), `# ${name}\n\nbody`);
      }

      const context = await loadTieredContext(testProjectPath, 3);
      expect(context.tier.id).toBe(3);
      // tier 3 should include core symbols + at least one bank file
      const ids = context.files.map(f => f.id);
      expect(ids).toContain('core-symbols');
      expect(ids.some(id => ['projectbrief', 'systemPatterns', 'techContext', 'progress'].includes(id))).toBe(true);
    });
  });
});
