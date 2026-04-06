import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { shellQuote } from '../shared/shell.js';

export function resolveCliBin(): string {
  return resolve(import.meta.dirname, 'cli.js');
}

export function resolveNpmBinDir(): string {
  return resolve(import.meta.dirname, '../../.bin');
}

/** Returns the banner cat command (no trailing &&), or null if banner file missing. */
export function resolveBannerCmd(): string | null {
  const bannerPath = resolve(import.meta.dirname, '../templates/banner.txt');
  return existsSync(bannerPath) ? `cat '${bannerPath}'` : null;
}

/** Joins an array of raw export statements with ' && '. */
export function buildEnvExports(statements: string[]): string {
  return statements.join(' && ');
}

/** Builds the notify command for a given pane. */
export function buildNotifyCmd(paneId: string): string {
  const cliBin = resolveCliBin();
  return `node "${cliBin}" notify pane-exited --pane-id ${shellQuote(paneId)}`;
}

/**
 * Writes a shell script to `${dir}/${name}.sh` with executable permissions.
 * Returns the full script path.
 */
export function writeRunScript(dir: string, name: string, lines: string[]): string {
  const scriptPath = `${dir}/${name}.sh`;
  writeFileSync(scriptPath, lines.join('\n'), { mode: 0o755 });
  return scriptPath;
}
