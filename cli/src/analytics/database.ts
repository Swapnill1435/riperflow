import fs from 'fs-extra';
import * as path from 'path';
import type { AnalyticsStorage } from './storage.js';

// Use any for SQLite database type since it's dynamically loaded
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SQLiteDatabase = any;

// Re-export types
export interface AnalyticsEvent {
  id?: number;
  timestamp: string;
  type: string;
  data: Record<string, unknown>;
  sessionId?: string;
  tool?: string;
}

export interface SessionRecord {
  id: string;
  startTime: string;
  endTime?: string;
  modeChanges: number;
  commandsRun: number;
  projectPath: string;
}

/**
 * SQLite-backed analytics storage with JSONL fallback
 * Provides high-performance querying when SQLite is available
 */
export class AnalyticsDatabase {
  private db: SQLiteDatabase | null = null;
  private dbPath: string;
  private projectPath: string;
  private fallbackStorage?: AnalyticsStorage;
  private sqliteAvailable: boolean = false;

  constructor(projectPath: string, fallbackStorage?: AnalyticsStorage) {
    this.projectPath = projectPath;
    this.dbPath = path.join(projectPath, '.riper', 'analytics.db');
    this.fallbackStorage = fallbackStorage;
  }

  /**
   * Try to load better-sqlite3 dynamically
   */
  private async loadSQLite(): Promise<SQLiteDatabase | null> {
    try {
      // Dynamic import with module path as variable to avoid TS errors
      const moduleName = 'better-sqlite3';
      const sqlite = await import(moduleName);
      return sqlite.default;
    } catch {
      return null;
    }
  }

  /**
   * Initialize database and create tables
   */
  async initialize(): Promise<void> {
    const SQLite = await this.loadSQLite();
    
    if (!SQLite) {
      this.sqliteAvailable = false;
      return;
    }

    try {
      await fs.ensureDir(path.dirname(this.dbPath));
      
      this.db = new SQLite(this.dbPath);
      
      // Enable WAL mode for better performance
      this.db.pragma('journal_mode = WAL');
      
      // Create tables
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          type TEXT NOT NULL,
          data JSON,
          session_id TEXT,
          tool TEXT
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
          end_time DATETIME,
          mode_changes INTEGER DEFAULT 0,
          commands_run INTEGER DEFAULT 0,
          project_path TEXT
        );

        CREATE TABLE IF NOT EXISTS mode_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT,
          from_mode TEXT,
          to_mode TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
        CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
        CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
        CREATE INDEX IF NOT EXISTS idx_mode_history_session ON mode_history(session_id);
      `);
      
      this.sqliteAvailable = true;
    } catch (error) {
      this.sqliteAvailable = false;
      this.db = null;
    }
  }

  /**
   * Check if SQLite is being used
   */
  isSQLiteAvailable(): boolean {
    return this.sqliteAvailable;
  }

  /**
   * Ensure database is initialized
   */
  private ensureDb(): SQLiteDatabase {
    if (!this.db || !this.sqliteAvailable) {
      throw new Error('SQLite not available. Use fallback storage instead.');
    }
    return this.db;
  }

  /**
   * Record an analytics event
   */
  async recordEvent(event: Omit<AnalyticsEvent, 'id'>): Promise<number> {
    if (!this.sqliteAvailable) {
      if (this.fallbackStorage) {
        await this.fallbackStorage.write({
          timestamp: event.timestamp,
          event: event.type,
          data: event.data,
          tool: event.tool
        });
      }
      return -1;
    }

    const db = this.ensureDb();
    
    const stmt = db.prepare(`
      INSERT INTO events (timestamp, type, data, session_id, tool)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      event.timestamp,
      event.type,
      JSON.stringify(event.data),
      event.sessionId || null,
      event.tool || null
    );
    
