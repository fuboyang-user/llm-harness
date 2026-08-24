/**
 * Keyword extraction utilities for the memory agent.
 *
 * Simple tokenization-based keyword extraction with stopword removal.
 *
 * @module @deepseek-ai/dsh-memory-agent/keywords
 */

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
