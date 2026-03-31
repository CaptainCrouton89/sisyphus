import { readFileSync } from 'node:fs';
import { globalConfigPath, projectConfigPath } from './paths.js';

export type EffortLevel = 'low' | 'medium' | 'high' | 'max';

export interface NotificationConfig {
  enabled?: boolean;
  sound?: string;
}

export interface RequiredPlugin {
  name: string;
  marketplace: string;
}

export interface Config {
  model?: string;
  tmuxSession?: string;
  orchestratorPrompt?: string;
  pollIntervalMs?: number;
  autoUpdate?: boolean;
  orchestratorEffort?: EffortLevel;
  agentEffort?: EffortLevel;
  editor?: string;
  repos?: string[];
  notifications?: NotificationConfig;
  requiredPlugins?: RequiredPlugin[];
}

const DEFAULT_CONFIG: Config = {
  pollIntervalMs: 5000,
  orchestratorEffort: 'high',
  agentEffort: 'medium',
  notifications: {
    enabled: true,
    sound: '/System/Library/Sounds/Hero.aiff',
  },
  requiredPlugins: [
    { name: 'devcore', marketplace: 'crouton-kit' },
  ],
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
