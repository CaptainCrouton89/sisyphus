import { readFileSync } from 'node:fs';
import { globalConfigPath, projectConfigPath } from './paths.js';
import type { StatusBarConfig } from './types.js';

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface NotificationConfig {
  enabled?: boolean;
  sound?: string;
}

export interface RequiredPlugin {
  name: string;
  marketplace: string;
  /** GitHub owner of the marketplace repo (`<owner>/<marketplace>`). */
  owner: string;
}

export interface UploadConfig {
  /** Worker base URL, e.g. https://sisyphus-upload-proxy.rhyneer-silas.workers.dev */
  url: string;
  /** Bearer token, format `sisyphus_pat_<43-char-base64url>` */
  token: string;
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
  companionPopup?: boolean;
  requiredPlugins?: RequiredPlugin[];
  statusBar?: StatusBarConfig;
  upload?: UploadConfig;
}

const DEFAULT_CONFIG: Config = {
  model: 'claude-opus-4-7[1m]',
  pollIntervalMs: 5000,
  orchestratorEffort: 'xhigh',
  agentEffort: 'medium',
  notifications: {
    enabled: true,
    sound: '/System/Library/Sounds/Hero.aiff',
  },
  companionPopup: true,
  requiredPlugins: [
    { name: 'devcore', marketplace: 'crouton-kit', owner: 'crouton-labs' },
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
  const globalConfig = readJsonFile(globalConfigPath());
  const projectConfig = readJsonFile(projectConfigPath(cwd));
  if (projectConfig.upload !== undefined) {
    console.warn(
      'ignoring `upload` block from project-local .sisyphus/config.json — only the global config can set upload credentials',
    );
    delete projectConfig.upload;
  }
  const merged: Config = { ...DEFAULT_CONFIG, ...globalConfig, ...projectConfig };
  if (globalConfig.statusBar || projectConfig.statusBar) {
    merged.statusBar = {
      ...merged.statusBar,
      ...globalConfig.statusBar,
      ...projectConfig.statusBar,
      colors: {
        ...merged.statusBar?.colors,
        ...globalConfig.statusBar?.colors,
        ...projectConfig.statusBar?.colors,
      },
      segments: {
        ...merged.statusBar?.segments,
        ...globalConfig.statusBar?.segments,
        ...projectConfig.statusBar?.segments,
      },
    };
  }
  return merged;
}
