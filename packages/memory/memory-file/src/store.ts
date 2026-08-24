/**
 * File-based memory store implementation.
 *
 * Persists memories as JSON in `<path>/memories.json`. Loads all memories into
 * memory on init; write-through flush after each mutation.
 *
 * @module @deepseek-ai/dsh-memory-file/store
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { MemoryStore, MemoryId } from '@deepseek-ai/dsh-memory'
import type { Memory, MemoryInput, MemoryQuery, ConsolidationStats } from '@deepseek-ai/dsh-memory'
import { rankMemories } from './retrieval.ts'

/** Serialized form of a memory in the JSON file. */
interface SerializedMemory {
  id: string
  kind: string
  content: string
  keywords: string[]
  source: { sessionId: string; turn: number | undefined }
  importance: number
  createdAt: string
  lastAccessedAt: string
  accessCount: number
  tags: string[]
}

/** Maximum age (ms) for pruning: 30 days. */
const PRUNE_AGE_MS = 30 * 24 * 60 * 60 * 1000

/**
 * File-backed memory store. Loads all memories from disk on construction and
 * flushes after each mutation.
 */
export class FileMemoryStore extends MemoryStore {
  private memories: Memory[] = []
  private readonly filePath: string
  private readonly maxMemories: number
  private flushPromise: Promise<void> = Promise.resolve()

  /**
   * Create one file-backed store.
   * @param ctx - Cordis context (passed to Service superclass).
   * @param dir - directory for the memories.json file.
   * @param maxMemories - hard cap on stored memories (oldest pruned first).
   */
  constructor(ctx: import('@deepseek-ai/cordis').Context, dir: string, maxMemories: number) {
    super(ctx)
    this.filePath = join(dir, 'memories.json')
    this.maxMemories = maxMemories
  }

