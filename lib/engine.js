/**
 * The optimization engine: input admission, model invocation (host route or
 * BYOK), response parsing, protected-span verification, and safe fallback.
 *
 * Every failure path returns the original text untouched with an actionable
 * message. Nothing here writes to the user's input.
 */

import { createHash } from 'node:crypto'
import { buildOptimizerSystemPrompt, buildOptimizerUserMessage, normalizeLanguage, FORMATS } from './prompts.js'
import { extractProtectedSpans, verifyProtectedSpans, describeSurfaceChanges } from './protect.js'
import { normalizeStructuredShape } from './format.js'
import { validateInput, recommendTemplate, INPUT_REJECT } from './validate.js'
import { t } from './i18n.js'

export const ERROR_CODES = {
  INVALID_INPUT: 'INVALID_INPUT',
  NO_MODEL: 'NO_MODEL',
  AUTH: 'AUTH',
  RATE_LIMIT: 'RATE_LIMIT',
  TIMEOUT: 'TIMEOUT',
  NETWORK: 'NETWORK',
  BAD_RESPONSE: 'BAD_RESPONSE',
  MAX_TOKENS: 'MAX_TOKENS',
  ABORTED: 'ABORTED',
  PROTECTED_LOST: 'PROTECTED_LOST',
  INTERNAL: 'INTERNAL',
}

/**
 * Classification lives in one place so the tool, the command, and the card
 * always agree on what a failure means and what the user can do about it.
 */
export function classifyError(error) {
  const name = error?.name ?? ''
  const code = error?.code ?? ''
  const status = error?.status
  const message = String(error?.message ?? error ?? '')

  // A code this module assigned is already the classification.
  if (Object.values(ERROR_CODES).includes(code)) {
    return { code, status, detail: message }
  }
  if (name === 'AbortError' || code === 'ABORT_ERR' || /aborted|cancell?ed/i.test(message)) {
    return { code: ERROR_CODES.ABORTED, status: undefined, detail: message }
  }
  if (code === 'TIMEOUT' || name === 'TimeoutError' || /timed?\s?out|timeout/i.test(message)) {
    return { code: ERROR_CODES.TIMEOUT, status, detail: message }
  }
  if (status === 401 || status === 403 || /auth|unauthor|invalid[_ ]?api[_ ]?key|forbidden|permission/i.test(message)) {
    return { code: ERROR_CODES.AUTH, status, detail: message }
  }
  if (status === 429 || /rate[_ ]?limit|too many requests|quota/i.test(message)) {
    return { code: ERROR_CODES.RATE_LIMIT, status, detail: message }
  }
  if (/no[_ ]?adapter|no model|missing[_ ]?credential|provider/i.test(message) && /not|no |missing/i.test(message)) {
    return { code: ERROR_CODES.NO_MODEL, status, detail: message }
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|socket|network|getaddrinfo/i.test(message)) {
    return { code: ERROR_CODES.NETWORK, status, detail: message }
  }
  if (status !== undefined) {
    return { code: ERROR_CODES.NETWORK, status, detail: message }
  }
  return { code: ERROR_CODES.BAD_RESPONSE, status, detail: message }
}

/**
 * Bounded result cache. Keyed by everything that can change the output.
 */
export class ResultCache {
  constructor({ ttlMs = 10 * 60 * 1000, maxEntries = 64 } = {}) {
    this.ttlMs = ttlMs
    this.maxEntries = maxEntries
    this.entries = new Map()
  }

  static key(parts) {
    return createHash('sha1').update(JSON.stringify(parts)).digest('hex')
  }

  get(key) {
    const entry = this.entries.get(key)
    if (entry === undefined) return undefined
    if (Date.now() - entry.at > this.ttlMs) {
      this.entries.delete(key)
      return undefined
    }
    // Refresh recency for LRU eviction.
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  set(key, value) {
    this.entries.set(key, { at: Date.now(), value })
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next()
      if (oldest.done === true) break
      this.entries.delete(oldest.value)
    }
  }

  clear() {
    this.entries.clear()
  }

  get size() {
    return this.entries.size
  }
}

/**
 * Combines the caller's signal with an optional timeout, and reports which
 * one fired so the error can be classified correctly.
 */
