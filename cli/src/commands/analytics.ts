import chalk from 'chalk';
import fs from 'fs-extra';
import { loadConfig } from '../config/loader.js';
import { getAnalyticsStorage } from '../analytics/index.js';
import { AnalyticsDatabase } from '../analytics/database.js';

export interface AnalyticsOptions {
  format?: string;
  limit?: string | number;
  since?: string;
  output?: string;
}

export async function analyticsCommand(action: string | undefined, options: AnalyticsOptions): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    console.log(chalk.red('❌ RIPER is not initialized.'));
    process.exit(1);
  }

  const sub = (action ?? 'stats').toLowerCase();

  switch (sub) {
    case 'stats':
      return await runStats(config.projectPath);
    case 'weekly':
      return await runWeekly(config.projectPath);
    case 'export':
      return await runExport(config.projectPath, options);
    case 'migrate':
      return await runMigrate(config.projectPath);
    default:
      console.log(chalk.red(`\n❌ Unknown action: ${action}\n`));
      console.log(chalk.gray('Valid actions: stats, weekly, export, migrate\n'));
      process.exit(1);
  }
}

async function runStats(projectPath: string): Promise<void> {
  const storage = getAnalyticsStorage(projectPath);
  await storage.snapshot();

  console.log(chalk.bold('\n📊 Analytics Summary\n'));
  const stats = await storage.getStats();

  if (stats.totalEvents === 0) {
    console.log(chalk.yellow('  No analytics data yet.\n'));
    console.log(chalk.gray('  Start using RIPER to collect usage data.\n'));
    return;
  }

  console.log(chalk.bold('  Overview\n'));
  console.log(`  ${chalk.cyan('Total Events:')}  ${stats.totalEvents}`);
  console.log(`  ${chalk.cyan('First Event:')}   ${stats.firstEvent ? new Date(stats.firstEvent).toLocaleString() : 'N/A'}`);
  console.log(`  ${chalk.cyan('Last Event:')}    ${stats.lastEvent ? new Date(stats.lastEvent).toLocaleString() : 'N/A'}`);

  console.log(chalk.bold('\n  Mode Changes\n'));
  console.log(`  ${stats.modeChanges} mode switches`);
  if (stats.modeChanges > 0) {
    const modeHistory = await storage.getModeHistory();
    for (const mode of modeHistory) {
      console.log(`    ${chalk.gray('•')} ${mode.mode}: ${mode.count}`);
    }
  }

  console.log(chalk.bold('\n  Commands\n'));
  console.log(`  ${stats.commandsRun} commands executed`);
  if (stats.commandsRun > 0) {
    const commandUsage = await storage.getCommandUsage();
    for (const cmd of commandUsage.sort((a, b) => b.count - a.count).slice(0, 5)) {
      console.log(`    ${chalk.gray('•')} ${cmd.command}: ${cmd.count}`);
    }
  }

  console.log(chalk.bold('\n  Adapters\n'));
  console.log(`  ${stats.adaptersInstalled} installations`);

  console.log(chalk.bold('\n  MCP\n'));
  console.log(`  ${stats.mcpActions} MCP actions\n`);
}

async function runWeekly(projectPath: string): Promise<void> {
  const db = new AnalyticsDatabase(projectPath);
  await db.initialize();

  if (!db.isSQLiteAvailable()) {
    console.log(chalk.yellow('\n⚠ SQLite is not available — weekly summary requires the optional better-sqlite3 dependency.'));
    console.log(chalk.gray('  Falling back to JSONL-based stats. Run "riper-for-all analytics stats" instead.\n'));
    await db.close();
    return await runStats(projectPath);
  }

  const summary = await db.getWeeklySummary();
  await db.close();

  if (!summary) {
    console.log(chalk.yellow('\n⚠ Weekly summary not available.\n'));
    return;
  }

  console.log(chalk.bold('\n📅 Weekly Summary\n'));
  console.log(`  ${chalk.cyan('Week starting:')}  ${new Date(summary.weekStart).toLocaleDateString()}`);
  console.log(`  ${chalk.cyan('Total events:')}   ${summary.totalEvents}`);
  console.log(`  ${chalk.cyan('Mode changes:')}   ${summary.modeChanges}`);
  console.log(`  ${chalk.cyan('Violations:')}     ${summary.violations}`);

  if (summary.topCommands.length > 0) {
    console.log(chalk.bold('\n  Top Commands\n'));
    for (const cmd of summary.topCommands) {
      console.log(`    ${chalk.gray('•')} ${cmd.command}: ${cmd.count}`);
    }
  }
  console.log('');
}

async function runExport(projectPath: string, options: AnalyticsOptions): Promise<void> {
  const storage = getAnalyticsStorage(projectPath);
  const limit = typeof options.limit === 'string' ? parseInt(options.limit, 10) : (options.limit ?? 1000);
  const events = await storage.read(limit, options.since);

  const format = (options.format ?? 'json').toLowerCase();
  let body: string;
  if (format === 'csv') {
    body = toCsv(events);
  } else if (format === 'json') {
    body = JSON.stringify(events, null, 2);
  } else {
    console.log(chalk.red(`\n❌ Unknown format: ${format}. Use json or csv.\n`));
    process.exit(1);
    return;
  }

  if (options.output) {
    await fs.writeFile(options.output, body, 'utf-8');
    console.log(chalk.green(`\n✓ Exported ${events.length} events (${format}) to ${options.output}\n`));
  } else {
    process.stdout.write(body);
    if (!body.endsWith('\n')) process.stdout.write('\n');
  }
}

function toCsv(events: any[]): string {
  if (events.length === 0) return 'timestamp,event,tool,data\n';
  // Header order is fixed for stable diffs.
  const lines: string[] = ['timestamp,event,tool,data'];
  for (const e of events) {
    const data = JSON.stringify(e.data ?? {});
    lines.push([
      csvEscape(e.timestamp ?? ''),
      csvEscape(e.event ?? ''),
      csvEscape(e.tool ?? ''),
      csvEscape(data),
    ].join(','));
  }
  return lines.join('\n') + '\n';
}

function csvEscape(s: string): string {
  // RFC 4180: wrap in double quotes and double internal quotes if the value
  // contains a comma, quote, or newline.
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function runMigrate(projectPath: string): Promise<void> {
  console.log(chalk.cyan('\n🔄 Rebuilding SQLite index from JSONL...\n'));
  const storage = getAnalyticsStorage(projectPath);
  const result = await storage.rebuildSQLiteFromJSONL();
  if (result.migrated === 0 && result.errors === 0) {
    console.log(chalk.yellow('  Nothing to migrate (no JSONL events or SQLite unavailable).\n'));
    return;
  }
  console.log(chalk.green(`  ✓ Migrated ${result.migrated} events.`));
  if (result.errors > 0) {
    console.log(chalk.yellow(`  ⚠ ${result.errors} events skipped due to parse errors.`));
  }
  console.log('');
}
