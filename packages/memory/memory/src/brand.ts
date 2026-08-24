import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable identity for one stored memory. */
export type MemoryId = Branded<'MemoryId'>

/**
 * Brand a caller-minted memory identity.
 * @param id - opaque memory identity.
 * @returns the same string, branded; no validation is performed.
 */
export function MemoryId(id: string): MemoryId {
  return id as MemoryId
}
