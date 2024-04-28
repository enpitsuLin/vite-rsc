import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import unocss from 'unocss/vite'

import {
  reactServerPlugin,
} from '@vite-rsc/plugin'

import packageJSON from './package.json' assert { type: 'json' }

export default defineConfig({
  environments: {
    client: {
      build: {
        outDir: 'dist/browser',
        rollupOptions: {
          input: {
            index: '/src/entry-client.tsx',
          },
          plugins: [
            visualizer({
              template: 'flamegraph',
              filename: '.stats/client.html',
            }),
          ],
        },
      },
    },
    ssr: {
      build: {
        outDir: 'dist/prerender',
        rollupOptions: {
          input: {
            index: '/src/entry-prerender.tsx',
          },
          plugins: [
            visualizer({
              template: 'flamegraph',
              filename: '.stats/ssr.html',
            }),
          ],
        },
      },
      resolve: {
        noExternal: packageJSON.bundlePrerender,
      },
    },
    server: {
      build: {
        outDir: 'dist/server',
        rollupOptions: {
          input: {
            index: '/src/entry-server.tsx',
          },
          plugins: [
            visualizer({
              template: 'flamegraph',
              filename: '.stats/server.html',
            }),
          ],
        },
      },
      dev: {
        optimizeDeps: {
          exclude: ['@conform-to/zod'],
        },
      },
      resolve: {
        external: packageJSON.doNotBundleServer,
      },
    },
  },
  plugins: [
    tsconfigPaths(),
    react(),
    reactServerPlugin(),
    unocss(),
  ],
})
