import { connect } from 'node:net';
import { socketPath } from '../../shared/paths.js';
import type { Request, Response } from '../../shared/protocol.js';

export function send(request: Request): Promise<Response> {
  const sock = socketPath();

  return new Promise<Response>((resolve, reject) => {
    const socket = connect(sock);
    let data = '';

    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('Request timed out'));
    }, 5_000);

    socket.on('connect', () => {
      socket.write(JSON.stringify(request) + '\n');
    });

    socket.on('data', (chunk) => {
      data += chunk.toString();
      const idx = data.indexOf('\n');
      if (idx !== -1) {
        clearTimeout(timeout);
        const line = data.slice(0, idx);
        socket.destroy();
        try {
          resolve(JSON.parse(line) as Response);
        } catch {
          reject(new Error(`Invalid JSON from daemon`));
        }
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}
