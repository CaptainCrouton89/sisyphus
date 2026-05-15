import type { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { sendRequest } from '../client.js';
import type { Request } from '../../shared/protocol.js';
import { assertTmux } from '../tmux.js';
import { exitError, exitUsage } from '../errors.js';
import { emitJsonOk } from '../output.js';

// Daemon-side handleAwait blocks until the agent reaches a terminal status.
// Use a long socket timeout so realistic agent runtimes don't trip the default 10s.
const AWAIT_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export function registerAwait(program: Command): void {
  program
    .command('await')
    .description('Block until an agent reaches a terminal status, then print its final report inline. Marks the agent as consumed-inline so its report is suppressed from the next cycle.')
    .argument('<agentId>', 'Agent ID to await')
    .option('--session <sessionId>', 'Session ID (defaults to SISYPHUS_SESSION_ID env var)')
    .addHelpText(
      'after',
      `
Examples:
  $ sis agent await ag-7f2a-1
  $ sis agent await ag-7f2a-1 --json | jq -r '.data.report'

Behavior:
  Blocks for up to 24h waiting on the agent. Status header goes to stderr;
  the agent's report body goes to stdout — pipe to a file safely.

Output:
  Default       Status header on stderr: \`[<status>] <agentId> (<label>)\`
                Report body on stdout (file contents, ends with newline).
  --json        { ok, schema_version: 1, data: { agentId, sessionId, status, agentName, agentType, reportPath, report } }

Exit codes: 0 ok | 2 usage (missing --session) | 3 not_found (unknown agent) | 60 transient (daemon timeout).`,
    )
    .action(async (agentId: string, opts: { session?: string }) => {
      assertTmux();
      const sessionId = opts.session ?? process.env.SISYPHUS_SESSION_ID;
      if (!sessionId) {
        exitUsage('missing_session_id', 'Provide --session or set SISYPHUS_SESSION_ID environment variable', {
          next: 'export SISYPHUS_SESSION_ID=<sessionId> or pass --session <sessionId>',
        });
      }

      const request: Request = { type: 'await', sessionId, agentId };
      const response = await sendRequest(request, AWAIT_TIMEOUT_MS);
      if (!response.ok) exitError(response.error);

      const data = response.data ?? {};
      const status = data.status as string;
      const reportPath = data.reportPath as string | null;
      const agentName = data.agentName as string;
      const agentType = data.agentType as string;

      let report = '';
      if (reportPath && existsSync(reportPath)) {
        try {
          report = readFileSync(reportPath, 'utf-8');
        } catch (err) {
          process.stderr.write(`Warning: could not read report at ${reportPath}: ${err instanceof Error ? err.message : err}\n`);
        }
      }

      if (emitJsonOk({ agentId, sessionId, status, agentName, agentType, reportPath, report })) return;

      const shortType = agentType && agentType !== 'worker' ? agentType.replace(/^sisyphus:/, '') : '';
      const label = shortType ? `${shortType}-${agentName}` : agentName;
      // Status header is diagnostic — emit on stderr so the agent report on
      // stdout can be piped cleanly to a file or filter.
      process.stderr.write(`[${status}] ${agentId} (${label})\n`);
      if (report.length > 0) {
        process.stdout.write(report.endsWith('\n') ? report : report + '\n');
      }
    });
}
