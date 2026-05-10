import { existsSync, readFileSync, readdirSync, copyFileSync, mkdirSync, statSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join, basename, relative } from 'node:path';
import {
  projectAgentPluginDir,
  userAgentPluginDir,
  projectOrchestratorPluginDir,
  userOrchestratorPluginDir,
} from '../shared/paths.js';
import { renderEffortMarkers, type EffortTier } from './lib/effort-render.js';

export type LayerSource = 'project' | 'user' | 'bundled';

export interface PluginLayer {
  source: LayerSource;
  root: string;
}

/**
 * Resolve the bundled `templates/{kind}` directory for both the built layout
 * (`dist/daemon/` → `../templates`) and the source layout (`src/daemon/` → `../../templates`).
 */
export function resolveBundledTemplateDir(kind: string): string | undefined {
  const built = resolve(import.meta.dirname, '../templates', kind);
  if (existsSync(built)) return built;
  const src = resolve(import.meta.dirname, '../../templates', kind);
  if (existsSync(src)) return src;
  return undefined;
}

/**
 * Layered plugin lookup. Returns layers in priority order: project > user > bundled.
 * Each layer is included only if its root directory exists; bundled is included
 * even when missing so callers can detect the absence and error explicitly.
 */
export function agentPluginLayers(cwd: string): PluginLayer[] {
  const layers: PluginLayer[] = [];
  const project = projectAgentPluginDir(cwd);
  if (existsSync(project)) layers.push({ source: 'project', root: project });
  const user = userAgentPluginDir();
  if (existsSync(user)) layers.push({ source: 'user', root: user });
  const bundled = resolveBundledTemplateDir('agent-plugin');
  if (bundled) layers.push({ source: 'bundled', root: bundled });
  return layers;
}

export function orchestratorPluginLayers(cwd: string): PluginLayer[] {
  const layers: PluginLayer[] = [];
  const project = projectOrchestratorPluginDir(cwd);
  if (existsSync(project)) layers.push({ source: 'project', root: project });
  const user = userOrchestratorPluginDir();
  if (existsSync(user)) layers.push({ source: 'user', root: user });
  const bundled = resolveBundledTemplateDir('orchestrator-plugin');
  if (bundled) layers.push({ source: 'bundled', root: bundled });
  return layers;
}

// ── Hook manifest schema ──────────────────────────────────────────────────────

export interface HookEntry {
  type?: string;
  command: string;
}

export interface HookGroup {
  matcher?: string;
  agentTypes?: string[];
  /**
   * Optional gate keyed off the spawning agent's frontmatter.
   * `non-interactive` → drop this group when `frontmatter.interactive === true`.
   */
  condition?: 'non-interactive';
  hooks: HookEntry[];
}

export interface HookManifest {
  hooks?: Record<string, HookGroup[]>;
  /**
   * Filenames (basename of `command` script) to suppress from lower-priority
   * layers. Applied across all hook events.
   */
  disable?: string[];
}

interface HookFilterCtx {
  agentType: string;        // normalized (no `sisyphus:` prefix)
  interactive: boolean;
}

