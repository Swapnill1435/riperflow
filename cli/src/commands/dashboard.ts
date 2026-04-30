import chalk from 'chalk';
import { spawn } from 'node:child_process';
import fs from 'fs-extra';
import path from 'path';
import { loadConfig, loadState } from '../config/loader.js';
import { MODES, PHASES, MEMORY_FILES } from '../core/modes.js';
import { getAnalyticsStorage } from '../analytics/index.js';

export interface DashboardOptions {
  watch?: boolean;
  interval?: number;
  port?: string;
  detach?: boolean;
}

const PIDFILE = '.riper/dashboard.pid';

export async function dashboardCommand(type?: string, options?: DashboardOptions): Promise<void> {
  // 'stop' is its own subcommand: read pidfile, signal, remove file
  if (type === 'stop') {
    return await stopDetachedDashboard();
  }

  const config = await loadConfig();

  if (!config) {
    console.log(chalk.red('❌ RIPER is not initialized. Run "riper-for-all init" first.'));
    process.exit(1);
  }

  const dashboardType = type || 'tui';

  if (dashboardType === 'tui') {
    if (options?.watch) {
      const intervalNum = typeof options.interval === 'number' ? options.interval : 5000;
      await showTUIDashboardWatch(intervalNum);
    } else {
      await showTUIDashboard();
    }
    return;
  }

  if (dashboardType === 'web') {
    const portNum = typeof options?.port === 'string' ? parseInt(options.port) : 3456;

    if (options?.detach && process.env.RIPER_DASHBOARD_CHILD !== '1') {
      // Parent: spawn the same CLI but with the marker env var so the child
      // skips this branch and runs the server directly. Detach + unref so
      // parent exits.
      const cliEntry = path.resolve(process.argv[1] ?? '');
      const child = spawn(process.execPath, [cliEntry, 'dashboard', 'web', '--port', String(portNum)], {
        env: { ...process.env, RIPER_DASHBOARD_CHILD: '1' },
        detached: true,
        stdio: 'ignore',
        cwd: process.cwd(),
      });
      child.unref();

      // Write pidfile so `dashboard stop` can find this child
      const pidfile = path.join(config.projectPath, PIDFILE);
      await fs.ensureDir(path.dirname(pidfile));
      await fs.writeFile(pidfile, String(child.pid), 'utf-8');

      console.log(chalk.green(`\n🌐 Dashboard started in background (pid ${child.pid}) at http://localhost:${portNum}\n`));
      console.log(chalk.gray(`   Stop with: riper-for-all dashboard stop\n`));
      return;
    }

    // Either foreground mode or the spawned child running detached
    const { startWebDashboard } = await import('../dashboard/index.js');
    await startWebDashboard({
      port: portNum,
      detach: !!options?.detach || process.env.RIPER_DASHBOARD_CHILD === '1',
    });
    return;
  }

  console.log(chalk.red(`\n❌ Unknown dashboard type: ${type}\n`));
  console.log(chalk.gray('Valid types: tui, web, stop\n'));
  process.exit(1);
}

async function stopDetachedDashboard(): Promise<void> {
  const config = await loadConfig();
  const projectPath = config?.projectPath ?? process.cwd();
  const pidfile = path.join(projectPath, PIDFILE);

  if (!(await fs.pathExists(pidfile))) {
    console.log(chalk.yellow('⚠ No dashboard pidfile found — nothing to stop.\n'));
    return;
  }

  const pid = parseInt((await fs.readFile(pidfile, 'utf-8')).trim(), 10);
  if (!Number.isFinite(pid)) {
    console.log(chalk.red('❌ Invalid pidfile content.\n'));
    await fs.remove(pidfile);
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    console.log(chalk.green(`✓ Sent SIGTERM to dashboard (pid ${pid})\n`));
  } catch (e: any) {
    if (e.code === 'ESRCH') {
      console.log(chalk.yellow(`⚠ No such process (pid ${pid}) — pidfile was stale.\n`));
    } else {
      console.log(chalk.red(`❌ Failed to stop dashboard: ${e.message}\n`));
    }
  }
  await fs.remove(pidfile);
}

