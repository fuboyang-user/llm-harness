/**
 * Memory injection into agent steps.
 *
 * Hooks `agent/pre-step` (prepend) to recall relevant memories and inject
 * them as context before each model request. Follows the same pattern as
 * `time-context`.
 *
 * @module @deepseek-ai/dsh-memory-agent/injector
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import type { MemoryStore } from '@deepseek-ai/dsh-memory'
import { extractKeywords } from './keywords.ts'

/** Plugin name for source attribution. */
const PLUGIN_NAME = 'memory-agent'

/** Maximum memories to inject per step. */
const MAX_MEMORIES = 5

/**
 * Register the pre-step injector on the given context.
 * @param ctx - plugin context with `ctx.memory` available.
 */
export function registerInjector(ctx: Context): void {
  ctx.on('agent/pre-step', async (
    { agent, turn, signal },
    next,
  ): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted) return decision

    const memory = ctx.memory as MemoryStore
    const keywords = extractKeywordsFromContext(agent)
    if (keywords.length === 0) return decision

    const memories = await memory.recall({ keywords, limit: MAX_MEMORIES })
    if (memories.length === 0 || signal.aborted) return decision

    const text = formatMemories(memories, turn)
    return {
      kind: 'enter',
      messages: [
        ...decision.messages,
        createUserMessage({
          content: [{ type: 'text', text }],
          source: { kind: 'plugin', plugin: PLUGIN_NAME, form: 'snapshot', sections: [{ name: PLUGIN_NAME, text }] },
        }),
      ],
    }
  }, { prepend: true })
}

/**
 * Extract keywords from the agent's current context (user messages + recent events).
 * @param agent - the active agent.
 * @returns extracted keywords.
 */
function extractKeywordsFromContext(agent: Agent): string[] {
  const texts: string[] = []

  // Extract from the last few user messages.
  const events = agent.session.events
  let userMessagesFound = 0
  for (let i = events.length - 1; i >= 0 && userMessagesFound < 3; i--) {
    const event = events[i]
    if (!event) continue
    if (event.type === 'user/message') {
      const data = event.data as UserMessage
      for (const block of data.content) {
        if (block.type === 'text') {
          texts.push(block.text)
          userMessagesFound++
        }
      }
    }
  }

  return extractKeywords(texts.join(' '))
}

/**
 * Format recalled memories as a context section.
 * @param memories - recalled memories.
 * @param turn - current turn number.
 * @returns formatted text for injection.
 */
function formatMemories(
  memories: import('@deepseek-ai/dsh-memory').Memory[],
  turn: number,
): string {
  const lines = memories.map((m) => {
    const age = formatAge(m.lastAccessedAt)
    return `- [${m.kind}] "${m.content}" (${age})`
  })
  return `<memories context="turn-${turn}">\n${lines.join('\n')}\n</memories>`
}

/**
 * Format a relative age string from an ISO timestamp.
 * @param iso - ISO 8601 timestamp.
 * @returns human-readable age.
 */
function formatAge(iso: string): string {
  const elapsed = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
