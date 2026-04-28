import { defineConfig } from 'tsup';
import { cpSync, rmSync } from 'node:fs';

export default defineConfig({
  entry: {
    daemon: 'src/daemon/index.ts',
    cli: 'src/cli/index.ts',
    tui: 'src/tui/index.ts',
  },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  splitting: true,
  clean: true,
  sourcemap: true,
  banner: ({ format }) => {
    if (format === 'esm') {
      return { js: '#!/usr/bin/env node' };
    }
    return {};
  },
  onSuccess: async () => {
    rmSync('dist/templates', { recursive: true, force: true });
    cpSync('templates', 'dist/templates', { recursive: true });
  },
});
