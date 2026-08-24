/**
 * File-based memory store provider.
 *
 * Persists memories as JSON in the harness home directory. Keyword-based
 * retrieval with recency and importance weighting.
 *
 * @module @deepseek-ai/dsh-memory-file
 */

import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { FileMemoryStore } from './store.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'memory-file'

/** The memory service must be registered before this provider. */
export const inject = ['memory']

/** Provider configuration. */
export interface Config {
  /** Directory for the memories.json file. Defaults to `<cwd>/memory`. */
  path?: string
  /** Maximum number of stored memories (oldest low-importance pruned first). */
  maxMemories?: number
}

/** Schemastery validation for {@link Config}. */
export const Config: z<Config> = z.object({
  path: z.string(),
  maxMemories: z.number(),
})

/**
 * Register the file-based memory store as the `ctx.memory` implementation.
 * @param ctx - plugin context; `ctx.memory` must already be claimed by the definition.
 * @param config - storage path and capacity configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const dir = config.path ?? 'memory'
  const maxMemories = config.maxMemories ?? 500
  const store = new FileMemoryStore(ctx, dir, maxMemories)
  // The store loads asynchronously; schedule the load immediately.
  // The agent integration waits for the store to be ready before use.
  void store.load()
}

export default apply
