import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseAgentFrontmatter } from './frontmatter.js';
import { projectDir } from '../shared/paths.js';
import { homedir } from 'node:os';

export interface DiscoveredMode {
  name: string;
  description?: string;
  filePath: string;
  source: 'project' | 'user' | 'bundled';
}

function resolveTemplatesDir(): string | undefined {
  // Built layout: dist/daemon/ → ../templates
  const distLayout = resolve(import.meta.dirname, '../templates');
  if (existsSync(distLayout)) return distLayout;
  // Source layout (tests/dev): src/daemon/ → ../../templates
  const srcLayout = resolve(import.meta.dirname, '../../templates');
  if (existsSync(srcLayout)) return srcLayout;
  return undefined;
}

interface ModeLayer {
  source: DiscoveredMode['source'];
  dir: string;
}

function modeLayers(cwd: string): ModeLayer[] {
  const layers: ModeLayer[] = [];
  const project = projectDir(cwd);
  if (existsSync(project)) layers.push({ source: 'project', dir: project });
  const user = join(homedir(), '.sisyphus');
  if (existsSync(user)) layers.push({ source: 'user', dir: user });
  const bundled = resolveTemplatesDir();
  if (bundled) layers.push({ source: 'bundled', dir: bundled });
  return layers;
}

/**
 * Discover available orchestrator modes across project (.sisyphus/), user
 * (~/.sisyphus/), and bundled (templates/) layers. Modes are matched by file
 * basename (`orchestrator-<name>.md`) and frontmatter `name`. On collision the
 * higher-priority layer wins; the bundled `orchestrator-base.md` is excluded.
 *
 * The signature now takes `cwd` for project-layer scanning. Existing callers
 * that pass no argument fall back to discovering only user + bundled layers.
 */
export function discoverOrchestratorModes(cwd?: string): DiscoveredMode[] {
  const layers = cwd ? modeLayers(cwd) : modeLayers(process.cwd());
  const seen = new Map<string, DiscoveredMode>();

  for (const layer of layers) {
    let files: string[];
    try {
      files = readdirSync(layer.dir);
    } catch {
      continue;
    }
    const modeFiles = files.filter(
      f => f.startsWith('orchestrator-') && f.endsWith('.md') && f !== 'orchestrator-base.md',
    );
    for (const file of modeFiles) {
      const filePath = join(layer.dir, file);
      let content = '';
      try {
        content = readFileSync(filePath, 'utf-8');
      } catch {
        continue;
      }
      const fm = parseAgentFrontmatter(content);
      const name = fm.name ?? file.replace(/^orchestrator-/, '').replace(/\.md$/, '');
      if (seen.has(name)) continue;
      const entry: DiscoveredMode = { name, filePath, source: layer.source };
      if (fm.description !== undefined) entry.description = fm.description;
      seen.set(name, entry);
    }
  }

  return Array.from(seen.values());
}
