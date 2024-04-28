import { REDIRECT_SYMBOL, asyncLocalStorage } from './router/server.js'

export {
  createHandler,
  createRoutes,
  runRoutes,
  runWithContext,
} from './router/server.js'
export type {
  MiddlewareContext,
  MiddlewareFunction,
  RouteConfig,
  RouteModule,
  RouterContext,
  ServerPayload,
} from './router/server.js'

export function get<Key extends keyof ServerContext>(
  key: Key,
  truthy: true,
): NonNullable<ServerContext[Key]>
export function get<Key extends keyof ServerContext>(
  key: Key,
  truthy?: false,
): undefined | ServerContext[Key]
export function get<Key extends keyof ServerContext>(
  ...args: [key: Key, truthy?: boolean]
): undefined | ServerContext[Key] {
  const truthy = arguments.length === 2 ? args[1] : false
  const context = asyncLocalStorage.getStore()
  if (!context)
    throw new Error('No context')
  if (truthy)
    return context.get(args[0], truthy)
  return context.get(args[0], truthy)
}

export function set<Key extends keyof ServerContext>(
  key: Key,
  value: ServerContext[Key],
) {
  const context = asyncLocalStorage.getStore()
  if (!context)
    throw new Error('No context')
  context.set(key, value)
}

export function setClient<Key extends keyof ServerClientContext>(
  key: Key,
  value: ServerClientContext[Key],
) {
  const context = asyncLocalStorage.getStore()
  if (!context)
    throw new Error('No context')
  context.setClient(key, value)
}

export function getAction<T>(
  action: T,
  // biome-ignore lint/suspicious/noExplicitAny: needed for type inference
): T extends (...args: any) => infer R
    ? { ran: boolean, result: Awaited<R> }
    : { ran: boolean, result: unknown } {
  const context = asyncLocalStorage.getStore()
  if (!context)
    throw new Error('No context')
  const actionRef = action as { $$id?: string }
  const id = actionRef.$$id
  if (!id)
    throw new Error('Invalid action reference')
  if (context.action && context.action.actionId === id) {
    // biome-ignore lint/suspicious/noExplicitAny: needed for type inference
    return { ran: true, result: context.action.returnValue } as any
  }
  // biome-ignore lint/suspicious/noExplicitAny: needed for type inference
  return { ran: false, result: undefined } as any
}

export function getSetHeaders(): Headers {
  const context = asyncLocalStorage.getStore()
  if (!context)
    throw new Error('No context')
  return context.setHeaders
}

export function actionRedirects(to: string): never {
  const context = asyncLocalStorage.getStore()
  if (!context)
    throw new Error('No context')

  context.redirect = to
  throw REDIRECT_SYMBOL
}

export function getURL() {
  const context = asyncLocalStorage.getStore()
  if (!context)
    throw new Error('No context')
  return new URL(context.request.url)
}
