import { defineConfig } from 'tsup';

const secureBuild = process.env.TRAE_PET_SECURE_BUILD === '1';

// Compiles the TRAE hook CLI into a single, dependency-free CommonJS file.
// Keeping it lean matters because TRAE invokes the hook on every event.
export default defineConfig({
  entry: { cli: 'src/cli/index.ts' },
  tsconfig: 'tsconfig.node.json',
  outDir: 'dist',
  format: ['cjs'],
  outExtension: () => ({ js: '.cjs' }),
  target: 'node22',
  platform: 'node',
  bundle: true,
  define: {
    __TRAE_PET_SECURE_BUILD__: JSON.stringify(secureBuild),
  },
  splitting: false,
  clean: true,
  // electron is only present in dev; the hook CLI requires it lazily.
  external: ['electron'],
  minify: true,
  sourcemap: false,
  dts: false,
});