  /** Load persisted memories from disk. Call once after construction. */
  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed: SerializedMemory[] = JSON.parse(raw)
      this.memories = parsed.map(m => ({
        id: MemoryId(m.id),
        kind: m.kind as Memory['kind'],
        content: m.content,
        keywords: m.keywords,
        source: { sessionId: m.source.sessionId as import('@deepseek-ai/dsh-session').SessionId, ...(m.source.turn === undefined ? {} : { turn: m.source.turn }) },
        importance: m.importance,
        createdAt: m.createdAt,
        lastAccessedAt: m.lastAccessedAt,
        accessCount: m.accessCount,
        tags: m.tags,
      }))
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      // File doesn't exist yet — start with empty store.
    }
  }

  override store(input: MemoryInput): Memory {
    const now = new Date().toISOString()
    const memory: Memory = {
      id: MemoryId(randomUUID()),
      kind: input.kind,
      content: input.content,
      keywords: [...input.keywords],
      source: input.source,
      importance: input.importance ?? 0.5,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
      tags: input.tags ? [...input.tags] : [],
    }
    this.memories.push(memory)
    // Enforce capacity: drop oldest low-importance memories.
    if (this.memories.length > this.maxMemories) {
      this.memories.sort((a, b) => b.importance - a.importance || a.createdAt.localeCompare(b.createdAt))
      this.memories.length = this.maxMemories
    }
    this.scheduleFlush()
    return memory
  }

  override async recall(query: MemoryQuery): Promise<Memory[]> {
    let candidates = this.memories
    if (query.kind !== undefined) {
      candidates = candidates.filter(m => m.kind === query.kind)
    }
    const minImportance = query.minImportance
    if (minImportance !== undefined) {
      candidates = candidates.filter(m => m.importance >= minImportance)
    }
    const keywords = query.keywords ?? []
    const limit = query.limit ?? 5
    const ranked = keywords.length > 0
      ? rankMemories(candidates, keywords, limit)
      : // No keywords: return most recent + important.
      [...candidates]
        .sort((a, b) => b.importance - a.importance || b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)

    // Update access metadata for returned memories.
    const now = new Date().toISOString()
    for (const memory of ranked) {
      memory.lastAccessedAt = now
      memory.accessCount++
    }
    if (ranked.length > 0) this.scheduleFlush()
    return ranked
  }

  override forget(id: import('@deepseek-ai/dsh-memory').MemoryId): boolean {
    const index = this.memories.findIndex(m => m.id === id)
    if (index < 0) return false
    this.memories.splice(index, 1)
    this.scheduleFlush()
    return true
  }

  override list(): readonly Memory[] {
    return this.memories
  }

  override async consolidate(signal: AbortSignal): Promise<ConsolidationStats> {
    const now = Date.now()
    let merged = 0
    let pruned = 0

    // Phase 1: Prune old, never-accessed, low-importance memories.
    const before = this.memories.length
    this.memories = this.memories.filter((m) => {
      if (signal.aborted) return true
      const age = now - new Date(m.createdAt).getTime()
      return !(age > PRUNE_AGE_MS && m.accessCount === 0 && m.importance < 0.3)
    })
    pruned = before - this.memories.length

    // Phase 2: Merge memories with >70% keyword overlap.
    if (!signal.aborted && this.memories.length > 1) {
      const toRemove = new Set<number>()
      for (let i = 0; i < this.memories.length && !signal.aborted; i++) {
        if (toRemove.has(i)) continue
        const keeper = this.memories[i]
        if (!keeper) continue
        for (let j = i + 1; j < this.memories.length && !signal.aborted; j++) {
          if (toRemove.has(j)) continue
          const absorbed = this.memories[j]
          if (!absorbed) continue
          const overlap = keywordOverlap(keeper.keywords, absorbed.keywords)
          if (overlap > 0.7) {
            // Merge j into i: keep higher importance, combine content.
            const mergedContent = keeper.importance >= absorbed.importance
              ? `${keeper.content}\nAlso: ${absorbed.content}`
              : `${absorbed.content}\nAlso: ${keeper.content}`
            const mergedImportance = Math.max(keeper.importance, absorbed.importance)
            const mergedKeywords = [...new Set([...keeper.keywords, ...absorbed.keywords])]
            this.memories[i] = {
              ...keeper,
              content: mergedContent.slice(0, 2000),
              importance: Math.min(1, mergedImportance * 1.1),
              keywords: mergedKeywords,
            }
            toRemove.add(j)
            merged++
          }
        }
      }
      if (toRemove.size > 0) {
        this.memories = this.memories.filter((_, i) => !toRemove.has(i))
      }
    }

    // Phase 3: Boost frequently accessed memories.
    for (const mem of this.memories) {
      if (mem.accessCount > 3 && mem.importance < 0.9) {
        ;(mem as { importance: number }).importance = Math.min(1, mem.importance + 0.05)
      }
    }

    this.scheduleFlush()
    return { merged, pruned, retained: this.memories.length }
  }

  /** Schedule a debounced flush to disk. */
  private scheduleFlush(): void {
    this.flushPromise = this.flushPromise.then(() => this.flush())
  }

  /** Write current memories to disk. */
  private async flush(): Promise<void> {
    const serialized: SerializedMemory[] = this.memories.map(m => ({
      id: m.id,
      kind: m.kind,
      content: m.content,
      keywords: [...m.keywords],
      source: { sessionId: m.source.sessionId, turn: m.source.turn },
      importance: m.importance,
      createdAt: m.createdAt,
      lastAccessedAt: m.lastAccessedAt,
      accessCount: m.accessCount,
      tags: [...m.tags],
    }))
    const dir = join(this.filePath, '..')
    await mkdir(dir, { recursive: true })
    await writeFile(this.filePath, JSON.stringify(serialized, null, 2), 'utf8')
  }
}

/**
 * Compute Jaccard overlap between two keyword arrays.
 * @param a - first keyword list.
 * @param b - second keyword list.
 * @returns 0–1 overlap ratio.
 */
function keywordOverlap(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 0
  const setA = new Set(a.map(k => k.toLowerCase()))
  const setB = new Set(b.map(k => k.toLowerCase()))
  let intersection = 0
  for (const k of setA) {
    if (setB.has(k)) intersection++
  }
  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}
