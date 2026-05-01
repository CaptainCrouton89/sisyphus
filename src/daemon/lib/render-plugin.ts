import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { renderEffortMarkers, type EffortTier } from './effort-render.js';

// Files we filter through renderEffortMarkers when copying. Everything else is byte-copied
// (hooks scripts, JSON, settings, etc.).
const FILTERED_EXTS = new Set(['.md']);

function isFiltered(name: string): boolean {
  for (const ext of FILTERED_EXTS) {
    if (name.endsWith(ext)) return true;
  }
  return false;
}

/**
 * Render a plugin directory tree into `destDir`, stripping `<!--EFFORT:...-->` blocks
 * to the active tier on the way through. Markdown files (skill bodies, command bodies,
 * CLAUDE.md, SKILL.md) get filtered; non-markdown files are byte-copied.
 *
 * `destDir` is wiped first so removed source files don't linger as stale tier-irrelevant
 * content from a previous render.
 */
export function renderPluginDir(srcDir: string, destDir: string, tier: EffortTier | string): void {
  if (!existsSync(srcDir)) {
    throw new Error(`renderPluginDir: source dir does not exist: ${srcDir}`);
  }
  rmSync(destDir, { recursive: true, force: true });
  mkdirSync(destDir, { recursive: true });
  walk(srcDir, destDir, tier);
}

function walk(src: string, dest: string, tier: EffortTier | string): void {
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(destPath, { recursive: true });
      walk(srcPath, destPath, tier);
    } else if (entry.isFile()) {
      if (isFiltered(entry.name)) {
        const rendered = renderEffortMarkers(readFileSync(srcPath, 'utf-8'), tier);
        writeFileSync(destPath, rendered, 'utf-8');
      } else {
        copyFileSync(srcPath, destPath);
      }
    }
  }
}
