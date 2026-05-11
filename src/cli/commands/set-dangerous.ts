import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import type { Session } from '../../shared/types.js';

const VALID_STATES = ['on', 'off', 'toggle'] as const;
type State = typeof VALID_STATES[number];

export function registerSessionDangerous(program: Command): void {
  program
    .command('dangerous [sessionId] [state]')
    .description("Toggle dangerous mode (auto-accept first option for every ask). state: on|off|toggle (default: toggle)")
    .action(async (sessionIdArg?: string, stateArg?: string) => {
      let sessionId: string;
      if (sessionIdArg) {
        sessionId = sessionIdArg;
      } else if (process.env.SISYPHUS_SESSION_ID) {
        sessionId = process.env.SISYPHUS_SESSION_ID;
      } else {
        console.error('Error: provide <sessionId> or set SISYPHUS_SESSION_ID environment variable');
        process.exit(1);
      }

      let state: State;
      if (!stateArg) {
        state = 'toggle';
      } else {
        const stateInput = stateArg.toLowerCase();
        if (!VALID_STATES.includes(stateInput as State)) {
          console.error(`Error: state must be one of: ${VALID_STATES.join(', ')}`);
          process.exit(1);
        }
        state = stateInput as State;
      }

      let enabled: boolean;
      if (state === 'toggle') {
        const cwd = process.env['SISYPHUS_CWD'] ? process.env['SISYPHUS_CWD'] : process.cwd();
        const statusResp = await sendRequest({ type: 'status', sessionId, cwd });
        if (!statusResp.ok) {
          console.error(`Error: ${statusResp.error}`);
          process.exit(1);
        }
        const session = statusResp.data?.session as Session | undefined;
        if (!session) {
          console.error(`Error: session ${sessionId} not found`);
          process.exit(1);
        }
        enabled = !session.dangerousMode;
      } else {
        enabled = state === 'on';
      }

      const request: Request = { type: 'set-dangerous-mode', sessionId, enabled };
      const response = await sendRequest(request);
      if (response.ok) {
        const flushedRaw = response.data?.flushed;
        const flushed = typeof flushedRaw === 'number' ? flushedRaw : 0;
        const label = enabled ? 'ON' : 'OFF';
        let msg = `DANGEROUS mode ${label} for session ${sessionId}`;
        if (enabled && flushed > 0) {
          msg += ` — ${flushed} pending ask${flushed === 1 ? '' : 's'} auto-resolved`;
        }
        console.log(msg);
      } else {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }
    });
}
