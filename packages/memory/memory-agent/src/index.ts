/**
 * Memory agent integration consumer.
 *
 * Wires the cognitive memory system into the agent lifecycle:
 * - Observer: captures memories from turn outcomes (tool errors, etc.)
 * - Injector: recalls relevant memories before each step
 * - Consolidation: maintains the memory store during idle periods
 *
 * @module @deepseek-ai/dsh-memory-agent
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { registerObserver } from './observer.ts'
import { registerInjector } from './injector.ts'
import { registerConsolidation } from './consolidation.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'memory-agent'

/** The agent registry and memory service must be registered before this plugin. */
export const inject = ['agents', 'memory']

/** Consumer configuration. */
export interface Config {
  /** Enable automatic memory capture from turn outcomes (default true). */
  capture?: boolean
  /** Enable memory injection before each step (default true). */
  inject?: boolean
  /** Enable automatic consolidation during idle (default true). */
  consolidate?: boolean
}

/** Schemastery validation for {@link Config}. */
export const Config: z<Config> = z.object({
  capture: z.boolean(),
  inject: z.boolean(),
  consolidate: z.boolean(),
})

/**
 * Register memory agent integration on the given context.
 * @param ctx - plugin context.
 * @param config - feature toggles.
 */
export function apply(ctx: Context, config: Config): void {
  if (config.capture !== false) registerObserver(ctx)
  if (config.inject !== false) registerInjector(ctx)
  if (config.consolidate !== false) registerConsolidation(ctx)
}

export default apply
