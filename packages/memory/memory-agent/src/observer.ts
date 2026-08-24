/**
 * Memory capture observer.
 *
 * Listens to session events to extract memories automatically after each turn.
 * Examines tool results and errors to create episodic memories.
 *
 * @module @deepseek-ai/dsh-memory-agent/observer
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { MemoryStore } from '@deepseek-ai/dsh-memory'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { extractKeywords } from './keywords.ts'

/**
 * Register the turn-stopping observer on the given context.
 * @param ctx - plugin context with `ctx.memory` available.
 */
export function registerObserver(ctx: Context): void {
  ctx.on('agent/turn-stopping', async (
    { agent, turn }: { agent: Agent; turn: number; signal: AbortSignal },
  ): Promise<void> => {
    captureFromTurn(ctx, agent, turn)
  })
}

/**
 * Extract memories from one completed turn.
 * @param ctx - plugin context.
 * @param agent - the agent that completed the turn.
 * @param turn - the turn number.
 */
function captureFromTurn(ctx: Context, agent: Agent, turn: number): void {
  const memory = ctx.memory as MemoryStore
  const sessionId = agent.session.id as SessionId
  const events = agent.session.events

  // Build a map of callId -> tool name from tool/call events in this turn.
  const toolNames = new Map<string, string>()
  for (const event of events) {
    if (event.type === 'tool/call' && event.data.turn === turn) {
      toolNames.set(event.data.callId, event.data.name)
    }
  }

  // Examine tool results for errors.
  for (const event of events) {
    if (event.type !== 'tool/result' || event.data.turn !== turn) continue
    if (!event.data.error) continue

    const callId = event.data.message.source.kind === 'tool'
      ? event.data.message.source.callId
      : undefined
    const toolName = callId ? (toolNames.get(callId) ?? 'unknown') : 'unknown'
    const errorCode = event.data.error.code
    const errorName = event.data.error.name
    const content = `Tool "${toolName}" failed with ${errorName}/${errorCode}`
    const keywords = extractKeywords(`${toolName} ${errorName} ${errorCode}`)

    if (keywords.length === 0) continue

    memory.store({
      kind: 'episodic',
      content,
      keywords,
      source: { sessionId, turn },
      importance: 0.6,
      tags: ['tool-error', toolName],
    })
  }
}
