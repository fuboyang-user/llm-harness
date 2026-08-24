/**
 * Memory Service Definition (`ctx.memory`): providers decide how to store,
 * retrieve, and consolidate agent memories. The cognitive memory system gives
 * the agent persistent learning across sessions — it captures experience from
 * interactions, recalls relevant knowledge before each step, and consolidates
 * related memories over time.
 *
 * Follows the capability seam pattern: this package owns the Service Definition
 * (abstract class + types); providers implement the storage backend.
 *
 * @module @deepseek-ai/dsh-memory
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { Memory, MemoryInput, MemoryQuery, ConsolidationStats } from './types.ts'

export { MemoryId } from './brand.ts'
export type { MemoryId as MemoryIdType } from './brand.ts'
export type {
  Memory,
  MemoryInput,
  MemoryKind,
  MemoryQuery,
  ConsolidationStats,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    memory: MemoryStore
  }
}

/**
 * Abstract memory store service. Implementations own persistence, retrieval
 * scoring, and consolidation strategy. Load one implementation per context as
 * `ctx.memory`.
 *
 * The store is intentionally synchronous for `store` and `forget` (hot-path
 * operations that must not block the agent loop); `recall` is async to allow
 * providers to perform I/O (e.g. vector search). `consolidate` is async
 * because it may rewrite the backing store.
 */
export abstract class MemoryStore extends Service {
  constructor(ctx: Context) {
    super(ctx, 'memory')
  }

  /**
   * Store one new memory. Synchronous — the implementation buffers writes and
   * flushes asynchronously. Returns the stored memory with assigned id and
   * timestamps.
   * @param input - memory content and metadata.
   * @returns the stored memory.
   */
  abstract store(input: MemoryInput): Memory

  /**
   * Retrieve memories matching the query. Implementations score by keyword
   * overlap, recency, and importance, returning the top-K results.
   * @param query - keywords, kind filter, and limit.
   * @returns matching memories sorted by relevance descending.
   */
  abstract recall(query: MemoryQuery): Promise<Memory[]>

  /**
   * Remove one memory by identity. Synchronous.
   * @param id - memory to forget.
   * @returns whether the memory existed and was removed.
   */
  abstract forget(id: import('./brand.ts').MemoryId): boolean

  /**
   * List all stored memories. Read-only snapshot.
   * @returns all memories in storage order.
   */
  abstract list(): readonly Memory[]

  /**
   * Consolidate the memory store: merge related memories, prune stale ones,
   * and boost frequently accessed ones. Called during agent maintenance.
   * @param signal - cancellation signal.
   * @returns consolidation statistics.
   */
  abstract consolidate(signal: AbortSignal): Promise<ConsolidationStats>
}

export default MemoryStore
