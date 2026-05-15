import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import type { Session } from '../../shared/types.js';
import { exitError, exitUsage } from '../errors.js';
import { emitJsonOk } from '../output.js';

const VALID_STATES = ['on', 'off', 'toggle'] as const;
type State = typeof VALID_STATES[number];

export function registerSessionDangerous(program: Command): void {
  program
    .command('dangerous [sessionId] [state]')
    .description("Toggle dangerous mode (auto-accept first option for every ask). state: on|off|toggle (default: toggle)")
    .addHelpText(
      'after',
      `
Examples:
  $ sis session dangerous                 # toggle current session's mode
  $ sis session dangerous sess-7f2a on
  $ sis session dangerous sess-7f2a off --json

Output:
  Default       "DANGEROUS mode {ON|OFF} for session <id>" + flushed-ask count.
  --json        { ok, schema_version: 1, data: { sessionId, enabled, flushed } }

Exit codes: 0 ok | 2 usage (bad state) | 3 not_found.`,
    )
    .action(async (sessionIdArg?: string, stateArg?: string) => {
      let sessionId: string;
      if (sessionIdArg) {
        sessionId = sessionIdArg;
      } else if (process.env.SISYPHUS_SESSION_ID) {
        sessionId = process.env.SISYPHUS_SESSION_ID;
      } else {
        exitUsage('missing_session_id', 'Provide <sessionId> or set SISYPHUS_SESSION_ID environment variable', {
          next: 'export SISYPHUS_SESSION_ID=<sessionId> or pass it as the first positional',
        });
      }

      let state: State;
      if (!stateArg) {
        state = 'toggle';
      } else {
        const stateInput = stateArg.toLowerCase();
        if (!VALID_STATES.includes(stateInput as State)) {
          exitUsage('bad_state', `state must be one of: ${VALID_STATES.join(', ')}`, {
            received: stateArg,
            expected: [...VALID_STATES],
          });
        }
        state = stateInput as State;
      }

      let enabled: boolean;
      if (state === 'toggle') {
        const cwd = process.env['SISYPHUS_CWD'] ? process.env['SISYPHUS_CWD'] : process.cwd();
        const statusResp = await sendRequest({ type: 'status', sessionId, cwd });
        if (!statusResp.ok) exitError(statusResp.error);
        const session = statusResp.data?.session as Session | undefined;
        if (!session) {
          exitError({
            code: 'unknown_session',
            kind: 'not_found',
            message: `session ${sessionId} not found`,
            received: sessionId,
            next: 'sis session list --all',
          });
        }
        enabled = !session.dangerousMode;
      } else {
        enabled = state === 'on';
      }

      const request: Request = { type: 'set-dangerous-mode', sessionId, enabled };
      const response = await sendRequest(request);
      if (!response.ok) exitError(response.error);
      const flushedRaw = response.data?.flushed;
      const flushed = typeof flushedRaw === 'number' ? flushedRaw : 0;
      if (emitJsonOk({ sessionId, enabled, flushed })) return;
      const label = enabled ? 'ON' : 'OFF';
      let msg = `DANGEROUS mode ${label} for session ${sessionId}`;
      if (enabled && flushed > 0) {
        msg += ` — ${flushed} pending ask${flushed === 1 ? '' : 's'} auto-resolved`;
      }
      console.log(msg);
    });
}