async function showTUIDashboard(): Promise<void> {
  const config = await loadConfig();
  const state = await loadState();
  const storage = getAnalyticsStorage(config?.projectPath);

  if (!config || !state) {
    console.log(chalk.red('❌ RIPER is not initialized. Run "riper-for-all init" first.'));
    process.exit(1);
  }

  const stats = await storage.getStats();
  const modeHistory = await storage.getModeHistory();

  console.clear();
  console.log(chalk.cyan.bold('╔══════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('║            RIPER-for-All Dashboard                      ║'));
  console.log(chalk.cyan.bold('╚══════════════════════════════════════════════════════════╝'));

  console.log(chalk.bold('\n📍 Current State\n'));
  const mode = MODES[state.currentMode];
  const phase = PHASES[state.currentPhase];
  console.log(`  Mode:  ${mode.emoji} ${mode.name} (${mode.symbol})`);
  console.log(`  Phase: ${phase.emoji} ${phase.name}`);
  console.log(`  Since: ${new Date(state.lastModeChange).toLocaleString()}`);

  console.log(chalk.bold('\n📋 Memory Bank\n'));
  for (const [key, file] of Object.entries(MEMORY_FILES)) {
    console.log(`  ${chalk.green('✓')} ${file.emoji} ${file.filename}`);
  }

  console.log(chalk.bold('\n🔧 Tools\n'));
  const enabledTools = Object.entries(config.tools)
    .filter(([_, enabled]) => enabled)
    .map(([name]) => name);
  if (enabledTools.length === 0) {
    console.log(chalk.yellow('  No tools configured'));
  } else {
    for (const tool of enabledTools) {
      console.log(`  ${chalk.green('✓')} ${tool}`);
    }
  }

  console.log(chalk.bold('\n📈 Session Stats\n'));
  console.log(`  Started:     ${new Date(state.session.startTime).toLocaleString()}`);
  console.log(`  Mode changes: ${state.session.modeHistory.length}`);

  console.log(chalk.bold('\n📊 Analytics\n'));
  console.log(`  Total events: ${stats.totalEvents}`);
  console.log(`  Commands run: ${stats.commandsRun}`);
  console.log(`  MCP actions:  ${stats.mcpActions}`);

  if (modeHistory.length > 0) {
    console.log(chalk.bold('\n  Mode Distribution\n'));
    for (const m of modeHistory) {
      const percent = Math.round((m.count / stats.modeChanges) * 100);
      const bar = '█'.repeat(Math.floor(percent / 10)) + '░'.repeat(10 - Math.floor(percent / 10));
      console.log(`    ${m.mode.padEnd(10)} ${bar} ${percent}%`);
    }
  }

  console.log(chalk.bold('\n💡 Quick Actions\n'));
  console.log(chalk.gray('  riper mode research    # Switch to Research'));
  console.log(chalk.gray('  riper mode innovate   # Switch to Innovate'));
  console.log(chalk.gray('  riper mode plan       # Switch to Plan'));
  console.log(chalk.gray('  riper mode execute    # Switch to Execute'));
  console.log(chalk.gray('  riper mode review     # Switch to Review'));
  console.log(chalk.gray('  riper analytics      # View analytics'));

  console.log(chalk.bold('\n'));
}

async function showTUIDashboardWatch(interval: number): Promise<void> {
  console.log(chalk.cyan('\n🔄 Starting dashboard watch mode (Ctrl+C to exit)\n'));

  let firstRun = true;
  let intervalHandle: NodeJS.Timeout | null = null;

  const cleanup = () => {
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
    // Reset terminal: clear screen, restore cursor visibility
    process.stdout.write('\x1B[2J\x1B[0f\x1B[?25h');
    process.exit(0);
  };

  process.once('SIGINT', cleanup);
  process.once('SIGTERM', cleanup);

  const update = async () => {
    if (!firstRun) {
      process.stdout.write('\x1B[2J\x1B[0f');
    }
    firstRun = false;
    try {
      await showTUIDashboard();
      console.log(chalk.gray(`\n  Last updated: ${new Date().toLocaleTimeString()}`));
      console.log(chalk.gray('  Watching for changes...\n'));
    } catch (error) {
      console.error('Error updating dashboard:', error);
    }
  };

  await update();
  intervalHandle = setInterval(update, interval);
}
