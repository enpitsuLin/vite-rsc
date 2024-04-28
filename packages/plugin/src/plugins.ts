import react from '@vitejs/plugin-react'
import { rscClientPlugin, rscServerPlugin } from 'unplugin-rsc'
import type { Plugin, PluginOption } from 'vite'
import { devHash, getTransformHookHandler, prodHash } from './utils.js'
import { reactServerDevServer } from './dev-plugins.js'

export function virtualModulePlugin(): Plugin {
  let devBase: string
  let browserEntry: string
  return {
    name: 'react-server:virtual-module',
    enforce: 'post',
    configEnvironment(name, config) {
      if (name === 'client') {
        browserEntry = (
          config.build?.rollupOptions?.input as Record<string, string>
        )?.index
      }
    },
    configResolved(config) {
      devBase = config.base
    },
    resolveId(source) {
      if (
        source === 'virtual:client-references'
        || source === 'virtual:server-references'
        || source === 'virtual:browser-entry'
        || source === 'virtual:react-preamble'
      )
        return `\0${source}`
    },
    load(id) {
      const hash = this.environment?.mode === 'dev' ? devHash : prodHash
      if (id === '\0virtual:client-references') {
        const modulesCode = Array.from(
          clientModules,
          (clientModule) => {
            return `${JSON.stringify(hash(clientModule, 'use client'))}: () => import(${JSON.stringify(clientModule)}),`
          },
        )
          .join('')
        return `export default {${modulesCode}\};`
      }

      if (id === '\0virtual:server-references') {
        let result = 'export default {'
        for (const serverModule of serverModules) {
          result += `${JSON.stringify(
            hash(serverModule, 'use server'),
          )}: () => import(${JSON.stringify(serverModule)}),`
        }
        return `${result}\};`
      }

      if (id === '\0virtual:browser-entry') {
        return `
          import "virtual:react-preamble";
          import ${JSON.stringify(browserEntry)};
        `
      }

      if (id === '\0virtual:react-preamble')
        return react.preambleCode.replace('__BASE__', devBase)
    },
  }
}

export function configureAppBuilder(): PluginOption {
  return {
    name: 'react-server:configure-builder',
    config(config) {
      config.builder = {
        async buildApp(builder) {
          async function doBuildRecursive() {
            const ogServerModulesCount = serverModules.size
            await builder.build(builder.environments.server)
            let serverNeedsRebuild = serverModules.size > ogServerModulesCount

            await Promise.all([
              builder.build(builder.environments.ssr),
              builder.build(builder.environments.client),
            ])
            if (serverModules.size > ogServerModulesCount)
              serverNeedsRebuild = true

            if (serverNeedsRebuild)
              await doBuildRecursive()
          }
          await doBuildRecursive()
        },
      }
      return config
    },
  }
}

export function reactServerPlugin(): PluginOption {
  const serverPlugin: Plugin = {
    name: 'react-server',
    configEnvironment(name, env) {
      let ssr = false
      let manifest = false
      const input: Record<string, string> = {}
      let dev: (typeof env)['dev']
      let resolve: (typeof env)['resolve']

      switch (name) {
        case 'client':
          ssr = false
          input['_client-references'] = 'virtual:client-references'
          manifest = true
          break
        case 'ssr':
          ssr = true
          input['_client-references'] = 'virtual:client-references'
          dev = {
            optimizeDeps: {
              include: ['@vite-rsc/framework/client'],
            },
          }
          resolve = {
            noExternal: ['react-server-dom-diy/client'],
          }
          break
        case 'server':
          ssr = true
          input['_server-references'] = 'virtual:server-references'
          dev = {
            optimizeDeps: {
              include: [
                'react',
                'react/jsx-runtime',
                'react/jsx-dev-runtime',
                'react-server-dom-diy/server',
              ],
              extensions: ['.tsx', '.ts', '...'],
            },
          }
          resolve = {
            externalConditions: ['react-server', '...'],
            conditions: ['react-server', '...'],
            noExternal: true,
          }
          break
      }

      return {
        build: {
          ssr,
          manifest,
          emitAssets: !ssr,
          copyPublicDir: !ssr,
          rollupOptions: {
            preserveEntrySignatures: 'exports-only',
            input,
          },
        },
        dev,
        resolve,
      }
    },
    transform(...args) {
      const hash = this.environment?.mode === 'dev' ? devHash : prodHash

      const clientPlugin = rscClientPlugin.vite({
        include: ['**/*'],
        transformModuleId: hash,
        useServerRuntime: {
          function: 'createServerReference',
          module: '@vite-rsc/framework/runtime.client',
        },
        onModuleFound(id, type) {
          switch (type) {
            case 'use server':
              serverModules.add(id)
              break
          }
        },
      }) as Plugin
      const prerenderPlugin = rscClientPlugin.vite({
        include: ['**/*'],
        transformModuleId: hash,
        useServerRuntime: {
          function: 'createServerReference',
          module: '@vite-rsc/framework/runtime.client',
        },
        onModuleFound(id, type) {
          switch (type) {
            case 'use server':
              serverModules.add(id)
              break
          }
        },
      }) as Plugin
      const serverPlugin = rscServerPlugin.vite({
        include: ['**/*'],
        transformModuleId: hash,
        useClientRuntime: {
          function: 'registerClientReference',
          module: 'react-server-dom-diy/server',
        },
        useServerRuntime: {
          function: 'registerServerReference',
          module: 'react-server-dom-diy/server',
        },
        onModuleFound(id, type) {
          switch (type) {
            case 'use client':
              clientModules.add(id)
              break
            case 'use server':
              serverModules.add(id)
              break
          }
        },
      }) as Plugin

      if (this.environment?.name === 'server')
        return getTransformHookHandler(serverPlugin.transform).apply(this, args)

      if (this.environment?.name === 'ssr')
        return getTransformHookHandler(prerenderPlugin.transform).apply(this, args)

      return getTransformHookHandler(clientPlugin.transform).apply(this, args)
    },
  }

  return [
    serverPlugin,
    virtualModulePlugin(),
    configureAppBuilder(),
    reactServerDevServer(),
  ]
}
