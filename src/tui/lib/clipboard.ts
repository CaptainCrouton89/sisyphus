import { execSync } from 'node:child_process';

export function copyToClipboard(text: string): void {
  execSync('pbcopy', { input: text });
}
