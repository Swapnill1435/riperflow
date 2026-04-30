import chalk from 'chalk';
import { loadConfig, saveConfig } from '../config/loader.js';
import { createMCPManager, listMCPServers, createMCPNotifier } from '../mcp/index.js';
import { trackMcpAction } from '../analytics/index.js';

export async function mcpCommand(action?: string, service?: string, options?: { global?: boolean }): Promise<void> {
  const config = await loadConfig();
  
  if (!config) {
    console.log(chalk.red('❌ RIPER is not initialized.'));
    process.exit(1);
  }

  const manager = createMCPManager(config.projectPath);
  const notifier = createMCPNotifier();

  if (!action) {
    console.log(chalk.bold('\n🔌 MCP Services\n'));
    console.log(chalk.gray('Usage: riper-for-all mcp <action> [service]'));
    console.log(chalk.gray('  riper-for-all mcp list'));
    console.log(chalk.gray('  riper-for-all mcp available'));
    console.log(chalk.gray('  riper-for-all mcp status'));
    console.log(chalk.gray('  riper-for-all mcp add github'));
    console.log(chalk.gray('  riper-for-all mcp install github'));
    console.log(chalk.gray('  riper-for-all mcp setup github'));
    console.log(chalk.gray('  riper-for-all mcp generate'));
    console.log(chalk.gray('  riper-for-all mcp remove github\n'));
    return;
  }

  switch (action) {
    case 'list':
    case 'ls': {
      console.log(chalk.bold('\n🔌 Configured MCP Services\n'));
      if (config.mcp.servers.length === 0) {
        console.log(chalk.gray('  No MCP services configured.\n'));
      } else {
        for (const server of config.mcp.servers) {
          const serverInfo = listMCPServers().find(s => s.name.toLowerCase() === server);
          const symbol = serverInfo?.symbol || '•';
          console.log(chalk.green('  ✓'), `${symbol} ${server}`);
        }
        console.log('');
      }
      break;
    }

    case 'available':
    case 'avail': {
      console.log(chalk.bold('\n🔌 Available MCP Services\n'));
      const servers = listMCPServers();
      for (const server of servers) {
        const isConfigured = config.mcp.servers.includes(server.name.toLowerCase());
        const status = isConfigured ? chalk.green('✓ configured') : chalk.gray('○ available');
        console.log(chalk.green('  ' + server.symbol), chalk.bold(server.name), '-', server.description);
        console.log(chalk.gray(`    ${status}\n`));
      }
      break;
    }

    case 'status': {
      console.log(chalk.bold('\n🔌 MCP Status\n'));
      const installed = await manager.checkAllServers();
      for (const [server, isInstalled] of Object.entries(installed)) {
        const status = isInstalled 
          ? chalk.green('✓ Installed') 
          : chalk.yellow('○ Not installed');
        console.log(`  ${server}: ${status}`);
      }
      console.log('');
      break;
    }

    case 'add': {
      if (!service) {
        console.log(chalk.red('❌ Please specify a service to add.'));
        console.log(chalk.gray('Available: github, websearch, browser, docker\n'));
        process.exit(1);
      }
      const canonical = service.toLowerCase();
      const existsCi = config.mcp.servers.some(s => s.toLowerCase() === canonical);
      if (!existsCi) {
        config.mcp.servers.push(canonical);
        await saveConfig(config);
        console.log(chalk.green(`\n✓ Added ${canonical} to MCP services\n`));
        await trackMcpAction('add', canonical);

        const envVars = manager.getRequiredEnvVars(canonical);
        if (Object.keys(envVars).length > 0) {
          notifier.promptCredentials(canonical, envVars);
        }
      } else {
        console.log(chalk.yellow(`\n⚠ ${canonical} is already configured\n`));
      }
      break;
    }

    case 'install': {
      if (!service) {
        console.log(chalk.red('❌ Please specify a service to install.'));
        process.exit(1);
      }

      if (!options?.global) {
        // Default: npx-based runtime; no global install needed.
        console.log(chalk.cyan(`\n📦 Adding ${service.toLowerCase()} to MCP config (will be invoked via npx -y at runtime)...\n`));
        const result = await manager.generateAllMCPConfigs([service.toLowerCase()]);
        let okCount = 0;
        for (const [tool, r] of Object.entries(result)) {
          const rr = r as { success: boolean; filePath?: string; message?: string };
          if (rr.success) {
            console.log(chalk.green(`  ✓ ${tool}: ${rr.filePath ?? rr.message}`));
            okCount++;
          } else {
            console.log(chalk.gray(`  - ${tool}: ${rr.message}`));
          }
        }
        if (okCount > 0) {
          await trackMcpAction('install', service.toLowerCase());
          console.log(chalk.gray(`\n💡 To install globally instead, rerun with --global.\n`));
        }
        break;
      }

      // --global: keep the old behavior
      const result = await manager.installServer(service);
      if (result.success) {
        console.log(chalk.green(`\n✓ ${result.message}\n`));
        notifier.successInstall(service);
        await trackMcpAction('install', service);
      } else {
        console.log(chalk.red(`\n❌ ${result.message}\n`));
      }
      break;
    }

    case 'remove': {
      if (!service) {
        console.log(chalk.red('❌ Please specify a service to remove.'));
        process.exit(1);
      }
      const canonical = service.toLowerCase();
      const index = config.mcp.servers.findIndex(s => s.toLowerCase() === canonical);
      if (index > -1) {
        config.mcp.servers.splice(index, 1);
        await saveConfig(config);
        console.log(chalk.green(`\n✓ Removed ${canonical} from MCP services\n`));
      } else {
        console.log(chalk.yellow(`\n⚠ ${canonical} is not configured\n`));
      }
      break;
    }

    case 'config': {
      if (!service) {
        console.log(chalk.red('❌ Please specify a service.'));
        process.exit(1);
      }
      const tool = 'cursor';
      const configJson = await manager.generateToolConfig(service, tool);
      if (configJson) {
        console.log(chalk.bold(`\n🔌 ${service} config for ${tool}:\n`));
        console.log(chalk.gray(configJson));
        console.log('');
      } else {
        console.log(chalk.yellow(`\n⚠ No config available for ${service}\n`));
      }
      break;
    }

    case 'generate':
    case 'gen': {
      console.log(chalk.bold('\n🔌 Generating MCP Config Files\n'));
      
      if (config.mcp.servers.length === 0) {
        console.log(chalk.yellow('  No MCP services configured. Use "mcp add" first.\n'));
        break;
      }

      const results = await manager.generateAllMCPConfigs(config.mcp.servers);
      
      for (const [tool, result] of Object.entries(results)) {
        const r = result as { success: boolean; filePath?: string; message?: string };
        if (r.success && r.filePath) {
          console.log(chalk.green(`  ✓ ${tool}:`), chalk.gray(r.filePath));
        } else if (!r.success) {
          console.log(chalk.red(`  ✗ ${tool}:`), r.message);
        }
      }
      console.log('');
      notifier.promptRestart('your IDE');
      break;
    }

    case 'setup': {
      if (!service) {
        console.log(chalk.red('❌ Please specify a service to setup.'));
        console.log(chalk.gray('Available: github, websearch, browser, docker\n'));
        process.exit(1);
      }
      
      console.log(chalk.bold(`\n🔌 Setting up MCP: ${service}\n`));
      
      const envVars = manager.getRequiredEnvVars(service);
      if (Object.keys(envVars).length > 0) {
        console.log(chalk.yellow('  Environment variables required:'));
        for (const [key, desc] of Object.entries(envVars)) {
          console.log(chalk.gray(`    ${key}: ${desc}`));
        }
        console.log('');
      }
      
      const result = await manager.generateAllMCPConfigs([service]);
      for (const [tool, genResult] of Object.entries(result)) {
        const r = genResult as { success: boolean; filePath?: string };
        if (r.success && r.filePath) {
          console.log(chalk.green(`  ✓ ${tool}:`), chalk.gray(r.filePath));
        }
      }
      
      console.log('');
      notifier.successConfigure('IDE', service);
      break;
    }

    default:
      console.log(chalk.red(`\n❌ Unknown action: ${action}\n`));
      console.log(chalk.gray('Valid actions: list, available, status, add, install, setup, generate, remove, config\n'));
      process.exit(1);
  }
}
