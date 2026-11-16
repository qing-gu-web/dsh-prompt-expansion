/**
 * Input admission. Everything here runs before any model request, so an
 * invalid input costs nothing and never reaches a provider.
 */

const BINARY_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

export const INPUT_REJECT = {
  EMPTY: 'empty',
  TOO_SHORT: 'too-short',
  TOO_LONG: 'too-long',
  BINARY: 'binary',
  CODE_ONLY: 'code-only',
  NOT_PROMPT: 'not-prompt',
}

function nonPrintableRatio(text) {
  const matches = text.match(BINARY_CONTROL)
  if (matches === null) return 0
  return matches.length / Math.max(text.length, 1)
}

function looksLikeCodeOnly(text) {
  const lines = text.split('\n').filter((line) => line.trim().length > 0)
  if (lines.length === 0) return false

  const fenceLines = lines.filter((line) => /^\s*(```|~~~)/.test(line)).length
  if (fenceLines >= 2) {
    // A prompt that is nothing but one code block has no instruction to improve.
    const outside = text.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g, '').trim()
    if (outside.length < 12) return true
  }

  const proseSignals = [
    /[\u4e00-\u9fff]/,
    /[。！？；：]$/m,
    /\b(you|your|please|should|must|need|write|explain|summarize|analyze)\b/i,
    /(你|请|需要|应当|必须|帮我|写|解释|总结|分析)/,
  ]
  const proseScore = proseSignals.filter((pattern) => pattern.test(text)).length
  if (proseScore > 0) return false

  // Without a single prose signal, judge by how much of the text is code.
  const codeLinePattern = /^\s*(?:import|export|from|const|let|var|function|class|def|package|using|#include|public|private|protected|static|return|if|for|while|switch|try|catch|await|async)\b/
  const structuralLinePattern = /^\s*[}\])>]\s*[;,]?\s*$|^\s*<\/?[A-Za-z][^>]*>\s*$/
  const codeLines = lines.filter((line) => codeLinePattern.test(line) || structuralLinePattern.test(line)).length
  const ratio = codeLines / lines.length
  if (ratio >= 0.6 && text.length < 4000) return true

  // Dense punctuation is the last code-shaped signal for one-line snippets.
  const punctuation = (text.match(/[{}();=<>[\]]/g) ?? []).length
  return punctuation / text.length > 0.12 && text.length < 2000
}

/**
 * @returns {{ ok: true } | { ok: false, code: string, detail: Record<string, unknown> }}
 */
export function validateInput(text, { maxInputChars = 20000, minInputChars = 2 } = {}) {
  if (typeof text !== 'string') {
    return { ok: false, code: INPUT_REJECT.EMPTY, detail: { length: 0 } }
  }
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return { ok: false, code: INPUT_REJECT.EMPTY, detail: { length: 0 } }
  }
  if (trimmed.length < minInputChars) {
    return { ok: false, code: INPUT_REJECT.TOO_SHORT, detail: { length: trimmed.length, min: minInputChars } }
  }
  if (text.length > maxInputChars) {
    return {
      ok: false,
      code: INPUT_REJECT.TOO_LONG,
      detail: { length: text.length, max: maxInputChars },
    }
  }
  if (nonPrintableRatio(text) > 0.02) {
    return { ok: false, code: INPUT_REJECT.BINARY, detail: { ratio: Number(nonPrintableRatio(text).toFixed(3)) } }
  }
  if (looksLikeCodeOnly(text)) {
    return { ok: false, code: INPUT_REJECT.CODE_ONLY, detail: { length: text.length } }
  }
  return { ok: true }
}

/**
 * Heuristic intent detection used to recommend a template (F3: rules first,
 * low confidence falls back to the generic template).
 */
export function recommendTemplate(text, mode) {
  const value = String(text ?? '')
  if (mode === 'message') return { template: 'conversation', confidence: 0.8 }

  const rules = [
    { template: 'output-format', pattern: /(JSON|json|字段|schema|格式|表格|CSV|csv|markdown 表格|输出为)/, weight: 2 },
    { template: 'analytical', pattern: /(分析|推理|论证|评估|对比|拆解|why|analy[sz]e|reason|evaluate|compare)/i, weight: 2 },
    { template: 'professional', pattern: /(专家|角色|律师|医生|工程师|顾问|expert|role|persona|act as)/i, weight: 2 },
    { template: 'concise', pattern: /(精简|简短|一句话|不要废话|简洁|concise|brief|short|one sentence)/i, weight: 2 },
  ]

  let best = { template: 'generic', confidence: 0.35 }
  for (const rule of rules) {
    if (rule.pattern.test(value)) {
      const confidence = Math.min(0.5 + rule.weight * 0.15, 0.85)
      if (confidence > best.confidence) best = { template: rule.template, confidence }
    }
  }
  return best
}
