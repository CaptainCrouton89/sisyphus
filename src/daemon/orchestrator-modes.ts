import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseAgentFrontmatter } from './frontmatter.js';

export interface DiscoveredMode {
  name: string;
  description?: string;
  filePath: string;
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

export function discoverOrchestratorModes(): DiscoveredMode[] {
  const templatesDir = resolveTemplatesDir();
  if (!templatesDir) return [];

  const files = readdirSync(templatesDir).filter(
    f => f.startsWith('orchestrator-') && f.endsWith('.md') && f !== 'orchestrator-base.md'
  );

  return files.map(file => {
    const content = readFileSync(join(templatesDir, file), 'utf-8');
    const fm = parseAgentFrontmatter(content);
    const name = fm.name ?? file.replace(/^orchestrator-/, '').replace(/\.md$/, '');
    return { name, description: fm.description, filePath: join(templatesDir, file) };
  });
}
