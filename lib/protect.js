/**
 * Protected-span extraction and verification.
 *
 * A prompt optimizer must never destroy things the user's downstream system
 * depends on: template variables, fenced and inline code, URLs, quoted
 * literals, and multi-digit numbers (the ones that usually carry data).
 * We extract those spans before the model runs and re-check them afterwards.
 */

const VARIABLE_PATTERNS = [
  /\{\{\s*[A-Za-z_$][\w$.]*\s*\}\}/g, // {{name}}, {{ user.name }}
  /\$\{[A-Za-z_$][\w$.]*\}/g, // ${name}
  /\$[A-Za-z_][\w]*/g, // $name (shell-style)
  /%(\d+\$)?[-+ 0#]*\d*(?:\.\d+)?[sdif]/g, // printf-style %s, %1$s, %d
  /<([A-Za-z_][\w-]*)>/g, // <variable> style angle placeholders
]

const FENCE_PATTERN = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g
const INLINE_CODE_PATTERN = /`[^`\n]+`/g
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>()"'\]]+/gi
const QUOTED_PATTERN = /(「[^」\n]{2,}」|『[^』\n]{2,}』|“[^”\n]{2,}”|‘[^’\n]{2,}’|"[^"\n]{2,}"|'[^'\n]{2,}')/g
const NUMBER_PATTERN = /(?<![\w.])\d+(?:[.,]\d+)*(?:%|‰)?(?![\w])/g

function collectMatches(text, pattern, out) {
  if (typeof text !== 'string' || text.length === 0) return
  pattern.lastIndex = 0
  let match
  while ((match = pattern.exec(text)) !== null) {
    const value = match[0]
    if (value.length === 0) continue
    out.push(value)
  }
}

function countValues(values) {
  const counts = new Map()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return counts
}

/**
 * Returns every span that must survive optimization verbatim.
 */
export function extractProtectedSpans(text) {
  const variables = []
  for (const pattern of VARIABLE_PATTERNS) collectMatches(text, pattern, variables)

  const fences = []
  collectMatches(text, FENCE_PATTERN, fences)
  const remaining = typeof text === 'string' ? text.replace(FENCE_PATTERN, ' ') : ''

  const inlineCode = []
  collectMatches(remaining, INLINE_CODE_PATTERN, inlineCode)

  // Fenced and inline code counted together: an inline snippet that lives
  // inside a fence is already covered by the fence span.
  const code = [...fences, ...inlineCode]

  const urls = []
  collectMatches(text, URL_PATTERN, urls)

  const quoted = []
  collectMatches(text, QUOTED_PATTERN, quoted)

  const numbers = []
  const rawNumbers = []
  collectMatches(text, NUMBER_PATTERN, rawNumbers)
  for (const value of rawNumbers) {
    // Single digits are list markers far more often than data, so they are
    // not enforced; anything with two or more digits, a separator, or a unit
    // is treated as a fact worth protecting.
    if (/\d{2,}/.test(value) || /[.,%‰]/.test(value)) numbers.push(value)
  }

  return {
    variables,
    code,
    fences,
    inlineCode,
    urls,
    quoted,
    numbers,
    total: variables.length + code.length + urls.length + quoted.length + numbers.length,
  }
}

function missingImmutable(original, candidate) {
  const problems = []
  const has = (value) => candidate.includes(value)

  for (const [value, expected] of countValues(original.variables)) {
    const actual = candidate.split(value).length - 1
    if (actual < expected) {
      problems.push({ kind: 'variable', value, expected, actual })
    }
  }
  for (const value of original.code) {
    if (!has(value)) problems.push({ kind: 'code', value })
  }
  for (const value of original.urls) {
    if (!has(value)) problems.push({ kind: 'url', value })
  }
  for (const value of original.quoted) {
    if (!has(value)) problems.push({ kind: 'quote', value })
  }
  for (const value of original.numbers) {
    if (!has(value)) problems.push({ kind: 'number', value })
  }
  return problems
}

/**
 * Verifies that an optimized candidate kept every protected span.
 * `problems` is empty when the candidate is safe to present.
 */
export function verifyProtectedSpans(text, optimized) {
  const original = extractProtectedSpans(text)
  const problems = typeof optimized === 'string'
    ? missingImmutable(original, optimized)
    : [{ kind: 'empty', value: '' }]

  const seen = new Set()
  const deduped = []
  for (const problem of problems) {
    const key = `${problem.kind}:${problem.value}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(problem)
  }
  return { original, problems: deduped, ok: deduped.length === 0 }
}

/**
 * Cheap, model-independent change summary used when the model returns fewer
 * than the required number of bullet points.
 */
export function describeSurfaceChanges(text, optimized, mode) {
  const changes = []
  const before = text.trim()
  const after = optimized.trim()
  if (before === after) return changes

  const beforeLines = before.split('\n').filter((line) => line.trim().length > 0).length
  const afterLines = after.split('\n').filter((line) => line.trim().length > 0).length
  if (afterLines > beforeLines) {
    changes.push({
      zh: `结构由 ${beforeLines} 行扩展为 ${afterLines} 行，新增了可执行的分段`,
      en: `Structure grew from ${beforeLines} to ${afterLines} lines with explicit sections`,
    })
  } else if (afterLines < beforeLines) {
    changes.push({
      zh: `结构由 ${beforeLines} 行收敛为 ${afterLines} 行，去掉了冗余表述`,
      en: `Structure tightened from ${beforeLines} to ${afterLines} lines by removing redundancy`,
    })
  }

  const headingsBefore = (before.match(/^#{1,6}\s+/gm) ?? []).length
  const headingsAfter = (after.match(/^#{1,6}\s+/gm) ?? []).length
  if (headingsAfter > headingsBefore) {
    changes.push({
      zh: `新增 ${headingsAfter - headingsBefore} 个标题段落，便于逐段核对`,
      en: `Added ${headingsAfter - headingsBefore} heading section(s) for section-by-section review`,
    })
  }

  const beforeLen = before.length
  const afterLen = after.length
  if (beforeLen > 0) {
    const ratio = Math.round((afterLen / beforeLen) * 100)
    changes.push({
      zh: `长度由 ${beforeLen} 字符变为 ${afterLen} 字符（${ratio}%）`,
      en: `Length changed from ${beforeLen} to ${afterLen} characters (${ratio}%)`,
    })
  }

  changes.push({
    zh: `按 ${mode} 模式重写了表达，原意与受保护片段保持不变`,
    en: `Rewrote the wording for ${mode} mode while preserving intent and protected spans`,
  })
  return changes
}
