import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fsPromises } from 'node:fs';
import chalk from 'chalk';
import { loadConfig, loadState } from '../config/loader.js';
import { MODES, PHASES, MEMORY_FILES } from '../core/modes.js';
import { getAnalyticsStorage } from '../analytics/index.js';
import { createFileWatcher, stopFileWatcher, getFileWatcher } from './watcher.js';

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
  detach: boolean;
}

export async function startWebDashboard(options: WebDashboardOptions): Promise<void> {
  const app = express();
  const server = createServer(app);
  
  wss = new WebSocketServer({ server, path: '/ws' });
  
  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(chalk.gray('  WebSocket client connected'));
    
    ws.on('close', () => {
      clients.delete(ws);
    });
  });

  const config = await loadConfig();
  if (config) {
    const watcher = await createFileWatcher(config.projectPath);
    watcher.on('fileChange', (data) => {
      broadcastUpdate({ type: 'fileChange', ...data });
    });
  }

  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

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

  app.post('/api/mode', async (req, res) => {
    try {
      const { mode } = req.body;
      if (!mode) {
        return res.status(400).json({ error: 'Mode is required' });
      }

      const { switchMode } = await import('../core/workflow.js');
      await switchMode(mode as any);
      
      broadcastUpdate({ type: 'modeChange', mode });
      res.json({ success: true, message: `Switched to ${mode} mode` });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
    return;
  });

  app.get('/api/watcher', (req, res) => {
    const watcher = getFileWatcher();
    res.json({
      watching: watcher?.isWatching() || false,
      paths: watcher?.getWatchedPaths() || []
    });
  });

  app.post('/api/watcher/stop', async (req, res) => {
    await stopFileWatcher();
    res.json({ success: true, message: 'File watcher stopped' });
  });

  app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RIPER-for-All Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      min-height: 100vh;
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    header {
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      padding: 30px;
      border-radius: 12px;
      margin-bottom: 24px;
    }
    header h1 { font-size: 2rem; margin-bottom: 8px; }
    header p { opacity: 0.9; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
    .card {
      background: #1e293b;
      border-radius: 12px;
      padding: 20px;
      border: 1px solid #334155;
    }
    .card h2 {
      font-size: 1.1rem;
      color: #94a3b8;
      margin-bottom: 16px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .stat {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid #334155;
    }
    .stat:last-child { border-bottom: none; }
    .stat-label { color: #94a3b8; }
    .stat-value { font-weight: 600; }
    .mode-display {
      text-align: center;
      padding: 20px;
    }
    .mode-emoji { font-size: 4rem; margin-bottom: 12px; }
    .mode-name { font-size: 1.5rem; font-weight: 600; }
    .mode-symbol { color: #94a3b8; margin-top: 4px; }
    .tools-list { list-style: none; }
    .tools-list li {
      padding: 8px 12px;
      background: #334155;
      border-radius: 6px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .tools-list li::before { content: '✓'; color: #22c55e; }
    .chart-container { height: 200px; }
    .btn {
      background: #3b82f6;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 1rem;
      transition: background 0.2s;
    }
    .btn:hover { background: #2563eb; }
    .refresh-info { text-align: center; color: #64748b; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>RIPER-for-All Dashboard</h1>
      <p>Universal RIPER framework for AI coding tools</p>
    </header>

    <div class="grid">
      <div class="card">
        <h2>Current Mode</h2>
        <div class="mode-display">
          <div class="mode-emoji" id="modeEmoji">🔍</div>
          <div class="mode-name" id="modeName">Research</div>
          <div class="mode-symbol" id="modeSymbol">Ω₁</div>
        </div>
      </div>

      <div class="card">
        <h2>Session Stats</h2>
        <div class="stat">
          <span class="stat-label">Started</span>
          <span class="stat-value" id="sessionStart">-</span>
        </div>
        <div class="stat">
          <span class="stat-label">Mode Changes</span>
          <span class="stat-value" id="modeChanges">0</span>
        </div>
        <div class="stat">
          <span class="stat-label">Total Events</span>
          <span class="stat-value" id="totalEvents">0</span>
        </div>
        <div class="stat">
          <span class="stat-label">MCP Actions</span>
          <span class="stat-value" id="mcpActions">0</span>
        </div>
      </div>

      <div class="card">
        <h2>Configured Tools</h2>
        <ul class="tools-list" id="toolsList">
          <li>Loading...</li>
        </ul>
      </div>

      <div class="card">
        <h2>Mode Distribution</h2>
        <div class="chart-container">
          <canvas id="modeChart"></canvas>
        </div>
      </div>
    </div>

    <p class="refresh-info">Auto-refreshing every 5 seconds</p>
  </div>

  <script>
    let modeChart = null;
    let ws = null;

    function connectWebSocket() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(\`\${protocol}//\${window.location.host}/ws\`);
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'fileChange' || data.type === 'modeChange') {
          console.log('Real-time update:', data);
          fetchStatus();
        }
      };
      
      ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting...');
        setTimeout(connectWebSocket, 3000);
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    }

    async function fetchStatus() {
      try {
        const [statusRes, analyticsRes] = await Promise.all([
          fetch('/api/status'),
          fetch('/api/analytics')
        ]);
        
        const status = await statusRes.json();
        const analytics = await analyticsRes.json();

        document.getElementById('modeEmoji').textContent = status.currentMode.emoji;
        document.getElementById('modeName').textContent = status.currentMode.displayName;
        document.getElementById('modeSymbol').textContent = status.currentMode.symbol;

        document.getElementById('sessionStart').textContent = new Date(status.session.startTime).toLocaleString();
        document.getElementById('modeChanges').textContent = status.session.modeHistoryLength;

        if (analytics.stats) {
          document.getElementById('totalEvents').textContent = analytics.stats.totalEvents;
          document.getElementById('mcpActions').textContent = analytics.stats.mcpActions;

          const toolsList = document.getElementById('toolsList');
          const enabledTools = Object.entries(status.tools)
            .filter(([_, enabled]) => enabled)
            .map(([name]) => name);
          toolsList.innerHTML = enabledTools.map(t => \`<li>\${t}</li>\`).join('');

          if (analytics.modeHistory && analytics.modeHistory.length > 0) {
            updateChart(analytics.modeHistory);
          }
        }
      } catch (error) {
        console.error('Error fetching status:', error);
      }
    }

    function updateChart(modeHistory) {
      const ctx = document.getElementById('modeChart').getContext('2d');
      
      if (modeChart) {
        modeChart.destroy();
      }

      modeChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: modeHistory.map(m => m.mode),
          datasets: [{
            label: 'Mode Changes',
            data: modeHistory.map(m => m.count),
            backgroundColor: ['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444'],
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: '#334155' },
              ticks: { color: '#94a3b8' }
            },
            x: {
              grid: { display: false },
              ticks: { color: '#94a3b8' }
            }
          }
        }
      });
    }

    fetchStatus();
    setInterval(fetchStatus, 5000);
    connectWebSocket();
  </script>
</body>
</html>
    `);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.log(chalk.red(`\n❌ Dashboard already running on :${options.port}, or port is in use by another process.`));
        console.log(chalk.gray(`💡 Use --port <n> to pick a different port; or 'riper-for-all dashboard stop' to stop a detached instance.\n`));
        process.exit(1);
      }
      reject(err);
    });

    server.listen(options.port, () => {
      console.log(chalk.cyan.bold('\n🌐 RIPER Web Dashboard'));
      console.log(chalk.gray('─'.repeat(40)));
      console.log(`  Local:   http://localhost:${options.port}`);
      console.log(`  Status:  ${chalk.green('Running')}`);
      console.log(`  WebSocket: ws://localhost:${options.port}/ws\n`);

      if (!options.detach) {
        console.log(chalk.gray('  Press Ctrl+C to stop\n'));
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
}
