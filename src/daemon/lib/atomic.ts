import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { renameSync, writeFileSync } from 'node:fs';

export function atomicWrite(filePath: string, data: string): void {
  const dir = dirname(filePath);
  const tmpPath = join(dir, `.atomic.${randomUUID()}.tmp`);
  writeFileSync(tmpPath, data, 'utf-8');
  renameSync(tmpPath, filePath);
}

const locks = new Map<string, Promise<void>>();

export async function withLock<T>(key: string, fn: () => T): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  let resolve!: () => void;
  const next = new Promise<void>(r => { resolve = r; });
  locks.set(key, next);
  await prev;
  try {
    return fn();
  } finally {
    resolve();
    if (locks.get(key) === next) {
      locks.delete(key);
    }
  }
}
