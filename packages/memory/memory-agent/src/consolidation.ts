/**
 * Memory consolidation during agent maintenance.
 *
 * Periodically runs consolidation passes to merge related memories, prune
 * stale ones, and boost frequently accessed ones.
 *
 * @module @deepseek-ai/dsh-memory-agent/consolidation
 */

import type { Context } from '@deepseek-ai/cordis'
import type { MemoryStore } from '@deepseek-ai/dsh-memory'

/** Minimum interval between consolidation runs (5 minutes). */
const CONSOLIDATION_INTERVAL_MS = 5 * 60 * 1000

/**
 * Register the consolidation scheduler on the given context.
 *
 * Consolidation runs during agent maintenance windows. The scheduler tracks
 * the last run time and skips if the interval hasn't elapsed.
 *
 * @param ctx - plugin context with `ctx.memory` available.
 */
export function registerConsolidation(ctx: Context): void {
  let lastConsolidation = 0

  ctx.on('agent/status', ({ agent, status }) => {
    if (status !== 'idle') return
    const now = Date.now()
    if (now - lastConsolidation < CONSOLIDATION_INTERVAL_MS) return
    lastConsolidation = now

    const memory = ctx.memory as MemoryStore
    // Use the agent's maintenance channel for consolidation work.
    agent.runMaintenance(async (signal) => {
      await memory.consolidate(signal)
    }).catch(() => {
      // Consolidation failures are non-fatal; the next idle window retries.
    })
  })
}