    return Number(result.lastInsertRowid);
  }

  /**
   * Start a new session
   */
  async startSession(sessionId: string): Promise<void> {
    if (!this.sqliteAvailable) return;

    const db = this.ensureDb();
    
    const stmt = db.prepare(`
      INSERT INTO sessions (id, project_path, start_time)
      VALUES (?, ?, ?)
    `);
    
    stmt.run(sessionId, this.projectPath, new Date().toISOString());
  }

  /**
   * End a session
   */
  async endSession(sessionId: string): Promise<void> {
    if (!this.sqliteAvailable) return;

    const db = this.ensureDb();
    
    const stmt = db.prepare(`
      UPDATE sessions 
      SET end_time = ?
      WHERE id = ?
    `);
    
    stmt.run(new Date().toISOString(), sessionId);
  }

  /**
   * Record a mode change
   */
  async recordModeChange(
    sessionId: string, 
    fromMode: string, 
    toMode: string
  ): Promise<void> {
    if (!this.sqliteAvailable) return;

    const db = this.ensureDb();
    
    // Add to mode_history
    const historyStmt = db.prepare(`
      INSERT INTO mode_history (session_id, from_mode, to_mode)
      VALUES (?, ?, ?)
    `);
    
    historyStmt.run(sessionId, fromMode, toMode);
    
    // Update session mode_changes count
    const updateStmt = db.prepare(`
      UPDATE sessions 
      SET mode_changes = mode_changes + 1
      WHERE id = ?
    `);
    
    updateStmt.run(sessionId);
  }

  /**
   * Get events with filtering (SQLite only)
   */
  async getEvents(options?: {
    type?: string;
    since?: Date;
    until?: Date;
    limit?: number;
    sessionId?: string;
  }): Promise<AnalyticsEvent[]> {
    if (!this.sqliteAvailable) return [];

    const db = this.ensureDb();
    
    let query = 'SELECT * FROM events WHERE 1=1';
    const params: (string | number)[] = [];
    
    if (options?.type) {
      query += ' AND type = ?';
      params.push(options.type);
    }
    
    if (options?.since) {
      query += ' AND timestamp >= ?';
      params.push(options.since.toISOString());
    }
    
    if (options?.until) {
      query += ' AND timestamp <= ?';
      params.push(options.until.toISOString());
    }
    
    if (options?.sessionId) {
      query += ' AND session_id = ?';
      params.push(options.sessionId);
    }
    
    query += ' ORDER BY timestamp DESC';
    
    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }
    
    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as Array<{
      id: number;
      timestamp: string;
      type: string;
      data: string;
      session_id: string;
      tool: string;
    }>;
    
    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      type: row.type,
      data: JSON.parse(row.data),
      sessionId: row.session_id,
      tool: row.tool
    }));
  }

  /**
   * Get comprehensive statistics (SQLite only)
   */
  async getStats(): Promise<{
    totalEvents: number;
    totalSessions: number;
    modeChanges: number;
    eventsByType: Record<string, number>;
    eventsByDay: Array<{ date: string; count: number }>;
  } | null> {
    if (!this.sqliteAvailable) return null;

    const db = this.ensureDb();
    
    // Total events
    const totalEvents = (db.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number }).count;
    
    // Total sessions
    const totalSessions = (db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number }).count;
    
    // Mode changes
    const modeChanges = (db.prepare('SELECT COUNT(*) as count FROM mode_history').get() as { count: number }).count;
    
    // Events by type
    const typeStmt = db.prepare(`
      SELECT type, COUNT(*) as count 
      FROM events 
      GROUP BY type 
      ORDER BY count DESC
    `);
    const typeRows = typeStmt.all() as Array<{ type: string; count: number }>;
    const eventsByType: Record<string, number> = {};
    for (const row of typeRows) {
      eventsByType[row.type] = row.count;
    }
    
    // Events by day (last 30 days)
    const dayStmt = db.prepare(`
      SELECT date(timestamp) as date, COUNT(*) as count
      FROM events
      WHERE timestamp >= date('now', '-30 days')
      GROUP BY date(timestamp)
      ORDER BY date
    `);
    const eventsByDay = dayStmt.all() as Array<{ date: string; count: number }>;
    
    return {
      totalEvents,
      totalSessions,
      modeChanges,
      eventsByType,
      eventsByDay
    };
  }

  /**
   * Get weekly summary (SQLite only)
   */
  async getWeeklySummary(): Promise<{
    weekStart: string;
    totalEvents: number;
    modeChanges: number;
    topCommands: Array<{ command: string; count: number }>;
    violations: number;
  } | null> {
    if (!this.sqliteAvailable) return null;

    const db = this.ensureDb();
    
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    
    // Events this week
    const eventsStmt = db.prepare(`
      SELECT COUNT(*) as count FROM events 
      WHERE timestamp >= ?
    `);
    const totalEvents = (eventsStmt.get(weekStart.toISOString()) as { count: number }).count;
    
    // Mode changes this week
    const modeStmt = db.prepare(`
      SELECT COUNT(*) as count FROM mode_history
      WHERE timestamp >= ?
    `);
    const modeChanges = (modeStmt.get(weekStart.toISOString()) as { count: number }).count;
    
    // Top commands
    const cmdStmt = db.prepare(`
      SELECT json_extract(data, '$.command') as command, COUNT(*) as count
      FROM events
      WHERE type = 'command_run' AND timestamp >= ?
      GROUP BY json_extract(data, '$.command')
      ORDER BY count DESC
      LIMIT 5
    `);
    const topCommands = cmdStmt.all(weekStart.toISOString()) as Array<{ command: string; count: number }>;
    
    // Violations
    const violStmt = db.prepare(`
      SELECT COUNT(*) as count FROM events
      WHERE type LIKE 'violation_%' AND timestamp >= ?
    `);
    const violations = (violStmt.get(weekStart.toISOString()) as { count: number }).count;
    
    return {
      weekStart: weekStart.toISOString(),
      totalEvents,
      modeChanges,
      topCommands,
      violations
    };
  }

  /**
   * Migrate from JSONL to SQLite
   */
  async migrateFromJSONL(jsonlPath: string): Promise<{ migrated: number; errors: number }> {
    if (!this.sqliteAvailable || !this.db) {
      return { migrated: 0, errors: 0 };
    }
    
    if (!await fs.pathExists(jsonlPath)) {
      return { migrated: 0, errors: 0 };
    }
    
    const content = await fs.readFile(jsonlPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    
    let migrated = 0;
    let errors = 0;
    
    const db = this.db;
    const stmt = db.prepare(`
      INSERT INTO events (timestamp, type, data, tool)
      VALUES (?, ?, ?, ?)
    `);
    
    const events = lines
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((e): e is { timestamp: string; event: string; data: Record<string, unknown>; tool?: string } => e !== null);
    
    for (const event of events) {
      try {
        stmt.run(
          event.timestamp,
          event.event,
          JSON.stringify(event.data),
          event.tool || null
        );
        migrated++;
      } catch {
        errors++;
      }
    }
    
    return { migrated, errors };
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Get database file path
   */
  getDbPath(): string {
    return this.dbPath;
  }
}

let dbInstance: AnalyticsDatabase | null = null;

export function getAnalyticsDatabase(projectPath: string, fallbackStorage?: AnalyticsStorage): AnalyticsDatabase {
  if (!dbInstance) {
    dbInstance = new AnalyticsDatabase(projectPath, fallbackStorage);
  }
  return dbInstance;
}

export function createAnalyticsDatabase(projectPath: string, fallbackStorage?: AnalyticsStorage): AnalyticsDatabase {
  return new AnalyticsDatabase(projectPath, fallbackStorage);
}
