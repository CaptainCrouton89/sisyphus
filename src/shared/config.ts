import { readFileSync } from 'node:fs';
import { globalConfigPath, projectConfigPath } from './paths.js';

export interface WorktreeConfig {
  copy?: string[];
  clone?: string[];
  symlink?: string[];
  init?: string;
}

export type EffortLevel = 'low' | 'medium' | 'high';

export interface Config {
  model?: string;
  tmuxSession?: string;
  orchestratorPrompt?: string;
  pollIntervalMs?: number;
  autoUpdate?: boolean;
  orchestratorEffort?: EffortLevel;
  agentEffort?: EffortLevel;
}

const DEFAULT_CONFIG: Config = {
  pollIntervalMs: 5000,
  orchestratorEffort: 'high',
  agentEffort: 'medium',
};

function readJsonFile(filePath: string): Partial<Config> {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as Partial<Config>;
  } catch {
    return {};
  }
}

export function loadConfig(cwd: string): Config {
  const global = readJsonFile(globalConfigPath());
  const project = readJsonFile(projectConfigPath(cwd));
  return { ...DEFAULT_CONFIG, ...global, ...project };
}
