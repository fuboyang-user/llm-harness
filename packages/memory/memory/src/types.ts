/**
 * Core memory types for the cognitive memory system.
 *
 * Three memory kinds mirror the cognitive psychology taxonomy:
 * - **episodic**: specific events and experiences (what happened, when, outcome)
 * - **semantic**: extracted facts and knowledge (user preferences, project conventions)
 * - **procedural**: learned sequences of actions (how to accomplish a task)
 *
 * @module @deepseek-ai/dsh-memory/types
 */

import type { MemoryId } from './brand.ts'
import type { SessionId } from '@deepseek-ai/dsh-session'

/** The three memory kinds in the cognitive taxonomy. */
export type MemoryKind = 'episodic' | 'semantic' | 'procedural'

/**
 * One stored memory. Immutable after creation except for `lastAccessedAt` and
 * `accessCount`, which the retrieval path updates.
 */
export interface Memory {
  /** Unique identity. */
  readonly id: MemoryId
  /** Memory kind (episodic, semantic, procedural). */
  readonly kind: MemoryKind
  /** The memory content — a concise, self-describing statement. */
  readonly content: string
  /** Keywords for retrieval scoring. */
  readonly keywords: readonly string[]
  /** The session (and optional turn) that produced this memory. */
  readonly source: {
    readonly sessionId: SessionId
    readonly turn?: number
  }
  /** Importance weight (0–1); set at creation, boosted by consolidation. */
  readonly importance: number
  /** ISO 8601 creation timestamp. */
  readonly createdAt: string
  /** ISO 8601 timestamp of the most recent retrieval hit. */
  lastAccessedAt: string
  /** Number of times this memory was returned by a recall query. */
  accessCount: number
  /** Free-form tags for grouping (e.g. project name, tool name). */
  readonly tags: readonly string[]
}

/** Input for storing a new memory; the store assigns `id` and timestamps. */
export interface MemoryInput {
  readonly kind: MemoryKind
  readonly content: string
  readonly keywords: readonly string[]
  readonly source: {
    readonly sessionId: SessionId
    readonly turn?: number
  }
  readonly importance?: number
  readonly tags?: readonly string[]
}

/** Query parameters for memory retrieval. */
export interface MemoryQuery {
  /** Keywords to match against stored memory keywords. */
  readonly keywords?: readonly string[]
  /** Filter to one memory kind. */
  readonly kind?: MemoryKind
  /** Maximum results to return (default 5). */
  readonly limit?: number
  /** Minimum importance threshold. */
  readonly minImportance?: number
}

/** Result of a consolidation pass. */
export interface ConsolidationStats {
  /** Number of memories merged into others. */
  readonly merged: number
  /** Number of memories pruned for staleness. */
  readonly pruned: number
  /** Number of memories retained. */
  readonly retained: number
}
