import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolve the bundled `deploy/` directory shipped with the npm package.
 *
 * Layout in the published package:
 *   dist/cli.js         (this file at runtime, after tsup bundle)
 *   deploy/             (sibling of dist/, copied via tsup onSuccess)
 *
 * Layout in the source repo:
 *   src/cli/deploy/templates.ts (this file)
 *   deploy/                     (sibling of src/, root of repo)
 */
export function deployRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));

  // Bundled: dist/cli.js → ../deploy
  const bundled = resolve(here, '..', 'deploy');
  if (existsSync(bundled)) return bundled;

  // Source: src/cli/deploy/ → ../../../deploy
  const sourceRoot = resolve(here, '..', '..', '..', 'deploy');
  if (existsSync(sourceRoot)) return sourceRoot;

  throw new Error(
    `Could not locate deploy/ templates. Looked at:\n  ${bundled}\n  ${sourceRoot}\n` +
    'This usually means the npm package was built without the deploy/ tree. ' +
    "Confirm package.json `files` includes 'deploy' and tsup.config.ts copies it into dist/.",
  );
}

export function providerModuleDir(provider: string): string {
  return resolve(deployRoot(), provider);
}
