import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { getMemoryBankDir } from '../config/loader.js';
import { MEMORY_FILES } from '../core/modes.js';
import { autoBackupFile } from '../commands/backup.js';

export async function ensureMemoryBank(): Promise<void> {
  const memoryDir = getMemoryBankDir();
  await fs.ensureDir(memoryDir);
  
  // Create memory bank files if they don't exist
  for (const [key, file] of Object.entries(MEMORY_FILES)) {
    const filePath = path.join(memoryDir, file.filename);
    if (!(await fs.pathExists(filePath))) {
      await fs.writeFile(filePath, getMemoryFileTemplate(key as keyof typeof MEMORY_FILES));
    }
  }
  
  console.log(chalk.green('✓ Memory bank initialized'));
}

function getMemoryFileTemplate(fileId: keyof typeof MEMORY_FILES): string {
  const templates: Record<string, string> = {
    projectbrief: `# Σ₁: Project Brief
*v1.0 | Created: ${new Date().toISOString().split('T')[0]} | Updated: ${new Date().toISOString().split('T')[0]}*
*Π: UNINITIATED | Ω: RESEARCH*

## 🏆 Overview
[Project description]

## 📋 Requirements
- [R₁] [Requirement 1]
- [R₂] [Requirement 2]

## ✅ Success Criteria
- [Criterion 1]
- [Criterion 2]

## 📌 Scope
### In Scope
- 

### Out of Scope
- 
`,
    systemPatterns: `# Σ₂: System Patterns
*v1.0 | Created: ${new Date().toISOString().split('T')[0]} | Updated: ${new Date().toISOString().split('T')[0]}*
*Π: UNINITIATED | Ω: RESEARCH*

## 🏛️ Architecture Overview
[Architecture description]

## 🔧 Components
### Component 1
- Description: 
- Responsibility: 

## 🎯 Design Decisions
| Decision | Rationale |
|---------|-----------|
|         |           |

## 🔄 Data Flow
[Describe data flow]
`,
    techContext: `# Σ₃: Technical Context
*v1.0 | Created: ${new Date().toISOString().split('T')[0]} | Updated: ${new Date().toISOString().split('T')[0]}*
*Π: UNINITIATED | Ω: RESEARCH*

## 🛠️ Technology Stack
- 🖥️ Frontend: 
- ⚙️ Backend: 
- 🗄️ Database: 
- 🔧 Tools: 

## 📦 Dependencies
\`\`\`
[package.json or equivalent]
\`\`\`

## ⚙️ Environment
- Node.js: 
- OS: 

## 🔧 Configuration
| Variable | Value | Description |
|----------|-------|-------------|
|            |       |             |
`,
    activeContext: `# Σ₄: Active Context
*v1.0 | Created: ${new Date().toISOString().split('T')[0]} | Updated: ${new Date().toISOString().split('T')[0]}*
*Π: UNINITIATED | Ω: RESEARCH*

## 🔮 Current Focus
[Current focus]

## 📎 Context References
- 📄 Active Files: []
- 💻 Active Code: []
- 📚 Active Docs: []
- 📁 Active Folders: []
- 🔄 Git References: []
- 📏 Active Rules: []

## 📡 Context Status
- 🟢 Active: []
- 🟡 Partially Relevant: []
- 🟣 Essential: []
- 🔴 Deprecated: []

## 📝 Recent Changes
| Date | Change | Mode |
|------|--------|------|
|        |         |      |
`,
    progress: `# Σ₅: Progress Tracker
*v1.0 | Created: ${new Date().toISOString().split('T')[0]} | Updated: ${new Date().toISOString().split('T')[0]}*
*Π: UNINITIATED | Ω: RESEARCH*

## 📈 Project Status
Completion: 0%

## 🎯 Milestones
- [ ] Milestone 1
- [ ] Milestone 2

## 📋 Current Tasks
- [ ] Task 1

## ⚠️ Issues
- 

## ✅ Completed
- 
`,
    protection: `# Σ₆: Protection Registry
*v1.0 | Created: ${new Date().toISOString().split('T')[0]} | Updated: ${new Date().toISOString().split('T')[0]}*
*Π: UNINITIATED | Ω: RESEARCH*

## 🛡️ Protected Regions
| File | Level | Reason |
|------|-------|--------|
|        |        |        |

## 📜 Protection History
| Date | Action | File | Approved By |
|------|--------|------|-------------|
|        |        |      |             |

## ✅ Approvals
- 

## ⚠️ Permission Violations
- 
`
  };
  
  return templates[fileId] || '';
}

export async function readMemoryFile(filename: string): Promise<string> {
  const filePath = path.join(getMemoryBankDir(), filename);
  
  if (!(await fs.pathExists(filePath))) {
    throw new Error(`Memory file not found: ${filename}`);
  }
  
  return await fs.readFile(filePath, 'utf-8');
}

export async function writeMemoryFile(filename: string, content: string): Promise<void> {
  const filePath = path.join(getMemoryBankDir(), filename);
  await autoBackupFile(filePath, true);
  await fs.writeFile(filePath, content, 'utf-8');
}

export async function updateMemoryFile(filename: string, update: (content: string) => string): Promise<void> {
  const content = await readMemoryFile(filename);
  const updated = update(content);
  await writeMemoryFile(filename, updated);
}

export async function getAllMemoryFiles(): Promise<Record<string, string>> {
  const memoryDir = getMemoryBankDir();
  const files: Record<string, string> = {};
  
  for (const [key, file] of Object.entries(MEMORY_FILES)) {
    const filePath = path.join(memoryDir, file.filename);
    if (await fs.pathExists(filePath)) {
      files[key] = await fs.readFile(filePath, 'utf-8');
    }
  }
  
  return files;
}

