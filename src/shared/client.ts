import { connect } from 'node:net';
import { socketPath } from './paths.js';
import type { Request, Response } from './protocol.js';

export function rawSend(request: Request, timeoutMs = 10_000): Promise<Response> {
  const sock = socketPath();

  return new Promise<Response>((resolve, reject) => {
    const socket = connect(sock);
    let data = '';

    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Request timed out after ${(timeoutMs / 1000).toFixed(0)}s. The daemon may be overloaded.\n  Check: sisyphus doctor\n  Logs: tail -20 ~/.sisyphus/daemon.log`));
    }, timeoutMs);

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
