import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { contentSecurityPolicy } from './src/shared/content-security-policy';

const sharedAlias = {
  '@shared': resolve(__dirname, 'src/shared'),
};

function cspPlugin(production: boolean): Plugin {
  return {
    name: 'trae-pet-content-security-policy',
    transformIndexHtml: {
      order: 'pre',
      handler() {
        return [{
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: contentSecurityPolicy(production),
          },
          injectTo: 'head-prepend',
        }];
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const production = mode === 'production';

  return {
    main: {
      resolve: { alias: sharedAlias },
      // The main process reuses the hook installer, so it must agree with the
      // CLI bundle (tsup.config.ts) about the secure-build flag.
      define: {
        __TRAE_PET_SECURE_BUILD__: JSON.stringify(process.env.TRAE_PET_SECURE_BUILD === '1'),
      },
      // Package importing is a runtime feature, so adm-zip must be bundled into
      // app.asar instead of depending on a production node_modules directory.
      plugins: [externalizeDepsPlugin({ exclude: ['adm-zip'] })],
      build: {
        outDir: 'out/main',
        lib: { entry: resolve(__dirname, 'src/app/main/index.ts') },
        minify: production,
        sourcemap: production ? false : undefined,
      },
    },
    preload: {
      resolve: { alias: sharedAlias },
      plugins: [externalizeDepsPlugin()],
      build: {
        outDir: 'out/preload',
        lib: { entry: resolve(__dirname, 'src/app/preload/index.ts') },
        minify: production,
        sourcemap: production ? false : undefined,
      },
    },
    renderer: {
      root: resolve(__dirname, 'src/app/renderer'),
      resolve: { alias: sharedAlias },
      plugins: [cspPlugin(production), react()],
      build: {
        outDir: resolve(__dirname, 'out/renderer'),
        minify: production,
        sourcemap: production ? false : undefined,
        rollupOptions: {
          input: {
            pet: resolve(__dirname, 'src/app/renderer/pet/index.html'),
            settings: resolve(__dirname, 'src/app/renderer/settings/index.html'),
          },
        },
      },
    },
  };
});
