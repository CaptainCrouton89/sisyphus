import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SISYPHUS_ENTRIES = ['.sisyphus'];

const SISYPHUS_HEADER = '# Sisyphus';

/**
 * Ensures the project .gitignore includes entries for sisyphus generated artifacts.
 * Only runs in git repos. Creates .gitignore if missing. Skips entries already present.
 */
export function ensureSisyphusGitignore(cwd: string): void {
  // Only act in git repos
  if (!existsSync(join(cwd, '.git'))) return;

  const gitignorePath = join(cwd, '.gitignore');
  let content = '';

  if (existsSync(gitignorePath)) {
    content = readFileSync(gitignorePath, 'utf-8');
  }

  const lines = content.split('\n');
  const missing = SISYPHUS_ENTRIES.filter(entry => !lines.some(line => line.trim() === entry));

  if (missing.length === 0) return;

  const block = [SISYPHUS_HEADER, ...missing].join('\n');
  const separator = content.length > 0 && !content.endsWith('\n\n')
    ? content.endsWith('\n') ? '\n' : '\n\n'
    : '';

  writeFileSync(gitignorePath, content + separator + block + '\n', 'utf-8');
}
