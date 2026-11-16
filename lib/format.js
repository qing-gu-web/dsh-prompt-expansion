/**
 * Deterministic shape normalization for the structured format.
 *
 * The prompt already asks for two-space indented sub-items, but a model that
 * flattens them would silently break the contract. This pass restores the one
 * piece of shape that can be decided without judgment: a dash line that follows
 * a numbered item is a sub-item and must be indented. Code fences are left
 * untouched, and nothing else about the text changes.
 */

const NUMBERED = /^\d+[.、)]\s+\S/
const DASH = /^[-*+]\s+\S/
const FENCE = /^\s*(```|~~~)/

export function normalizeStructuredShape(text) {
  if (typeof text !== 'string' || text.length === 0) return text

  const lines = text.split('\n')
  const out = []
  let inFence = false
  let sawNumberedItem = false

  for (const line of lines) {
    if (FENCE.test(line)) {
      inFence = !inFence
      out.push(line)
      continue
    }
    if (inFence) {
      out.push(line)
      continue
    }
    if (NUMBERED.test(line)) {
      sawNumberedItem = true
      out.push(line)
      continue
    }
    if (sawNumberedItem && DASH.test(line)) {
      out.push(`  ${line}`)
      continue
    }
    out.push(line)
  }

  return out.join('\n')
}