function withTimeout(signal, timeoutMs) {
  const controller = new AbortController()
  let timedOut = false
  let timer

  const onAbort = () => controller.abort(signal?.reason)
  if (signal !== undefined) {
    if (signal.aborted) controller.abort(signal.reason)
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timer = setTimeout(() => {
      timedOut = true
      controller.abort(new Error('TIMEOUT'))
    }, timeoutMs)
    if (typeof timer.unref === 'function') timer.unref()
  }

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    dispose: () => {
      if (timer !== undefined) clearTimeout(timer)
      if (signal !== undefined) signal.removeEventListener('abort', onAbort)
    },
  }
}

/**
 * Repairs the one JSON defect long structured replies hit most: a raw newline
 * or tab inside a string literal. Everything else is left to JSON.parse to
 * reject, so a genuinely malformed reply still fails loudly.
 */
function repairControlCharsInStrings(text) {
  let out = ''
  let inString = false
  let escaped = false
  for (const ch of text) {
    if (inString) {
      if (escaped) {
        out += ch
        escaped = false
        continue
      }
      if (ch === '\\') {
        out += ch
        escaped = true
        continue
      }
      if (ch === '"') {
        out += ch
        inString = false
        continue
      }
      if (ch === '\n') {
        out += '\\n'
        continue
      }
      if (ch === '\r') continue
      if (ch === '\t') {
        out += '\\t'
        continue
      }
      out += ch
      continue
    }
    if (ch === '"') inString = true
    out += ch
  }
  return out
}

function tryParse(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0) return undefined
  try {
    return JSON.parse(candidate)
  } catch {
    // Fall through to the repair pass.
  }
  try {
    return JSON.parse(repairControlCharsInStrings(candidate))
  } catch {
    return undefined
  }
}

/**
 * Pulls one JSON object out of a model response that may still be wrapped in
 * a markdown fence or surrounded by stray prose, and may contain raw newlines
 * inside its long string values.
 */
export function parseModelJson(raw) {
  if (typeof raw !== 'string') return undefined
  const text = raw.trim()

  const direct = tryParse(text)
  if (direct !== undefined) return direct

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced !== null) {
    const value = tryParse(fenced[1].trim())
    if (value !== undefined) return value
  }

  const start = text.indexOf('{')
  if (start === -1) return undefined
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        const value = tryParse(text.slice(start, i + 1))
        if (value !== undefined) return value
        break
      }
    }
  }
  return undefined
}

function asStringArray(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const item of value) {
    if (typeof item === 'string') {
      const trimmed = item.trim()
      if (trimmed.length > 0) out.push(trimmed)
      continue
    }
    if (item !== null && typeof item === 'object') {
      const text = item.text ?? item.message ?? item.description ?? item.note
      if (typeof text === 'string' && text.trim().length > 0) out.push(text.trim())
    }
  }
  return out
}

/**
 * Reads the model's JSON reply into the optimizer's normalized shape.
 * Returns undefined when the reply does not honor the output contract.
 */
export function readModelReply(raw, language) {
  const parsed = parseModelJson(raw)
  if (parsed === null || typeof parsed !== 'object') return undefined
  if (Array.isArray(parsed)) return undefined

  const optimized = typeof parsed.optimized === 'string'
    ? parsed.optimized
    : typeof parsed.optimizedPrompt === 'string'
      ? parsed.optimizedPrompt
      : undefined

  if (optimized === undefined) return undefined

  const changes = asStringArray(parsed.changes)
  const warnings = asStringArray(parsed.warnings)
  const assumptions = asStringArray(parsed.assumptions)
  if (changes.length === 0 && warnings.length === 0) {
    // A reply with no self-report is still usable, but a reply that is only
    // "optimized" and nothing else is treated as incomplete so the caller can
    // fall back to a deterministic summary.
    return { optimized: optimized.trim(), changes, warnings, assumptions, incomplete: true }
  }
  void language
  return { optimized: optimized.trim(), changes, warnings, assumptions, incomplete: false }
}

function normalizeBaseURL(baseURL) {
  const value = String(baseURL ?? '').trim().replace(/\/+$/, '')
  if (value.length === 0) return ''
  if (/\/chat\/completions$/.test(value)) return value
  return `${value}/chat/completions`
}

/**
 * One BYOK call against an OpenAI-compatible endpoint.
 */
