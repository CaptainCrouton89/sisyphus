import { connect } from 'node:net';
import { socketPath } from '../shared/paths.js';
import type { Request, Response } from '../shared/protocol.js';

export async function sendRequest(request: Request): Promise<Response> {
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
      if ((err as NodeJS.ErrnoException).code === 'ENOENT' || (err as NodeJS.ErrnoException).code === 'ECONNREFUSED') {
        reject(new Error(
          `Sisyphus daemon is not running.\n` +
          `  Start it with: launchctl load ~/Library/LaunchAgents/com.sisyphus.daemon.plist\n` +
          `  Or check logs at: ~/.sisyphus/daemon.log`
        ));
      } else {
        reject(err);
      }
    });
  });
}
