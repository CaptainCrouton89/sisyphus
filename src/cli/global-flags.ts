/**
 * Universal CLI flags applied uniformly to every command:
 *   --json     Emit structured JSON to stdout; suppress ANSI; suppress diagnostic prose.
 *   --no-color Disable ANSI even on TTY.
 *
 * Stored in module-level state because Commander v13 makes propagating root
 * options to deeply-nested subcommand actions awkward. `setGlobalFlags` is
 * called from the root preAction hook in src/cli/index.ts; commands read via
 * `getGlobalFlags()`.
 */

export interface GlobalFlags {
  json: boolean;
  color: boolean;
}

let state: GlobalFlags = {
  json: false,
  // Default: color on iff stdout is a TTY, NO_COLOR unset, TERM != dumb.
  // FORCE_COLOR=1 overrides. Computed lazily because env may change before any
  // output is written.
  color: defaultColor(),
};

export function setGlobalFlags(flags: Partial<GlobalFlags>): void {
  state = { ...state, ...flags };
  // Propagate to env so the shared color helpers (which can be evaluated from
  // any module — daemon log writers, format.ts wrappers, third-party libs) see
  // a single source of truth.
  if (state.color === false) {
    process.env['NO_COLOR'] = '1';
  }
}

export function getGlobalFlags(): GlobalFlags {
  return state;
}

function defaultColor(): boolean {
  if (process.env['FORCE_COLOR'] === '1') return true;
  if (process.env['NO_COLOR'] !== undefined) return false;
  if (process.env['TERM'] === 'dumb') return false;
  return process.stdout.isTTY === true;
}
