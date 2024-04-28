import path from 'node:path'
import process from 'node:process'
import type { DevEnvironment, Plugin, ResolvedConfig } from 'vite'
import { createNodeDevEnvironment, createServerModuleRunner, loadEnv } from 'vite'

interface DevServerOptions {
  createPrerenderEnvironment?: (
    name: string,
    config: ResolvedConfig,
  ) => DevEnvironment | Promise<DevEnvironment>
  createServerEnvironment: (
    name: string,
    config: ResolvedConfig,
  ) => DevEnvironment | Promise<DevEnvironment>
}

export function reactServerDevServer({
  createPrerenderEnvironment,
  createServerEnvironment,
}: DevServerOptions = { createServerEnvironment: createNodeDevEnvironment, createPrerenderEnvironment: createNodeDevEnvironment }): Plugin {
  const runners = {} as Record<
    'ssr' | 'server',
    ReturnType<typeof createServerModuleRunner>
  >

  type CachedPromise<T> = Promise<T> & {
    status: 'pending' | 'fulfilled' | 'rejected'
    value?: unknown
    reason?: unknown
  }
  const serverModulePromiseCache = new Map<string, CachedPromise<unknown>>()
  const clientModulePromiseCache = new Map<string, CachedPromise<unknown>>()

  return {
    name: 'hattip-rsc-dev-server',
    configEnvironment(name) {
      if (!['ssr', 'server'].includes(name))
        return null

      if (name === 'ssr') {
        return {
          dev: {
            createEnvironment: createPrerenderEnvironment,
          },
        }
      }
      else if (name === 'server') {
        return {
          dev: {
            createEnvironment: createServerEnvironment,
          },
        }
      }
    },
    config(_, env) {
      process.env = { ...process.env, ...loadEnv(env.mode, process.cwd(), '') }
    },
    async configureServer(server) {
      runners.ssr = createServerModuleRunner(server.environments.ssr)
      runners.server = createServerModuleRunner(server.environments.server)

      const prerenderInput = server.environments.ssr.options.build.rollupOptions
        .input as Record<string, string>
      const prerenderEntry = prerenderInput.index
      if (!prerenderEntry) {
        throw new Error(
          'No entry file found for ssr environment, please specify one in vite.config.ts under environments.ssr.build.rollupOptions.input.index',
        )
      }

      const serverInput = server.environments.server.options.build.rollupOptions
        .input as Record<string, string>
      const serverEntry = serverInput.index
      if (!serverEntry) {
        throw new Error(
          'No entry file found for server environment, please specify one in vite.config.ts under environments.server.build.rollupOptions.input.index',
        )
      }

      const { createMiddleware } = await import('@hattip/adapter-node')

      // @ts-expect-error - no types
      globalThis.__diy_server_manifest__ = {
        resolveClientReferenceMetadata(clientReference: { $$id: string }) {
          const id = clientReference.$$id
          const idx = id.lastIndexOf('#')
          const exportName = id.slice(idx + 1)
          const fullURL = id.slice(0, idx)
          return [fullURL, exportName]
        },
        resolveServerReference(_id: string) {
          const idx = _id.lastIndexOf('#')
          const exportName = _id.slice(idx + 1)
          const id = _id.slice(0, idx)
          return {
            preloadModule() {
              if (serverModulePromiseCache.has(id))
                return serverModulePromiseCache.get(id) as CachedPromise<void>

              const promise = runners.server
                .import(id)
                .then((mod) => {
                  promise.status = 'fulfilled'
                  promise.value = mod
                })
                .catch((res) => {
                  promise.status = 'rejected'
                  promise.reason = res
                  throw res
                }) as CachedPromise<void>
              promise.status = 'pending'
              serverModulePromiseCache.set(id, promise)
              return promise
            },
            requireModule() {
              const cached = serverModulePromiseCache.get(id)
              if (!cached)
                throw new Error(`Module ${id} not found`)
              if (cached.reason)
                throw cached.reason
              return (cached.value as Record<string, unknown>)[exportName]
            },
          }
        },
      }

      // @ts-expect-error - no types
      globalThis.__diy_client_manifest__ = {
        resolveClientReference([id, exportName]: [string, string]) {
          return {
            preloadModule() {
              if (clientModulePromiseCache.has(id))
                return clientModulePromiseCache.get(id) as CachedPromise<void>

              const promise = runners.ssr
                .import(id)
                .then((mod) => {
                  promise.status = 'fulfilled'
                  promise.value = mod
                })
                .catch((res) => {
                  promise.status = 'rejected'
                  promise.reason = res
                  throw res
                }) as CachedPromise<void>
              promise.status = 'pending'
              clientModulePromiseCache.set(id, promise)
              return promise
            },
            requireModule() {
              const cached = clientModulePromiseCache.get(id)
              if (!cached)
                throw new Error(`Module ${id} not found`)
              if (cached.reason)
                throw cached.reason
              return (cached.value as Record<string, unknown>)[exportName]
            },
          }
        },
      }

      return () => {
        server.middlewares.use(async (req, res, next) => {
          try {
            const { ssr: prerender, server } = runners

            const [prerenderMod, serverMod] = await Promise.all([
              prerender.import(prerenderEntry),
              server.import(serverEntry),
            ])

            const middleware = createMiddleware(
              (c) => {
                const callServer = (request: Request) => {
                  return serverMod.default({ ...c, request })
                }

                return prerenderMod.default(c, {
                  bootstrapModules: [
                    '/@vite/client',
                    '/@id/virtual:browser-entry',
                  ],
                  bootstrapScriptContent: `
                    window.__diy_client_manifest__ = {
                      _cache: new Map(),
                      resolveClientReference([id, exportName]) {
                        return {
                          preloadModule() {
                            if (window.__diy_client_manifest__._cache.has(id)) {
                              return window.__diy_client_manifest__._cache.get(id);
                            }
                            const promise = import(id)
                              .then((mod) => {
                                promise.status = "fulfilled";
                                promise.value = mod;
                              })
                              .catch((res) => {
                                promise.status = "rejected";
                                promise.reason = res;
                                throw res;
                              });
                            promise.status = "pending";
                            window.__diy_client_manifest__._cache.set(id, promise);
                            return promise;
                          },
                          requireModule() {
                            const cached = window.__diy_client_manifest__._cache.get(id);
                            if (!cached) throw new Error(\`Module \${id} not found\`);
                            if (cached.reason) throw cached.reason;
                            return cached.value[exportName];
                          },
                        };
                      },
                    };
                  `,
                  callServer,
                })
              },
              {
                alwaysCallNext: false,
              },
            )

            if (req.originalUrl !== req.url)
              req.url = req.originalUrl

            await middleware(req, res, next)
          }
          catch (reason) {
            next(reason)
          }
        })
      }
    },
    hotUpdate(ctx) {
      const ids: string[] = []
      const cwd = process.cwd()
      for (const mod of ctx.modules) {
        if (mod.id) {
          ids.push(mod.id)
          const toDelete = `/${path.relative(cwd, mod.id)}`
          clientModulePromiseCache.delete(toDelete)
          serverModulePromiseCache.delete(toDelete)
        }
      }

      if (ids.length > 0) {
        switch (ctx.environment.name) {
          case 'server':
            for (const id of ids) {
              if (ctx.environment.moduleGraph.getModuleById(id))
                runners.server.moduleCache.invalidateDepTree([id])
            }
            break
          case 'ssr':
            for (const id of ids) {
              if (ctx.environment.moduleGraph.getModuleById(id))
                runners.ssr.moduleCache.invalidateDepTree([id])
            }
            break
        }
      }

      if (
        ctx.environment.name === 'client'
        && ids.some(
          id =>
            !!ctx.server.environments.server.moduleGraph.getModuleById(id),
        )
      ) {
        ctx.environment.hot.send('react-server:update', {
          ids,
        })
        return []
      }
    },
  }
}