async function callByok({ config, system, user, signal }) {
  const url = normalizeBaseURL(config.byok?.baseURL)
  if (url.length === 0) {
    const error = new Error('byok.baseURL is empty')
    error.code = ERROR_CODES.NO_MODEL
    throw error
  }
  const apiKey = String(config.byok?.apiKey ?? '').trim() || String(process.env.DSH_PROMPT_OPTIMIZER_API_KEY ?? '').trim()
  if (apiKey.length === 0) {
    const error = new Error('byok.apiKey is empty')
    error.code = ERROR_CODES.AUTH
    throw error
  }

  const body = {
    model: config.byok.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    stream: false,
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    const error = new Error(`HTTP ${response.status} ${response.statusText}${detail.length > 0 ? `: ${detail.slice(0, 300)}` : ''}`)
    error.status = response.status
    throw error
  }

  const payload = await response.json().catch(() => undefined)
  const choice = payload?.choices?.[0]
  const content = choice?.message?.content
  const truncated = choice?.finish_reason === 'length'
  if (typeof content === 'string') return { text: content, truncated }
  if (Array.isArray(content)) {
    return {
      text: content
        .map((part) => (typeof part === 'string' ? part : typeof part?.text === 'string' ? part.text : ''))
        .join(''),
      truncated,
    }
  }
  const error = new Error('endpoint returned no message content')
  throw error
}

/**
 * Reads a Cordis service without assuming the plugin declared it. An
 * undeclared service property throws rather than returning undefined, so the
 * read is guarded and reported as a missing model route.
 */
function readService(ctx, name) {
  try {
    const value = ctx?.[name]
    if (value !== undefined) return value
  } catch {
    /* the context refuses undeclared access; report it as unavailable */
  }
  return undefined
}

/**
 * One call through the host's configured model route.
 */
async function callHostModel({ ctx, agent, selection, config, system, user, signal }) {
  const llm = readService(ctx, 'llm')
  if (llm === undefined || typeof llm.stream !== 'function') {
    const error = new Error('the llm service is not available in this profile')
    error.code = ERROR_CODES.NO_MODEL
    throw error
  }
  let chosen = selection
  if (chosen === undefined && agent !== undefined && typeof agent.model?.current === 'function') {
    chosen = agent.model.current()
  }
  if (chosen === undefined) {
    const error = new Error('agent has no provider/model')
    error.code = ERROR_CODES.NO_MODEL
    throw error
  }

  const options = {
    provider: chosen.provider,
    model: chosen.model,
    messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
    system,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    purpose: 'prompt-optimizer',
    signal,
  }
  if (chosen.reasoningEffort !== undefined) options.reasoningEffort = chosen.reasoningEffort
  if (agent?.session?.id !== undefined) options.sessionId = agent.session.id

  let text = ''
  let finish
  for await (const chunk of llm.stream(options)) {
    if (chunk.type === 'text-delta') text += chunk.text
    else if (chunk.type === 'finish') finish = chunk.reason
  }
  if (finish === undefined) {
    const error = new Error('model stream ended without a terminal finish')
    error.code = ERROR_CODES.BAD_RESPONSE
    throw error
  }
  if (finish.kind === 'aborted') {
    const error = new Error(`${finish.kind} ${finish.failure?.code ?? ''}: ${finish.failure?.message ?? ''}`.trim())
    error.code = ERROR_CODES.ABORTED
    error.status = finish.failure?.status
    throw error
  }
  if (finish.kind === 'error') {
    const error = new Error(`${finish.kind} ${finish.failure?.code ?? ''}: ${finish.failure?.message ?? ''}`.trim())
    error.code = finish.failure?.code ?? ''
    error.status = finish.failure?.status
    throw error
  }
  return { text, truncated: finish.kind === 'max-tokens' }
}

/**
 * Builds the user-facing message for a classified failure.
 */
function describeFailure(classified, language, config) {
  switch (classified.code) {
    case ERROR_CODES.NO_MODEL:
      return t(language, 'noModel')
    case ERROR_CODES.AUTH:
      return t(language, 'auth')
    case ERROR_CODES.RATE_LIMIT:
      return t(language, 'rateLimit')
    case ERROR_CODES.TIMEOUT:
      return t(language, 'timeout', { ms: config.timeoutMs })
    case ERROR_CODES.NETWORK:
      return t(language, 'network', { reason: classified.detail.slice(0, 160) })
    case ERROR_CODES.ABORTED:
      return t(language, 'aborted')
    default:
      return `${t(language, 'badResponse')} (${classified.detail.slice(0, 160)})`
  }
}

