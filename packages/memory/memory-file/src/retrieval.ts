/**
 * Keyword-based memory retrieval scoring.
 *
 * Score = keywordOverlap * 0.5 + recency * 0.3 + importance * 0.2
 *
 * - keywordOverlap: Jaccard similarity between query and memory keyword sets
 * - recency: exponential decay based on hours since last access
 * - importance: normalized 0–1 weight
 *
 * @module @deepseek-ai/dsh-memory-file/retrieval
 */

import type { Memory } from '@deepseek-ai/dsh-memory'

/** Common English stopwords excluded from keyword extraction. */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'under', 'again',
  'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
  'how', 'all', 'both', 'each', 'few', 'more', 'most', 'other', 'some',
  'such', 'no', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
  'very', 'just', 'because', 'but', 'and', 'or', 'if', 'while', 'about',
  'that', 'this', 'it', 'its', 'i', 'me', 'my', 'we', 'our', 'you',
  'your', 'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their',
  'what', 'which', 'who', 'whom', 'these', 'those', 'am', 'up', 'out',
])

/**
 * Extract keywords from text by tokenizing, lowercasing, removing stopwords
 * and short tokens.
 * @param text - input text.
 * @returns deduplicated lowercase keywords.
 */
export function extractKeywords(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(token => token.length > 2 && !STOPWORDS.has(token))
  return [...new Set(tokens)]
}

/**
 * Compute Jaccard similarity between two keyword sets.
 * @param a - first set.
 * @param b - second set.
 * @returns 0–1 overlap score.
 */
function jaccardSimilarity(a: readonly string[], b: readonly string[]): number {
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

/**
 * Compute recency score using exponential decay.
 * @param lastAccessedAt - ISO timestamp of last access.
 * @param halfLifeHours - hours at which score halves (default 24).
 * @returns 0–1 recency score.
 */
function recencyScore(lastAccessedAt: string, halfLifeHours = 24): number {
  const elapsed = Date.now() - new Date(lastAccessedAt).getTime()
  const elapsedHours = Math.max(0, elapsed / 3_600_000)
  return Math.pow(0.5, elapsedHours / halfLifeHours)
}

/**
 * Score one memory against a query.
 * @param memory - stored memory.
 * @param queryKeywords - query keywords.
 * @returns composite score 0–1.
 */
export function scoreMemory(memory: Memory, queryKeywords: readonly string[]): number {
  const keywordOverlap = jaccardSimilarity(queryKeywords, memory.keywords)
  const recency = recencyScore(memory.lastAccessedAt)
  const importance = memory.importance
  return keywordOverlap * 0.5 + recency * 0.3 + importance * 0.2
}

/**
 * Rank memories by relevance to the query keywords.
 * @param memories - all stored memories.
 * @param queryKeywords - query keywords.
 * @param limit - maximum results.
 * @returns top-K memories sorted by score descending.
 */
export function rankMemories(
  memories: readonly Memory[],
  queryKeywords: readonly string[],
  limit: number,
): Memory[] {
  const scored = memories
    .map(memory => ({ memory, score: scoreMemory(memory, queryKeywords) }))
    .filter(entry => entry.score > 0.01)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
  return scored.map(entry => entry.memory)
}
