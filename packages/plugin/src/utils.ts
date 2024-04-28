import path from 'node:path'
import process from 'node:process'
import type { Plugin, TransformResult } from 'vite'

export function prodHash(str: string, _: 'use client' | 'use server') {
  return `/${path.relative(process.cwd(), str)}`
}
export function devHash(str: string, _: 'use client' | 'use server') {
  const resolved = path.resolve(str)
  let unixPath = resolved.replace(/\\/g, '/')
  if (!unixPath.startsWith('/'))
    unixPath = `/${unixPath}`

  if (resolved.startsWith(process.cwd()))
    return `/${path.relative(process.cwd(), unixPath)}`

  return `/@fs${unixPath}`
}

type TransformHandler = (code: string, id: string, options?: {
  /**
   * @deprecated use this.environment
   */
  ssr?: boolean
}) => Promise<TransformResult> | TransformResult

export function getTransformHookHandler(
  transform: Plugin['transform'],
) {
  if (!transform)
    throw new Error('Unexpected transform hook')
  if (typeof transform === 'function')
    return transform as TransformHandler
  else return transform.handler as TransformHandler
}
