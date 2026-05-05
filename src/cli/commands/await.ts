import type { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { assertTmux } from '../tmux.js';

// Daemon-side handleAwait blocks until the agent reaches a terminal status.
// Use a long socket timeout so realistic agent runtimes don't trip the default 10s.
const AWAIT_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export function registerAwait(program: Command): void {
  program
    .command('await')
    .description('Block until an agent reaches a terminal status, then print its final report inline. Marks the agent as consumed-inline so its report is suppressed from the next cycle.')
    .argument('<agentId>', 'Agent ID to await')
    .option('--session <sessionId>', 'Session ID (defaults to SISYPHUS_SESSION_ID env var)')
    .action(async (agentId: string, opts: { session?: string }) => {
      assertTmux();
      const sessionId = opts.session ?? process.env.SISYPHUS_SESSION_ID;
      if (!sessionId) {
        console.error('Error: provide --session or set SISYPHUS_SESSION_ID environment variable');
        process.exit(1);
      }

      const request: Request = { type: 'await', sessionId, agentId };
      const response = await sendRequest(request, AWAIT_TIMEOUT_MS);
      if (!response.ok) {
        console.error(`Error: ${response.error}`);
        process.exit(1);
      }

      const data = response.data ?? {};
      const status = data.status as string;
      const reportPath = data.reportPath as string | null;
      const agentName = data.agentName as string;
      const agentType = data.agentType as string;

      const shortType = agentType && agentType !== 'worker' ? agentType.replace(/^sisyphus:/, '') : '';
      const label = shortType ? `${shortType}-${agentName}` : agentName;
      console.log(`[${status}] ${agentId} (${label})`);
      if (reportPath && existsSync(reportPath)) {
        try {
          const body = readFileSync(reportPath, 'utf-8');
          if (body.length > 0) {
            // Avoid double newline: file usually ends with \n already.
            process.stdout.write(body.endsWith('\n') ? body : body + '\n');
          }
        } catch (err) {
          console.error(`Warning: could not read report at ${reportPath}: ${err instanceof Error ? err.message : err}`);
        }
      }
    });
}