function readManifest(layerRoot: string): HookManifest | null {
  const path = join(layerRoot, 'hooks', 'hooks.json');
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as HookManifest;
    return parsed;
  } catch (err) {
    console.warn(`[sisyphus] Failed to parse hooks manifest at ${path}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

function commandScriptName(command: string): string | null {
  // Match the trailing path component of a script reference like
  // `bash ${CLAUDE_PLUGIN_ROOT}/hooks/foo.sh` → `foo.sh`.
  const match = command.match(/([\w.-]+\.[\w]+)\s*$/);
  return match ? match[1]! : null;
}

function groupApplies(group: HookGroup, ctx: HookFilterCtx): boolean {
  const types = group.agentTypes ?? ['all'];
  const matchesType = types.includes('all') || types.includes(ctx.agentType);
  if (!matchesType) return false;
  if (group.condition === 'non-interactive' && ctx.interactive) return false;
  return true;
}

/**
 * Merge hook manifests across layers (project > user > bundled), filter by
 * the spawning agent's type/interactive flag, and apply `disable` lists from
 * higher layers to suppress lower-layer hook scripts by basename.
 *
 * Returns the merged hooks object suitable for writing to `hooks/hooks.json`.
 */
export function mergeHookManifests(
  layers: PluginLayer[],
  ctx: HookFilterCtx,
): Record<string, HookGroup[]> {
  // Higher-priority layers (project > user > bundled) come first in `layers`.
  // Their `disable` lists suppress matching scripts in lower layers.
  const disabled = new Set<string>();
  for (const layer of layers) {
    const manifest = readManifest(layer.root);
    if (!manifest?.disable) continue;
    for (const name of manifest.disable) disabled.add(name);
  }

  // Merge in priority order: project entries appear first under each event,
  // then user, then bundled. Stable order keeps regression diffing readable.
  const merged: Record<string, HookGroup[]> = {};
  for (const layer of layers) {
    const manifest = readManifest(layer.root);
    if (!manifest?.hooks) continue;
    for (const [event, groups] of Object.entries(manifest.hooks)) {
      if (!Array.isArray(groups)) continue;
      for (const group of groups) {
        if (!groupApplies(group, ctx)) continue;
        const filteredHooks = group.hooks.filter(h => {
          const script = commandScriptName(h.command);
          return !script || !disabled.has(script);
        });
        if (filteredHooks.length === 0) continue;
        const cleaned: HookGroup = {
          ...(group.matcher !== undefined && { matcher: group.matcher }),
          hooks: filteredHooks,
        };
        // Strip extension-only fields (agentTypes, condition) before emitting —
        // they're sisyphus-specific and Claude Code doesn't need them.
        if (!merged[event]) merged[event] = [];
        merged[event]!.push(cleaned);
      }
    }
  }
  return merged;
}

// ── File copy with override semantics ─────────────────────────────────────────

interface CopyLayeredOpts {
  /** Subdirectory under each layer root to scan (e.g. `'hooks'`, `'skills'`). */
  subdir: string;
  /** Where to write the merged content. */
  destDir: string;
  /**
   * Optional predicate to filter which entries from each layer get copied.
   * Receives the basename. Default: copy everything except `CLAUDE.md` and
   * the manifest file `hooks.json` (consumed separately).
   */
  filter?: (name: string) => boolean;
  /**
   * Optional set of script basenames to skip entirely — used to honor `disable`
   * lists when copying hook scripts.
   */
  skipFiles?: Set<string>;
  /** Whether to recurse into subdirectories (e.g. skills). */
  recurse?: boolean;
}

const defaultFilter = (name: string): boolean => name !== 'CLAUDE.md' && name !== 'hooks.json';

/**
 * Copy entries from each layer's `subdir` into `destDir`, with project > user > bundled
 * priority. Higher-priority layers win on filename collision; lower layers fill in gaps.
 *
 * Used for hooks (flat files) and skills (recursive directories).
 */
export function copyLayered(layers: PluginLayer[], opts: CopyLayeredOpts): void {
  mkdirSync(opts.destDir, { recursive: true });
  const filter = opts.filter ?? defaultFilter;
  const written = new Set<string>();

  for (const layer of layers) {
    const layerSubdir = join(layer.root, opts.subdir);
    if (!existsSync(layerSubdir)) continue;
    let entries: string[];
    try {
      entries = readdirSync(layerSubdir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!filter(name)) continue;
      if (opts.skipFiles?.has(name)) continue;
      if (written.has(name)) continue;
      const src = join(layerSubdir, name);
      const dest = join(opts.destDir, name);
      const stat = statSync(src);
      if (stat.isDirectory()) {
        if (!opts.recurse) continue;
        copyDirRecursive(src, dest);
      } else if (stat.isFile()) {
        copyFileSync(src, dest);
      }
      written.add(name);
    }
  }
}

function copyDirRecursive(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dest, name);
    const stat = statSync(s);
    if (stat.isDirectory()) {
      copyDirRecursive(s, d);
    } else if (stat.isFile()) {
      copyFileSync(s, d);
    }
  }
}

/**
 * Collect every script basename referenced by any hook entry in any layer's
 * manifest, filtered to entries that match the given context. The daemon uses
 * this to decide which hook scripts to copy from layered `hooks/` directories.
 */
export function collectReferencedHookScripts(
  layers: PluginLayer[],
  ctx: HookFilterCtx,
): Set<string> {
  const scripts = new Set<string>();
  for (const layer of layers) {
    const manifest = readManifest(layer.root);
    if (!manifest?.hooks) continue;
    for (const groups of Object.values(manifest.hooks)) {
      if (!Array.isArray(groups)) continue;
      for (const group of groups) {
        if (!groupApplies(group, ctx)) continue;
        for (const h of group.hooks) {
          const name = commandScriptName(h.command);
          if (name) scripts.add(name);
        }
      }
    }
  }
  return scripts;
}

/**
 * Resolve the suppression set: for each `disable` entry in any layer, mark the
 * named script as suppressed. Used when copying hook scripts so disabled scripts
 * don't get copied even though their layer file exists on disk.
 */
export function collectDisabledHookScripts(layers: PluginLayer[]): Set<string> {
  const disabled = new Set<string>();
  for (const layer of layers) {
    const manifest = readManifest(layer.root);
    if (!manifest?.disable) continue;
    for (const name of manifest.disable) disabled.add(name);
  }
  return disabled;
}

/**
 * Build the project-level "skill index" used by `frontmatter.skills`: a map of
 * skill-directory-name → resolved absolute path on disk. Higher-priority layers
 * win on directory-name collision.
 */
export function indexAvailableSkills(layers: PluginLayer[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const layer of layers) {
    const skillsRoot = join(layer.root, 'skills');
    if (!existsSync(skillsRoot)) continue;
    let entries: string[];
    try {
      entries = readdirSync(skillsRoot);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (index.has(name)) continue;
      const path = join(skillsRoot, name);
      try {
        if (statSync(path).isDirectory()) index.set(name, path);
      } catch {
        // Ignore read errors — silently skip unreadable entries
      }
    }
  }
  return index;
}

/**
 * Copy a specific named skill directory into `destDir/skills/<name>` from the
 * highest-priority layer that defines it. Returns true if the skill was found.
 */
export function copySkill(layers: PluginLayer[], skillName: string, destSkillsDir: string): boolean {
  const index = indexAvailableSkills(layers);
  const src = index.get(skillName);
  if (!src) return false;
  copyDirRecursive(src, join(destSkillsDir, skillName));
  return true;
}

// ── Layered .md / settings lookup ────────────────────────────────────────────

/**
 * Look up a single file across layers (project > user > bundled), returning
 * the highest-priority matching path, or null.
 */
export function findInLayers(layers: PluginLayer[], relPath: string): string | null {
  for (const layer of layers) {
    const candidate = join(layer.root, relPath);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Public for tests / debugging. */
export const __testing = { commandScriptName, groupApplies };

// Re-export a small wrapper that the rest of the daemon can use without
// importing `node:path` directly.
export function basenameOf(path: string): string {
  return basename(path);
}

// ── Layered plugin tree rendering ─────────────────────────────────────────────

const FILTERED_RENDER_EXTS = new Set(['.md']);

function isRenderable(name: string): boolean {
  for (const ext of FILTERED_RENDER_EXTS) {
    if (name.endsWith(ext)) return true;
  }
  return false;
}

interface OverlayEntry {
  src: string;
  source: LayerSource;
}

function collectOverlay(layers: PluginLayer[]): Map<string, OverlayEntry> {
  // Walk layers in priority order (project > user > bundled). For each file by
  // relative path, the first (highest-priority) layer wins.
  const overlay = new Map<string, OverlayEntry>();
  for (const layer of layers) {
    if (!existsSync(layer.root)) continue;
    walkRelative(layer.root, '', (relPath, absPath) => {
      if (overlay.has(relPath)) return;
      overlay.set(relPath, { src: absPath, source: layer.source });
    });
  }
  return overlay;
}

function walkRelative(root: string, prefix: string, visit: (rel: string, abs: string) => void): void {
  const dir = prefix ? join(root, prefix) : root;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const childPrefix = prefix ? join(prefix, name) : name;
    const abs = join(dir, name);
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(abs);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walkRelative(root, childPrefix, visit);
    } else if (stat.isFile()) {
      visit(childPrefix, abs);
    }
  }
}

/**
 * Compose a plugin directory tree from layered roots into `destDir`, applying
 * effort marker rendering to `.md` files. Higher-priority layers shadow lower
 * ones on relative-path collision. `destDir` is wiped first so removed source
 * files don't linger from a previous render.
 *
 * Mirrors `lib/render-plugin.ts:renderPluginDir` but operates over layers.
 */
export function renderLayeredPluginDir(
  layers: PluginLayer[],
  destDir: string,
  tier: EffortTier | string,
): void {
  rmSync(destDir, { recursive: true, force: true });
  mkdirSync(destDir, { recursive: true });
  const overlay = collectOverlay(layers);
  for (const [relPath, entry] of overlay) {
    const destPath = join(destDir, relPath);
    mkdirSync(join(destPath, '..'), { recursive: true });
    if (isRenderable(basename(relPath))) {
      const rendered = renderEffortMarkers(readFileSync(entry.src, 'utf-8'), tier);
      writeFileSync(destPath, rendered, 'utf-8');
    } else {
      copyFileSync(entry.src, destPath);
    }
  }
}

/**
 * Layered shallow-merge of JSON files. Reads the same `relPath` from each layer
 * and merges with project > user > bundled priority (higher layer wins per top-level key).
 * Returns the merged object, or an empty object if no layer provides the file.
 */
export function mergeLayeredJSON(layers: PluginLayer[], relPath: string): Record<string, unknown> {
  let result: Record<string, unknown> = {};
  // Walk lowest-priority first so higher layers overwrite; reverse to flip iteration order.
  for (const layer of [...layers].reverse()) {
    const path = join(layer.root, relPath);
    if (!existsSync(path)) continue;
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
      result = { ...result, ...parsed };
    } catch (err) {
      console.warn(`[sisyphus] Failed to parse ${path}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return result;
}

// Avoid unused-import lint on `relative` — exported for downstream symmetry.
export { relative as relativePath };
