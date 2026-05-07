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
  // splitting=false: each entry inlines its shared deps. Larger dist, but
  // partial npm upgrades can't leave a daemon.js referencing a hash chunk
  // (paths-XXXXXX.js) from a previous version. Splitting + content-hashed
  // chunks made stale-chunk crashes a recurring user-install footgun.
  splitting: false,
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
    rmSync('dist/deploy', { recursive: true, force: true });
    cpSync('deploy', 'dist/deploy', { recursive: true });
  },
});
