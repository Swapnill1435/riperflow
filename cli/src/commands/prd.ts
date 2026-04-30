import chalk from 'chalk';
import { loadConfig } from '../config/loader.js';
import fs from 'fs-extra';
import path from 'path';
import { withLock } from '../memory/lock.js';

export interface PRD {
  id: string;
  title: string;
  version: string;
  status: 'draft' | 'review' | 'approved' | 'deprecated';
  createdAt: string;
  updatedAt: string;
  content: string;
}

export async function prdCommand(action?: string, prdArg?: string): Promise<void> {
  const config = await loadConfig();
  
  if (!config) {
    console.log(chalk.red('❌ RIPER is not initialized. Run "riper-for-all init" first.'));
    process.exit(1);
  }

  const prdDir = path.join(config.projectPath, '.riper', 'prds');
  await fs.ensureDir(prdDir);

  if (!action) {
    listPRDs(prdDir);
    return;
  }

  switch (action) {
    case 'list':
    case 'ls':
      listPRDs(prdDir);
      break;
    
    case 'create':
    case 'new':
      await createPRD(prdDir, prdArg);
      break;
    
    case 'view':
    case 'show':
      await viewPRD(prdDir, prdArg);
      break;
    
    case 'edit':
      await editPRD(prdDir, prdArg);
      break;
    
    case 'approve':
      await updatePRDStatus(prdDir, prdArg, 'approved');
      break;
    
    case 'deprecate':
      await updatePRDStatus(prdDir, prdArg, 'deprecated');
      break;
    
    default:
      console.log(chalk.red(`\n❌ Unknown action: ${action}\n`));
      console.log(chalk.gray('Valid actions: list, create, view, edit, approve, deprecate\n'));
      process.exit(1);
  }
}

async function listPRDs(prdDir: string): Promise<void> {
  const files = await fs.readdir(prdDir);
  const prds: PRD[] = [];
  
  for (const file of files) {
    if (file.endsWith('.json')) {
      const prd = await fs.readJson(path.join(prdDir, file));
      prds.push(prd);
    }
  }
  
  console.log(chalk.bold('\n📄 Product Requirements\n'));
  
  if (prds.length === 0) {
    console.log(chalk.gray('  No PRDs found. Create one with:'));
    console.log(chalk.gray('  riper-for-all prd create <title>\n'));
    return;
  }
  
  for (const prd of prds.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())) {
    const statusColors: Record<string, any> = {
      draft: chalk.yellow,
      review: chalk.cyan,
      approved: chalk.green,
      deprecated: chalk.red
    };
    const statusColor = statusColors[prd.status] || chalk.gray;
    
    console.log(`  ${statusColor('●')} ${prd.title}`);
    console.log(chalk.gray(`     v${prd.version} | ${prd.status} | ${new Date(prd.updatedAt).toLocaleDateString()}`));
  }
  console.log('');
  
  console.log(chalk.bold('💡 Usage:\n'));
  console.log(chalk.gray('  riper-for-all prd list           # List all PRDs'));
  console.log(chalk.gray('  riper-for-all prd create <title> # Create new PRD'));
  console.log(chalk.gray('  riper-for-all prd view <id>      # View PRD'));
  console.log(chalk.gray('  riper-for-all prd approve <id>   # Approve PRD'));
  console.log(chalk.gray('  riper-for-all prd deprecate <id> # Deprecate PRD\n'));
}

async function createPRD(prdDir: string, title?: string): Promise<void> {
  const prdTitle = title || 'New Feature';
  const id = prdTitle.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  
  const prd: PRD = {
    id,
    title: prdTitle,
    version: '1.0.0',
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    content: `# ${prdTitle}

## Overview
Brief description of the feature/requirement.

## Goals
- Goal 1
- Goal 2

## Non-Goals
- What we're NOT doing

## User Stories
1. As a [user], I want [goal] so that [benefit]

## Requirements
- Requirement 1
- Requirement 2

## Technical Notes
Any technical considerations.

## Dependencies
- Dependency 1
`
  };
  
  const filePath = path.join(prdDir, `${id}.json`);
  await withLock(filePath, async () => {
    await fs.writeJson(filePath, prd, { spaces: 2 });
  });

  console.log(chalk.green(`\n✓ Created PRD: ${prd.title} (${id})\n`));
  console.log(chalk.gray(`  File: ${filePath}\n`));
}

async function viewPRD(prdDir: string, id?: string): Promise<void> {
  if (!id) {
    console.log(chalk.red('❌ Please specify a PRD ID.\n'));
    console.log(chalk.gray('Usage: riper-for-all prd view <id>\n'));
    process.exit(1);
  }
  
  const filePath = path.join(prdDir, `${id}.json`);
  
  if (!await fs.pathExists(filePath)) {
    console.log(chalk.red(`\n❌ PRD not found: ${id}\n`));
    process.exit(1);
  }
  
  const prd: PRD = await fs.readJson(filePath);
  
  console.log(chalk.bold(`\n📄 ${prd.title}\n`));
  console.log(chalk.gray(`  ID: ${prd.id}`));
  console.log(chalk.gray(`  Version: ${prd.version}`));
  console.log(chalk.gray(`  Status: ${prd.status}`));
  console.log(chalk.gray(`  Created: ${new Date(prd.createdAt).toLocaleString()}`));
  console.log(chalk.gray(`  Updated: ${new Date(prd.updatedAt).toLocaleString()}`));
  console.log('');
  console.log(prd.content);
}

async function editPRD(prdDir: string, id?: string): Promise<void> {
  if (!id) {
    console.log(chalk.red('❌ Please specify a PRD ID.\n'));
    console.log(chalk.gray('Usage: riper-for-all prd edit <id>\n'));
    process.exit(1);
  }
  
  const filePath = path.join(prdDir, `${id}.json`);
  
  if (!await fs.pathExists(filePath)) {
    console.log(chalk.red(`\n❌ PRD not found: ${id}\n`));
    process.exit(1);
  }
  
  console.log(chalk.yellow('\n⚠ PRD editing is done via your text editor.\n'));
  console.log(chalk.gray(`  Open this file to edit:`));
  console.log(chalk.cyan(`  ${filePath}\n`));
}

async function updatePRDStatus(prdDir: string, id: string | undefined, status: string): Promise<void> {
  if (!id) {
    console.log(chalk.red('❌ Please specify a PRD ID.\n'));
    console.log(chalk.gray(`Usage: riper-for-all prd ${status} <id>\n`));
    process.exit(1);
  }
  
  const filePath = path.join(prdDir, `${id}.json`);
  
  if (!await fs.pathExists(filePath)) {
    console.log(chalk.red(`\n❌ PRD not found: ${id}\n`));
    process.exit(1);
  }
  
  const prd: PRD = await fs.readJson(filePath);
  prd.status = status as PRD['status'];
  prd.updatedAt = new Date().toISOString();
  
  await withLock(filePath, async () => {
    await fs.writeJson(filePath, prd, { spaces: 2 });
  });

  const statusColors: Record<string, any> = {
    draft: chalk.yellow,
    review: chalk.cyan,
    approved: chalk.green,
    deprecated: chalk.red
  };
  
  console.log(chalk.green(`\n✓ PRD status updated to ${statusColors[status]?.(status) || status}\n`));
}
