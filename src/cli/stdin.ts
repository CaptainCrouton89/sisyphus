export function readStdin(opts: { force?: boolean } = {}): Promise<string | null> {
  // Without `force`, skip stdin if attached to a TTY — caller is interactive,
  // not piping. With `force`, read regardless: user explicitly asked via `--stdin`.
  if (!opts.force && process.stdin.isTTY) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf-8').trim();
      resolve(text || null);
    });
    process.stdin.on('error', reject);
  });
}
