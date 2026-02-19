import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'node:https';
import { daemonUpdatingPath } from '../shared/paths.js';

function isNewer(latest: string, current: string): boolean {
  const a = latest.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return false;
}

function readPackageVersion(): string {
  // Bundled: dist/daemon.js → ../package.json
  // Source (tsx): src/daemon/updater.ts → ../../package.json
  for (const rel of ['../package.json', '../../package.json']) {
    try {
      const raw = readFileSync(resolve(import.meta.dirname, rel), 'utf-8');
      const pkg = JSON.parse(raw) as { name?: string; version?: string };
      if (pkg.name === 'sisyphi' && pkg.version) return pkg.version;
    } catch {}
  }
  return '0.0.0';
}

const currentVersion = readPackageVersion();

export function getCurrentVersion(): string {
  return currentVersion;
}

export function checkForUpdate(): Promise<{ current: string; latest: string } | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve(null);
    }, 5000);

    const req = get('https://registry.npmjs.org/sisyphi/latest', (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => {
        clearTimeout(timeout);
        try {
          const { version: latest } = JSON.parse(data) as { version: string };
          if (latest && isNewer(latest, currentVersion)) {
            resolve({ current: currentVersion, latest });
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    });

    req.on('error', () => {
      clearTimeout(timeout);
      resolve(null);
    });
  });
}

export function applyUpdate(expectedVersion: string): boolean {
  try {
    // launchd gives a minimal PATH — ensure node/npm directory is on PATH
    const nodeDir = resolve(process.execPath, '..');
    const env = { ...process.env, PATH: `${nodeDir}:${process.env.PATH ?? ''}` };
    execSync('npm install -g sisyphi', { timeout: 15000, stdio: 'pipe', env });

    // Verify the install actually landed the expected version
    const result = execSync('npm ls -g sisyphi --json --depth=0', {
      timeout: 5000, encoding: 'utf-8', env,
    });
    const info = JSON.parse(result) as { dependencies?: { sisyphi?: { version?: string } } };
    const installed = info.dependencies?.sisyphi?.version;
    if (installed !== expectedVersion) {
      console.error(`[sisyphus] Update installed ${installed} but expected ${expectedVersion}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[sisyphus] Auto-update failed:', err);
    return false;
  }
}

function markUpdating(version: string): void {
  try { writeFileSync(daemonUpdatingPath(), version, 'utf-8'); } catch {}
}

function clearUpdating(): void {
  try { unlinkSync(daemonUpdatingPath()); } catch {}
}

export async function checkAndApply(): Promise<void> {
  clearUpdating(); // clean up stale marker from previous run
  try {
    const update = await checkForUpdate();
    if (!update) return;

    console.log(`[sisyphus] Update available: ${update.current} → ${update.latest}`);
    markUpdating(update.latest);
    const success = applyUpdate(update.latest);
    if (success) {
      console.log(`[sisyphus] Updated to ${update.latest}, restarting daemon...`);
      process.exit(0); // launchd respawns with new code
    }
    clearUpdating();
  } catch (err) {
    clearUpdating();
    console.error('[sisyphus] Auto-update check failed:', err);
  }
}
