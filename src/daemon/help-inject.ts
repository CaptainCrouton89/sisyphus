import { execSync } from 'node:child_process';
import { resolveCliBin } from './spawn-helpers.js';

/**
 * Resolve {{HELP:<cmd>}} tokens by inlining live `sis <cmd> -h` output wrapped
 * in a <cli-guide> block. The CLI's own help is the single source of truth for
 * command mechanics — prompts never restate flags, examples, or exit codes.
 * Used by both the orchestrator prompt assembly and the agent suffix.
 */
export function injectHelp(text: string): string {
  if (!text.includes('{{HELP:')) return text;
  const cliBin = resolveCliBin();
  const renderHelp = (cmd: string): string => {
    try {
      return execSync(`${process.execPath} ${cliBin} ${cmd} -h`, {
        encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000,
      }).trim();
    } catch (e) {
      const out = (e as { stdout?: string }).stdout;
      if (typeof out === 'string' && out.length > 0) return out.trim();
      return `(help unavailable: sis ${cmd} -h)`;
    }
  };
  return text.replace(/\{\{HELP:([^}]+)\}\}/g, (_m, cmd: string) => {
    const c = cmd.trim();
    return `<cli-guide bash="sis ${c} -h">\n${renderHelp(c)}\n</cli-guide>`;
  });
}
