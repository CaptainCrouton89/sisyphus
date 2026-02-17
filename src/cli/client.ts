import { connect } from 'node:net';
import { socketPath } from '../shared/paths.js';
import type { Request, Response } from '../shared/protocol.js';
import { ensureDaemonInstalled, waitForDaemon } from './install.js';

function rawSend(request: Request): Promise<Response> {
  const sock = socketPath();

  return new Promise<Response>((resolve, reject) => {
    const socket = connect(sock);
    let data = '';

    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('Request timed out after 10s'));
    }, 10_000);

    socket.on('connect', () => {
      socket.write(JSON.stringify(request) + '\n');
    });

    socket.on('data', (chunk) => {
      data += chunk.toString();
      const newlineIdx = data.indexOf('\n');
      if (newlineIdx !== -1) {
        clearTimeout(timeout);
        const line = data.slice(0, newlineIdx);
        socket.destroy();
        try {
          resolve(JSON.parse(line) as Response);
        } catch {
          reject(new Error(`Invalid JSON response from daemon: ${line}`));
        }
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

export async function sendRequest(request: Request): Promise<Response> {
  try {
    return await rawSend(request);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ECONNREFUSED') {
      if (process.platform !== 'darwin') {
        throw new Error(
          `Sisyphus daemon is not running.\n` +
          `  Start it manually: sisyphusd &\n` +
          `  Or check logs at: ~/.sisyphus/daemon.log`
        );
      }
      // Auto-install and retry once
      await ensureDaemonInstalled();
      await waitForDaemon(5000);
      return rawSend(request);
    }
    throw err;
  }
}
