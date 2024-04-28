/* eslint-disable no-var */
/* eslint-disable vars-on-top */
declare global {

  interface ServerContext { }
  interface ServerClientContext { }

  type StartNavigation = (
    location: string,
    controller: AbortController,
    callback: (
      completeNavigation: (payload: ServerPayload) => void,
      aborted: () => boolean,
    ) => Promise<void>,
  ) => Promise<void>

  var __navigationContext: React.Context<Navigation>
  var __asyncLocalStorage: AsyncLocalStorage<RouterContext>
  var __diy_server_manifest__: {
    resolveClientReferenceMetadata: (clientReference: {
      $$id: string
    }) => [string, string]
    resolveServerReference: (id: string) => {
      preloadModule: () => Promise<void>
      requireModule: () => unknown
    }
  }
  var __diy_client_manifest__: {
    _cache?: Map<string, unknown>
    resolveClientReference: ([id, exportName]: [string, string]) => {
      preloadModule: () => Promise<void>
      requireModule: () => unknown
    }
  }

  var __startNavigation: StartNavigation
  var __callServer: typeof callServer
}

export { }
