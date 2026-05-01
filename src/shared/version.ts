import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readSisyphusVersion(): string {
  // Bundled: dist/daemon.js → ../package.json
  // Source (tsx): src/shared/version.ts → ../../package.json
  for (const rel of ['../package.json', '../../package.json']) {
    try {
      const raw = readFileSync(resolve(import.meta.dirname, rel), 'utf-8');
      const pkg = JSON.parse(raw) as { name?: string; version?: string };
      if (pkg.name === 'sisyphi' && pkg.version) return pkg.version;
    } catch {}
  }
  return '0.0.0';
}

const cachedVersion = readSisyphusVersion();

export function getSisyphusVersion(): string {
  return cachedVersion;
}
