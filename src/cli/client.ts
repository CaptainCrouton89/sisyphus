import type { Request, Response } from '../shared/protocol.js';
import { rawSend as sharedRawSend } from '../shared/client.js';
import { ensureDaemonInstalled, waitForDaemon } from './install.js';

export function rawSend(request: Request): Promise<Response> {
  return sharedRawSend(request, 10_000);
}

export async function sendRequest(request: Request): Promise<Response> {
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const MAX_ATTEMPTS = 5;
  const RETRY_DELAY_MS = 2000;
  let installedDaemon = false;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await rawSend(request);
    } catch (err) {
      lastErr = err;
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ECONNREFUSED') {
        throw err;
      }

      if (attempt === MAX_ATTEMPTS) break;

      if (process.platform === 'darwin' && !installedDaemon) {
        installedDaemon = true;
        await ensureDaemonInstalled();
        await waitForDaemon(5000);
      } else {
        process.stderr.write(`Daemon not ready, retrying (${attempt}/${MAX_ATTEMPTS - 1})...\n`);
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  if (process.platform !== 'darwin') {
    const lines = [`Sisyphus daemon is not running.`];
    if (process.platform === 'linux') {
      lines.push(
        '',
        '  Start options:',
        '    sisyphusd &                                    # Run in background',
        '    nohup sisyphusd > ~/.sisyphus/daemon.log 2>&1 & # Persist after logout',
        '',
        '  For systemd (recommended):',
        '    # Create ~/.config/systemd/user/sisyphus.service with:',
        '    #   [Unit]',
        '    #   Description=Sisyphus Daemon',
        '    #   [Service]',
        '    #   ExecStart=/usr/bin/env node <path-to-sisyphusd>',
        '    #   Restart=always',
        '    #   [Install]',
        '    #   WantedBy=default.target',
        '    systemctl --user enable --now sisyphus',
      );
    } else {
      lines.push(
        '',
        '  Start it manually: sisyphusd &',
      );
    }
    lines.push(
      '',
      '  Diagnose: sisyphus doctor',
      '  Logs: tail -f ~/.sisyphus/daemon.log',
    );
    throw new Error(lines.join('\n'));
  }
  throw lastErr;
}
