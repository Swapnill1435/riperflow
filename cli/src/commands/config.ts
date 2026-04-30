import chalk from 'chalk';
import { loadConfig, saveConfig, resetConfig, getDefaultConfig } from '../config/loader.js';

export async function configCommand(action?: string, keyArg?: string, valueArg?: string): Promise<void> {
  if (!action) {
    const config = await loadConfig();

    if (!config) {
      console.log(chalk.red('❌ RIPER is not initialized.'));
      process.exit(1);
    }

    console.log(chalk.bold('\n⚙️  Configuration\n'));
    console.log(chalk.cyan('Project: '), config.projectName);
    console.log(chalk.cyan('Version: '), config.version);

    console.log(chalk.bold('\n🔧 Tools\n'));
    for (const [name, enabled] of Object.entries(config.tools)) {
      console.log(`  ${enabled ? chalk.green('✓') : chalk.gray('○')} ${name}`);
    }

    console.log(chalk.bold('\n📡 Telemetry\n'));
    console.log(chalk.cyan('Enabled: '), config.telemetry.enabled ? 'Yes' : 'No');
    console.log(chalk.cyan('Anonymous: '), config.telemetry.anonymous ? 'Yes' : 'No');

    console.log(chalk.bold('\n💾 Backup\n'));
    console.log(chalk.cyan('Auto: '), config.backup.auto ? 'Yes' : 'No');
    console.log(chalk.cyan('Interval: '), config.backup.interval);
    console.log(chalk.cyan('Max: '), config.backup.maxBackups);

    console.log('');
    return;
  }

  const config = await loadConfig();

  if (!config && action !== 'reset') {
    console.log(chalk.red('❌ RIPER is not initialized.'));
    process.exit(1);
  }

  switch (action) {
    case 'get': {
      if (!keyArg) {
        console.log(chalk.red('❌ Please specify a key to get.'));
        process.exit(1);
      }
      const gotValue = getNestedValue(config!, keyArg);
      if (gotValue === undefined) {
        console.log(chalk.cyan(`${keyArg}: `), '(not set)');
      } else {
        console.log(chalk.cyan(`${keyArg}: `), gotValue);
      }
      break;
    }

    case 'set': {
      if (!keyArg || valueArg === undefined) {
        console.log(chalk.red('❌ Please specify key and value.'));
        console.log(chalk.gray('Usage: riper-for-all config set <key> <value>\n'));
        process.exit(1);
      }

      const result = setTypedValue(config!, keyArg, valueArg);
      if (!result.ok) {
        console.log(chalk.red(`\n❌ ${result.error}\n`));
        process.exit(1);
      }
      await saveConfig(config!);
      console.log(chalk.green(`\n✓ Set ${keyArg} = ${JSON.stringify(result.value)}\n`));
      break;
    }

    case 'reset':
      await resetConfig();
      console.log(chalk.green('\n✓ Config reset to defaults\n'));
      break;

    default:
      console.log(chalk.red(`\n❌ Unknown action: ${action}\n`));
      console.log(chalk.gray('Valid actions: get, set, reset\n'));
      process.exit(1);
  }
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, part) => acc && acc[part], obj);
}

type SetResult = { ok: true; value: unknown } | { ok: false; error: string };

function setTypedValue(config: any, keyPath: string, raw: string): SetResult {
  const defaults = getDefaultConfig() as any;
  const parts = keyPath.split('.');

  // Walk defaults to find the existing type at this path.
  let typeRef: any = defaults;
  for (let i = 0; i < parts.length - 1; i++) {
    typeRef = typeRef?.[parts[i]];
    if (typeRef === undefined || typeof typeRef !== 'object' || typeRef === null) {
      return { ok: false, error: `Unknown config key: ${keyPath}` };
    }
  }
  const leaf = parts[parts.length - 1];
  const existingType = typeof typeRef[leaf];

  // tools is a Record<string, boolean> — accept any tool id under tools.*
  const isToolsLeaf = parts[0] === 'tools' && parts.length === 2;
  // mcp.servers is string[] — special handling
  const isMcpServers = keyPath === 'mcp.servers';

  if (existingType === 'undefined' && !isToolsLeaf) {
    return { ok: false, error: `Unknown config key: ${keyPath}` };
  }

  let coerced: unknown;
  if (isMcpServers) {
    // Comma-separated list or JSON array
    if (raw.startsWith('[')) {
      try { coerced = JSON.parse(raw); }
      catch { return { ok: false, error: `Invalid JSON for ${keyPath}: ${raw}` }; }
    } else {
      coerced = raw.split(',').map(s => s.trim()).filter(Boolean);
    }
  } else if (isToolsLeaf || existingType === 'boolean') {
    const lower = raw.toLowerCase();
    if (['true', 'yes', '1', 'on'].includes(lower)) coerced = true;
    else if (['false', 'no', '0', 'off'].includes(lower)) coerced = false;
    else return { ok: false, error: `Expected boolean for ${keyPath}, got: ${raw}` };
  } else if (existingType === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      return { ok: false, error: `Expected number for ${keyPath}, got: ${raw}` };
    }
    coerced = n;
  } else if (existingType === 'string') {
    coerced = raw;
  } else {
    return { ok: false, error: `Unsupported config key type at ${keyPath}` };
  }

  // Walk config and assign
  let obj: any = config;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!obj[parts[i]]) obj[parts[i]] = {};
    obj = obj[parts[i]];
  }
  obj[leaf] = coerced;

  return { ok: true, value: coerced };
}