/**
 * Creates the engine bound to one plugin activation.
 */
export function createEngine({ ctx, config, log }) {
  const cache = new ResultCache({ ttlMs: config.cacheTtlMs, maxEntries: config.cacheMaxEntries })
  const debug = config.debug === true

  function resolveLanguage(requested, text, mode) {
    if (config.language === 'zh' || config.language === 'en') return config.language
    if (requested === 'zh' || requested === 'en') return requested
    const cjk = (String(text).match(/[\u4e00-\u9fff]/g) ?? []).length
    const latin = (String(text).match(/[A-Za-z]/g) ?? []).length
    if (cjk > 0 && cjk * 3 >= latin) return 'zh'
    if (latin > 0 && cjk === 0) return 'en'
    return mode === 'system' ? 'zh' : 'zh'
  }

  function resolveTemplate(requested, text, mode) {
    if (config.template !== 'auto') return { template: config.template, recommended: false, confidence: 1 }
    if (typeof requested === 'string' && requested.length > 0) {
      return { template: requested, recommended: false, confidence: 1 }
    }
    const guess = recommendTemplate(text, mode)
    return { template: guess.template, recommended: true, confidence: guess.confidence }
  }

  /**
   * Runs one optimization. Never throws for provider failures: they come back
   * as `ok: false` with `optimized === original`.
   */
  async function optimize(request, { signal, agent, selection } = {}) {
    const startedAt = Date.now()
    const mode = request.mode ?? config.mode
    const goal = request.goal ?? config.goal
    const format = FORMATS.includes(request.format) ? request.format : config.format
    const language = resolveLanguage(request.language, request.text, mode)

    const admission = validateInput(request.text, { maxInputChars: config.maxInputChars })
    if (!admission.ok) {
      const message = admission.code === INPUT_REJECT.EMPTY
        ? t(language, 'empty')
        : admission.code === INPUT_REJECT.TOO_SHORT
          ? t(language, 'tooShort')
          : admission.code === INPUT_REJECT.TOO_LONG
            ? t(language, 'tooLong', admission.detail)
            : admission.code === INPUT_REJECT.BINARY
              ? t(language, 'binary')
              : t(language, 'codeOnly')
      return {
        ok: false,
        mode,
        goal,
        template: config.template,
        language,
        original: request.text ?? '',
        optimized: request.text ?? '',
        changes: [],
        warnings: [message],
        assumptions: [],
        source: null,
        model: null,
        cached: false,
        elapsedMs: Date.now() - startedAt,
        error: { code: ERROR_CODES.INVALID_INPUT, message, detail: admission.code },
        stats: { originalChars: (request.text ?? '').length, optimizedChars: (request.text ?? '').length, protections: 0 },
      }
    }

    const templateChoice = resolveTemplate(request.template, request.text, mode)
    const template = templateChoice.template

    const modelSource = config.modelSource === 'byok' ? 'byok' : 'host'
    const modelLabel = modelSource === 'byok'
      ? `byok:${config.byok?.model ?? ''}`
      : (() => {
        const chosen = selection ?? agent?.model?.current?.()
        return chosen === undefined ? 'host:unknown' : `host:${chosen.provider}/${chosen.model}`
      })()

    const key = ResultCache.key({
      text: request.text,
      mode,
      goal,
      template,
      format,
      language,
      model: modelLabel,
    })

    if (config.cacheEnabled) {
      const hit = cache.get(key)
      if (hit !== undefined) {
        return { ...hit, cached: true, elapsedMs: Date.now() - startedAt }
      }
    }

    const protectedSpans = extractProtectedSpans(request.text)
    const system = buildOptimizerSystemPrompt({ mode, goal, template, language, format })
    const user = buildOptimizerUserMessage(request.text, language)

    let raw
    let truncated = false
    let usedSource = modelSource
    let fallbackNote

    const scope = withTimeout(signal, config.timeoutMs)
    try {
      if (modelSource === 'host') {
        try {
          const hostReply = await callHostModel({ ctx, agent, selection, config, system, user, signal: scope.signal })
          raw = hostReply.text
          truncated = hostReply.truncated
        } catch (hostError) {
          const hostClassified = classifyError(hostError)
          // D3: degrade to BYOK only when BYOK is actually configured.
          const byokReady = String(config.byok?.baseURL ?? '').length > 0
            && (String(config.byok?.apiKey ?? '').length > 0 || String(process.env.DSH_PROMPT_OPTIMIZER_API_KEY ?? '').length > 0)
            && String(config.byok?.model ?? '').length > 0
          if (!byokReady || hostClassified.code === ERROR_CODES.ABORTED) throw hostError
          if (debug) log?.warn?.(`prompt-optimizer: host model failed (${hostClassified.code}), falling back to BYOK`)
          fallbackNote = hostClassified.code
          usedSource = 'byok'
          const fallbackReply = await callByok({ config, system, user, signal: scope.signal })
          raw = fallbackReply.text
          truncated = fallbackReply.truncated
        }
      } else {
        try {
          const byokReply = await callByok({ config, system, user, signal: scope.signal })
          raw = byokReply.text
          truncated = byokReply.truncated
        } catch (byokError) {
          const classified = classifyError(byokError)
          if (classified.code !== ERROR_CODES.RATE_LIMIT || config.retryOnRateLimit !== true) throw byokError
          // D7: exactly one exponential-backoff retry, only for rate limiting.
          await new Promise((resolve) => setTimeout(resolve, 800))
          const retryReply = await callByok({ config, system, user, signal: scope.signal })
          raw = retryReply.text
          truncated = retryReply.truncated
        }
      }
    } catch (error) {
      scope.dispose()
      if (scope.didTimeout()) {
        const timedOut = new Error('TIMEOUT')
        timedOut.code = ERROR_CODES.TIMEOUT
        const classified = classifyError(timedOut)
        return {
          ok: false,
          mode,
          goal,
          template,
          language,
          original: request.text,
          optimized: request.text,
          changes: [],
          warnings: [describeFailure(classified, language, config)],
          assumptions: [],
          source: usedSource,
          model: modelLabel,
          cached: false,
          elapsedMs: Date.now() - startedAt,
          error: { code: classified.code, message: describeFailure(classified, language, config) },
          stats: {
            originalChars: request.text.length,
            optimizedChars: request.text.length,
            protections: protectedSpans.total,
          },
        }
      }
      const classified = classifyError(error)
      if (classified.code !== ERROR_CODES.ABORTED) {
        log?.warn?.(`prompt-optimizer: model call failed (${classified.code})`)
      }
      return {
        ok: false,
        mode,
        goal,
        template,
        language,
        original: request.text,
        optimized: request.text,
        changes: [],
        warnings: [describeFailure(classified, language, config)],
        assumptions: [],
        source: usedSource,
        model: modelLabel,
        cached: false,
        elapsedMs: Date.now() - startedAt,
        error: {
          code: classified.code,
          message: describeFailure(classified, language, config),
          detail: classified.detail.slice(0, 500),
        },
        stats: {
          originalChars: request.text.length,
          optimizedChars: request.text.length,
          protections: protectedSpans.total,
        },
      }
    } finally {
      scope.dispose()
    }

    if (truncated) {
      const message = t(language, 'maxTokens', { max: config.maxTokens })
      return {
        ok: false,
        mode,
        goal,
        template,
        language,
        original: request.text,
        optimized: request.text,
        changes: [],
        warnings: [message],
        assumptions: [],
        source: usedSource,
        model: modelLabel,
        cached: false,
        elapsedMs: Date.now() - startedAt,
        error: { code: ERROR_CODES.MAX_TOKENS, message },
        stats: {
          originalChars: request.text.length,
          optimizedChars: request.text.length,
          protections: protectedSpans.total,
        },
      }
    }

    const reply = readModelReply(raw, language)
    if (reply === undefined) {
      return {
        ok: false,
        mode,
        goal,
        template,
        language,
        original: request.text,
        optimized: request.text,
        changes: [],
        warnings: [t(language, 'badResponse')],
        assumptions: [],
        source: usedSource,
        model: modelLabel,
        cached: false,
        elapsedMs: Date.now() - startedAt,
        error: { code: ERROR_CODES.BAD_RESPONSE, message: t(language, 'badResponse'), detail: String(raw).slice(0, 800) },
        stats: {
          originalChars: request.text.length,
          optimizedChars: request.text.length,
          protections: protectedSpans.total,
        },
      }
    }

    let optimized = reply.optimized
    const warnings = [...reply.warnings]
    const changes = [...reply.changes]
    const assumptions = [...reply.assumptions]

    if (format === 'structured') optimized = normalizeStructuredShape(optimized)

    // C8: cap output length instead of letting the model expand unbounded.
    if (optimized.length > config.maxOutputChars) {
      optimized = optimized.slice(0, config.maxOutputChars)
      warnings.push(t(language, 'truncated'))
    }

    // C5-C7 / C11: never hand back a result that broke protected content.
    const verification = verifyProtectedSpans(request.text, optimized)
    if (!verification.ok) {
      const items = verification.problems
        .slice(0, 4)
        .map((problem) => `${problem.kind}:${problem.value.slice(0, 40)}`)
        .join(', ')
      return {
        ok: false,
        mode,
        goal,
        template,
        language,
        original: request.text,
        optimized: request.text,
        changes: [],
        warnings: [t(language, 'protectedLost', { items })],
        assumptions: [],
        source: usedSource,
        model: modelLabel,
        cached: false,
        elapsedMs: Date.now() - startedAt,
        error: {
          code: ERROR_CODES.PROTECTED_LOST,
          message: t(language, 'protectedLost', { items }),
          detail: verification.problems.slice(0, 12),
        },
        stats: {
          originalChars: request.text.length,
          optimizedChars: request.text.length,
          protections: protectedSpans.total,
        },
      }
    }

    // C9: guarantee at least three readable change points.
    const synthesized = describeSurfaceChanges(request.text, optimized, mode)
    const seenChanges = new Set(changes.map((c) => c.toLowerCase()))
    for (const item of synthesized) {
      if (changes.length >= 3) break
      const text = language === 'en' ? item.en : item.zh
      if (seenChanges.has(text.toLowerCase())) continue
      seenChanges.add(text.toLowerCase())
      changes.push(text)
    }

    // C10: flag suspicious length movement so the reader can judge. Off by
    // default now that structured expansion is the intended shape.
    const ratio = request.text.length === 0
      ? 100
      : Math.round((optimized.length / request.text.length) * 100)
    if (config.warnOnExpansion === true && ratio >= 220 && optimized.length > request.text.length + 400) {
      warnings.push(t(language, 'grewALot', { ratio }))
    } else if (ratio <= 45 && request.text.length > 200) {
      warnings.push(t(language, 'shrankALot', { ratio }))
    }
    if (optimized.trim() === request.text.trim()) {
      warnings.push(t(language, 'noImprovement'))
    }
    if (templateChoice.recommended) {
      warnings.push(
        language === 'en'
          ? `Template auto-selected: ${template} (confidence ${templateChoice.confidence.toFixed(2)}). Override with --template.`
          : `模板为自动推荐：${template}（置信度 ${templateChoice.confidence.toFixed(2)}）。可用 --template 覆盖。`,
      )
    }
    if (fallbackNote !== undefined) {
      warnings.push(
        language === 'en'
          ? `Host model was unavailable (${fallbackNote}); this result came from BYOK.`
          : `宿主模型不可用（${fallbackNote}），本次结果来自 BYOK。`,
      )
    }

    const result = {
      ok: true,
      mode,
      goal,
      template,
      language,
      original: request.text,
      optimized,
      changes,
      warnings,
      assumptions,
      source: usedSource,
      model: modelLabel,
      cached: false,
      elapsedMs: Date.now() - startedAt,
      error: null,
      stats: {
        originalChars: request.text.length,
        optimizedChars: optimized.length,
        protections: protectedSpans.total,
        variables: protectedSpans.variables.length,
        codeBlocks: protectedSpans.code.length,
        urls: protectedSpans.urls.length,
        numbers: protectedSpans.numbers.length,
      },
    }

    if (config.cacheEnabled) cache.set(key, result)
    return result
  }

  return { optimize, cache, resolveLanguage, config }
}

export { withTimeout, normalizeBaseURL }
