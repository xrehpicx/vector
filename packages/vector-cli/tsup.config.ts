import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['../../src/cli/index.ts'],
  outDir: 'dist',
  platform: 'node',
  target: 'node20',
  format: ['esm'],
  bundle: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,
  external: ['systray2'],
});
