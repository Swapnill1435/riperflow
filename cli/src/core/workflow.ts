import { Mode, Phase, RuntimeState, ModeDefinition } from './types.js';
import { getMode, getPhase, MODES, PHASES } from './modes.js';
import { loadState, saveState } from '../config/loader.js';
import chalk from 'chalk';

export class WorkflowEngine {
  private state: RuntimeState;

  constructor() {
    this.state = {
      currentMode: 'research',
      currentPhase: 'uninitiated',
      lastModeChange: new Date().toISOString(),
      session: {
        startTime: new Date().toISOString(),
        modeHistory: []
      }
    };
  }

  async initialize(): Promise<void> {
    try {
      const savedState = await loadState();
      if (savedState) {
        this.state = savedState;
      }
    } catch {
      // State doesn't exist yet, use defaults
    }
  }

  getCurrentMode(): ModeDefinition {
    return MODES[this.state.currentMode];
  }

  getCurrentPhase(): Phase {
    return this.state.currentPhase;
  }

  async switchMode(newMode: Mode): Promise<void> {
    const modeDef = getMode(newMode);
    if (!modeDef) {
      throw new Error(`Invalid mode: ${newMode}`);
    }

    const oldMode = this.state.currentMode;
    
    if (oldMode === newMode) {
      console.log(chalk.yellow(`Already in ${modeDef.emoji} ${modeDef.name} mode`));
      return;
    }

    console.log(chalk.cyan(`Switching from ${MODES[oldMode].emoji} ${MODES[oldMode].name} to ${modeDef.emoji} ${modeDef.name}...`));

    this.state.currentMode = newMode;
    this.state.lastModeChange = new Date().toISOString();
    this.state.session.modeHistory.push({
      mode: newMode,
      timestamp: new Date().toISOString()
    });

    await saveState(this.state);
    
    console.log(chalk.green(`✓ Now in ${modeDef.emoji} ${modeDef.name} mode`));
  }

  async switchPhase(newPhase: Phase): Promise<void> {
    const phaseDef = getPhase(newPhase);
    if (!phaseDef) {
      throw new Error(`Invalid phase: ${newPhase}`);
    }

    const oldPhase = this.state.currentPhase;
    
    if (oldPhase === newPhase) {
      console.log(chalk.yellow(`Already in ${phaseDef.emoji} ${phaseDef.name} phase`));
      return;
    }

    console.log(chalk.cyan(`Transitioning from ${PHASES[oldPhase].emoji} ${PHASES[oldPhase].name} to ${phaseDef.emoji} ${phaseDef.name}...`));

    this.state.currentPhase = newPhase;
    await saveState(this.state);
    
    console.log(chalk.green(`✓ Now in ${phaseDef.emoji} ${phaseDef.name} phase`));
  }

  getState(): RuntimeState {
    return { ...this.state };
  }

  getModeHistory(): Array<{ mode: Mode; timestamp: string }> {
    return [...this.state.session.modeHistory];
  }

  getPermissionSummary(): string {
    const mode = this.getCurrentMode();
    const phase = PHASES[this.state.currentPhase];
    
    return `
${mode.emoji} Current Mode: ${mode.name} (${mode.symbol})
${phase.emoji} Current Phase: ${phase.name} (${phase.id})

Permissions:
  Read:    ${mode.permissions.read ? '✓' : '✗'}
  Create:  ${mode.permissions.create ? '✓' : '✗'}
  Update:  ${mode.permissions.update ? '✓' : '✗'}
  Delete:  ${mode.permissions.delete ? '✓' : '✗'}
`;
  }
}

// Singleton instance
let workflowEngine: WorkflowEngine | null = null;

export async function getWorkflowEngine(): Promise<WorkflowEngine> {
  if (!workflowEngine) {
    workflowEngine = new WorkflowEngine();
    await workflowEngine.initialize();
  }
  return workflowEngine;
}

export async function switchMode(newMode: Mode): Promise<void> {
  const engine = await getWorkflowEngine();
  await engine.switchMode(newMode);
}

export async function switchPhase(newPhase: Phase): Promise<void> {
  const engine = await getWorkflowEngine();
  await engine.switchPhase(newPhase);
}
