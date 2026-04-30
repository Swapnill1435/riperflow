import path from 'path';
import { BaseAdapter, AdapterConfig } from './base.js';
import { generateToolRules } from './rules-generator.js';

export class VSCodeAdapter extends BaseAdapter {
  constructor(projectPath: string, options?: { mode?: string; role?: string; gate?: string }) {
    const config: AdapterConfig = {
      name: 'vscode',
      displayName: 'VS Code',
      configDir: '.vscode',
      rulesDir: '',
      ruleExtension: '.md'
    };
    super(config, projectPath);
    this._options = options;
  }

  private _options?: { mode?: string; role?: string; gate?: string };

  getRulesContent(): string {
    return generateToolRules('vscode');
  }

  override getRulesFilePath(): string {
    return path.join(this.projectPath, '.vscode/.riper.md');
  }

  override getRulesDir(): string {
    return path.join(this.projectPath, '.vscode');
  }
}
