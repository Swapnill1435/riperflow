import express from 'express';
import { createServer, type Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fsPromises } from 'node:fs';
import crypto from 'node:crypto';
import chalk from 'chalk';
import fs from 'fs-extra';
import { loadConfig, loadState } from '../config/loader.js';
import { MODES, PHASES, MEMORY_FILES } from '../core/modes.js';
import { getAnalyticsStorage } from '../analytics/index.js';
import { createFileWatcher, stopFileWatcher, getFileWatcher } from './watcher.js';
import { enforce, EnforcementError } from '../core/enforce.js';
import { createViolationLogger } from '../core/violations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let wss: WebSocketServer | null = null;
const clients: Set<WebSocket> = new Set();

function broadcastUpdate(data: unknown): void {
  const message = JSON.stringify(data);
  clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

export interface WebDashboardOptions {
  port: number;
  host?: string;
  detach: boolean;
}

async function ensureDashboardToken(projectPath: string): Promise<string> {
  const tokenPath = path.join(projectPath, '.riper', 'dashboard.token');
  if (await fs.pathExists(tokenPath)) {
    const existing = (await fs.readFile(tokenPath, 'utf-8')).trim();
    if (existing.length >= 32) return existing;
  }
  const token = crypto.randomBytes(32).toString('hex');
  await fs.ensureDir(path.dirname(tokenPath));
  await fs.writeFile(tokenPath, token + '\n', { encoding: 'utf-8', mode: 0o600 });
  return token;
}

export async function startWebDashboard(options: WebDashboardOptions): Promise<HttpServer> {
  const app = express();
  const server = createServer(app);
  const host = options.host ?? '127.0.0.1';

  const config = await loadConfig();
  const token = config
    ? await ensureDashboardToken(config.projectPath)
    : crypto.randomBytes(32).toString('hex');

  wss = new WebSocketServer({ server, path: '/ws' });

  // WS auth: token comes via ?token=... query param on the upgrade URL.
  // Constant-time compare; close 1008 (policy violation) on mismatch so
  // the client surfaces a useful error rather than a generic hangup.
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const supplied = url.searchParams.get('token') ?? '';
    const a = Buffer.from(supplied);
    const b = Buffer.from(token);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      ws.close(1008, 'invalid or missing token');
      return;
    }
    clients.add(ws);
    console.log(chalk.gray('  WebSocket client connected'));

    ws.on('close', () => {
      clients.delete(ws);
    });
  });

  if (config) {
    const watcher = await createFileWatcher(config.projectPath);
    watcher.on('fileChange', (data) => {
      broadcastUpdate({ type: 'fileChange', ...data });
    });
  }

  app.use(express.json());

  // Security headers — must register BEFORE express.static so headers apply
  // to every response including the static index.html.
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net");
    next();
  });

  // Serve index.html with the auth token injected so the frontend can
  // attach `X-RIPER-Token` to its API calls. Token is rendered into a
  // <meta> tag (not a global) so the page never leaks it to third-party
  // scripts via window.* and is easy to JSON-encode safely.
  const publicDir = path.join(__dirname, 'public');
  app.get('/', async (_req, res, next) => {
    try {
      const html = await fsPromises.readFile(path.join(publicDir, 'index.html'), 'utf-8');
      const meta = `<meta name="riper-token" content="${token}">`;
      res.type('html').send(html.replace('</head>', `  ${meta}\n</head>`));
    } catch (e) {
      next(e);
    }
  });
  app.use(express.static(publicDir, { index: false }));

  // Token gate — applied to every /api/* route (read and write).
  // Static dashboard assets (HTML/CSS/JS) above remain unauthenticated so the
  // page can load; the page then supplies the token in fetch() headers.
  function requireToken(req: express.Request, res: express.Response, next: express.NextFunction): void {
    const header = req.header('X-RIPER-Token') ?? '';
    // Constant-time compare — pre-check length to avoid timingSafeEqual throwing
    // when buffers are of different lengths.
    const a = Buffer.from(header);
    const b = Buffer.from(token);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      res.status(401).json({ error: 'invalid or missing X-RIPER-Token header' });
      return;
    }
    next();
  }

  app.use('/api', requireToken);

  app.get('/api/status', async (req, res) => {
    try {
      const config = await loadConfig();
      const state = await loadState();

      if (!config || !state) {
        return res.status(404).json({ error: 'RIPER not initialized' });
      }

      const mode = MODES[state.currentMode];
      const phase = PHASES[state.currentPhase];

      res.json({
        projectName: config.projectName,
        projectPath: config.projectPath,
        currentMode: {
          name: state.currentMode,
          displayName: mode.name,
          emoji: mode.emoji,
          symbol: mode.symbol
        },
        currentPhase: {
          name: state.currentPhase,
          displayName: phase.name,
          emoji: phase.emoji
        },
        lastModeChange: state.lastModeChange,
        session: {
          startTime: state.session.startTime,
          modeHistoryLength: state.session.modeHistory.length
        },
        tools: config.tools,
        mcp: config.mcp
      });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
    return;
  });

  app.get('/api/memory', async (_req, res) => {
    try {
      const config = await loadConfig();
      if (!config) {
        return res.status(404).json({ error: 'RIPER not initialized' });
      }

      const memoryFiles: Record<string, { path: string; exists: boolean; bytes: number; mtime: string | null }> = {};
      for (const [key, file] of Object.entries(MEMORY_FILES)) {
        const filePath = path.join(config.projectPath, config.memory.location, file.filename);
        try {
          const stat = await fsPromises.stat(filePath);
          memoryFiles[key] = {
            path: filePath,
            exists: true,
            bytes: stat.size,
            mtime: stat.mtime.toISOString(),
          };
        } catch {
          memoryFiles[key] = { path: filePath, exists: false, bytes: 0, mtime: null };
        }
      }

      res.json(memoryFiles);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
    return;
  });

  app.get('/api/analytics', async (req, res) => {
    try {
      const config = await loadConfig();
      if (!config) {
        return res.status(404).json({ error: 'RIPER not initialized' });
      }

      const storage = getAnalyticsStorage(config.projectPath);
      const stats = await storage.getStats();
      const modeHistory = await storage.getModeHistory();
      const commandUsage = await storage.getCommandUsage();

      res.json({
        stats,
        modeHistory,
        commandUsage
      });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
    return;
  });

  app.get('/api/violations', async (_req, res) => {
    try {
      const config = await loadConfig();
      if (!config) {
        return res.status(404).json({ error: 'RIPER not initialized' });
      }
      const logger = createViolationLogger(config.projectPath);
      await logger.initialize();
      const stats = await logger.getStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
    return;
  });

  app.post('/api/mode', requireToken, async (req, res) => {
    try {
      const { mode } = req.body;
      if (!mode) {
        res.status(400).json({ error: 'Mode is required' });
        return;
      }

      // Wire enforcement so dashboard mode-flips honor the same gate as CLI
      try {
        await enforce('write', '.riper/state.json');
      } catch (e) {
        if (e instanceof EnforcementError) {
          res.status(403).json({ error: e.message });
          return;
        }
        throw e;
      }

      const { switchMode } = await import('../core/workflow.js');
      await switchMode(mode as any);

      broadcastUpdate({ type: 'modeChange', mode });
      res.json({ success: true, message: `Switched to ${mode} mode` });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.get('/api/watcher', (req, res) => {
    const watcher = getFileWatcher();
    res.json({
      watching: watcher?.isWatching() || false,
      paths: watcher?.getWatchedPaths() || []
    });
  });

  app.post('/api/watcher/stop', requireToken, async (_req, res) => {
    await stopFileWatcher();
    res.json({ success: true, message: 'File watcher stopped' });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.log(chalk.red(`\n❌ Dashboard already running on ${host}:${options.port}, or port is in use by another process.`));
        console.log(chalk.gray(`💡 Use --port <n> to pick a different port; or 'riper-for-all dashboard stop' to stop a detached instance.\n`));
        process.exit(1);
      }
      reject(err);
    });

    server.listen(options.port, host, () => {
      console.log(chalk.cyan.bold('\n🌐 RIPER Web Dashboard'));
      console.log(chalk.gray('─'.repeat(40)));
      console.log(`  Local:   http://${host}:${options.port}`);
      console.log(`  Status:  ${chalk.green('Running')}`);
      console.log(`  WebSocket: ws://${host}:${options.port}/ws`);
      if (host !== '127.0.0.1' && host !== 'localhost') {
        console.log(chalk.yellow(`  ⚠ Bound to ${host} — accessible from the network. Auth token required for mutating endpoints.`));
      }
      console.log(chalk.gray(`  Auth token: .riper/dashboard.token (chmod 600)`));
      if (!options.detach) {
        console.log(chalk.gray('\n  Press Ctrl+C to stop\n'));
      }
      resolve();
    });
  });

  const shutdown = async (signal: string) => {
    console.log(chalk.yellow(`\n\nShutting down (${signal})...`));
    await stopFileWatcher();
    if (wss) wss.close();
    server.close(() => process.exit(0));
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}
