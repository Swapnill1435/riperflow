#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init.js';
import { setupCommand } from './commands/setup.js';
import { modeCommand } from './commands/mode.js';
import { syncCommand } from './commands/sync.js';
import { backupCommand } from './commands/backup.js';
import { restoreCommand } from './commands/restore.js';
import { mcpCommand } from './commands/mcp.js';
import { statusCommand } from './commands/status.js';
import { dashboardCommand } from './commands/dashboard.js';
import { updateCommand } from './commands/update.js';
import { analyticsCommand } from './commands/analytics.js';
import { configCommand } from './commands/config.js';
import { roleCommand } from './commands/role.js';
import { gateCommand } from './commands/gate.js';
import { protectCommand } from './commands/protect.js';
import { prdCommand } from './commands/prd.js';
import { detectTools } from './utils/detection.js';
import { loadConfig } from './config/loader.js';
import { trackCommand } from './analytics/events.js';

const program = new Command();

program
  .name('riper-for-all')
  .description('Universal RIPER framework for AI coding tools')
  .version('1.0.0');

program
  .hook('preAction', async (_thisCommand, actionCommand) => {
    // Defensive skip — Commander already short-circuits for --help/--version
    // but explicit check makes it obvious and covers any edge case.
    const argv = process.argv.slice(2);
    if (argv.includes('--help') || argv.includes('-h') || argv.includes('--version') || argv.includes('-V') || argv[0] === 'help') {
      return;
    }

    try {
      const config = await loadConfig();
      if (config) {
        const tools = await detectTools();
        if (tools.length > 0) {
          console.log(chalk.gray(`\nDetected tools: ${tools.map(t => t.displayName).join(', ')}\n`));
        }
        // Record this CLI invocation in analytics. Non-blocking — never let
        // a logging hiccup break the command.
        try {
          await trackCommand(actionCommand.name(), actionCommand.args ?? []);
        } catch {
          /* ignore */
        }
      }
    } catch {
      // Config might not exist yet
    }
  });

program
  .command('init')
  .description('Initialize RIPER in the current project')
  .option('-t, --tools <tools>', 'Specify tools (comma-separated)', 'cursor,claude-code,opencode')
  .option('-y, --yes', 'Skip prompts and use defaults')
  .action(initCommand);

program
  .command('setup')
  .description('Setup RIPER for specific tools')
  .option('-t, --tools <tools>', 'Specify tools (comma-separated)')
  .option('-d, --dry-run', 'Preview changes without applying')
  .option('-f, --force', 'Skip prompts (for CI/CD)')
  .action(setupCommand);

program
  .command('mode')
  .description('Switch or show current mode')
  .argument('[mode]', 'Mode to switch to (research, innovate, plan, execute, review)')
  .action(modeCommand);

program
  .command('sync')
  .description('Sync memory across all tools')
  .option('-d, --dry-run', 'Preview changes without applying')
  .action(syncCommand);

program
  .command('backup')
  .description('Backup memory bank')
  .option('-l, --list', 'List available backups')
  .option('-n, --name <name>', 'Backup name')
  .action(backupCommand);

program
  .command('restore')
  .description('Restore from a backup')
  .option('-b, --backup <name>', 'Backup name to restore')
  .action(restoreCommand);

program
  .command('mcp')
  .description('Manage MCP services')
  .argument('[action]', 'Action: status, add, install, remove, config, generate')
  .argument('[service]', 'MCP service name')
  .option('-g, --global', 'For "mcp install": run npm install -g instead of relying on npx at runtime')
  .action(mcpCommand);

program
  .command('status')
  .description('Show RIPER status')
  .action(statusCommand);

program
  .command('dashboard')
  .description('Open dashboard')
  .argument('[type]', 'Dashboard type: tui, web, stop', 'tui')
  .option('-d, --detach', 'Run web dashboard in detached mode')
  .option('-p, --port <port>', 'Web dashboard port', '3456')
  .option('-w, --watch', 'Watch mode (auto-refresh for TUI)')
  .action(dashboardCommand);

program
  .command('update')
  .description('Update RIPER framework')
  .option('-a, --adapters-only', 'Update only adapters')
  .action(updateCommand);

program
  .command('analytics')
  .description('Show or manage analytics')
  .argument('[action]', 'Action: stats (default), weekly, export, migrate')
  .option('-f, --format <format>', 'Export format: json, csv', 'json')
  .option('-l, --limit <n>', 'Max events for export', '1000')
  .option('-s, --since <iso>', 'Only events at or after this ISO timestamp')
  .option('-o, --output <path>', 'Write export to a file (defaults to stdout)')
  .action(analyticsCommand);

program
  .command('config')
  .description('Manage configuration')
  .argument('[action]', 'Action: get, set, reset')
  .argument('[key]', 'Config key')
  .argument('[value]', 'Config value')
  .action(configCommand);

program
  .command('role')
  .description('Manage roles (BMAD)')
  .argument('[action]', 'Action: list, set, info, permissions')
  .argument('[role]', 'Role name')
  .action(roleCommand);

program
  .command('gate')
  .description('Manage quality gates (BMAD)')
  .argument('[action]', 'Action: list, status, advance, approve, reset')
  .argument('[gate]', 'Gate name')
  .action(gateCommand);

program
  .command('protect')
  .description('Manage code protection (BMAD)')
  .argument('[action]', 'Action: list, set, remove, check')
  .argument('[target]', 'Path to protect')
  .argument('[level]', 'Protection level')
  .action(protectCommand);

program
  .command('prd')
  .description('Manage Product Requirements (BMAD)')
  .argument('[action]', 'Action: list, create, view, edit, approve, deprecate')
  .argument('[prd]', 'PRD ID or title')
  .action(prdCommand);

// Aliases for quick mode switching
program
  .command('r', { isDefault: false })
  .description('Shortcut for /research mode')
  .action(() => modeCommand('research'));

program
  .command('i')
  .description('Shortcut for /innovate mode')
  .action(() => modeCommand('innovate'));

program
  .command('p')
  .description('Shortcut for /plan mode')
  .action(() => modeCommand('plan'));

program
  .command('e')
  .description('Shortcut for /execute mode')
  .action(() => modeCommand('execute'));

program
  .command('rev')
  .description('Shortcut for /review mode')
  .action(() => modeCommand('review'));

// Handle unknown commands
program.on('command:*', () => {
  console.error(chalk.red(`\nInvalid command: ${program.args.join(' ')}`));
  console.log(chalk.gray(`Run 'riper-for-all --help' for available commands\n`));
  process.exit(1);
});

program.parse();
