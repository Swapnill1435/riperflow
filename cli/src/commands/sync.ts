import chalk from 'chalk';
import { loadConfig } from '../config/loader.js';
import { createAdapter } from '../adapters/base.js';
import { getAnalyticsStorage } from '../analytics/storage.js';

export interface SyncOptions { dryRun?: boolean; }
export interface SyncResult { updated: string[]; skipped: string[]; }

/**
 * Regenerate rule files for every enabled adapter. memory-bank/*.md is the
 * source of truth; this push-only sync re-runs each adapter's install() so
 * tool-specific rule files reflect the current bank.
 */
export async function sync(options: SyncOptions = {}): Promise<SyncResult> {
  const config = await loadConfig();
  if (!config) {
    return { updated: [], skipped: [] };
  }

  const dryRun = !!options.dryRun;
  const updated: string[] = [];
  const skipped: string[] = [];

  for (const [toolId, enabled] of Object.entries(config.tools)) {
    if (!enabled) continue;
    const adapter = await createAdapter(toolId, process.cwd());
    if (!adapter) {
      skipped.push(toolId);
      continue;
    }
    const result = await adapter.install(dryRun);
    if (result.success && result.filesCreated) {
      updated.push(...result.filesCreated);
    } else if (!result.success) {
      skipped.push(toolId);
    }
  }

  try {
    await getAnalyticsStorage(process.cwd()).write({
      timestamp: new Date().toISOString(),
      event: 'sync',
      data: { updated: updated.length, skipped: skipped.length, dryRun },
    });
  } catch {
    // Analytics is non-blocking — never fail sync because of a logging hiccup.
  }

  return { updated, skipped };
}

export async function syncCommand(options: any): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    console.log(chalk.red('❌ RIPER is not initialized.'));
    process.exit(1);
  }

  const dryRun = !!options?.dryRun;
  console.log(chalk.cyan(`\n🔄 Syncing memory bank across tools${dryRun ? ' (dry-run)' : ''}...\n`));

  const result = await sync({ dryRun });

  if (result.updated.length === 0 && result.skipped.length === 0) {
    console.log(chalk.yellow('⚠️  No tools enabled in config.tools — nothing to sync.\n'));
    console.log(chalk.gray('💡 Enable tools via riper-for-all setup --tools <ids>\n'));
    return;
  }

  for (const file of result.updated) {
    console.log(chalk.green(`  ${dryRun ? '◯' : '✓'} ${file}`));
  }
  if (result.skipped.length > 0) {
    console.log('');
    for (const skipped of result.skipped) {
      console.log(chalk.gray(`  - skipped: ${skipped} (no adapter)`));
    }
  }
  console.log(chalk.bold(`\n${dryRun ? 'Would update' : 'Updated'}: ${result.updated.length} file(s); skipped: ${result.skipped.length}\n`));
}
