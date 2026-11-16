/**
 * DSH prompt optimizer — Host half.
 *
 * Registers:
 *   - the `optimize_prompt` tool (agent-triggered),
 *   - the `/optimize` command (user-triggered),
 *   - a JSON route behind the composer button,
 *   - a system-prompt section telling the agent when to reach for the tool,
 *   - nothing that rewrites a user's message on its own.
 *
 * No `@deepseek-ai/*` host package is imported: services are read through the
 * Cordis context so this bundle stays loadable from any DSH profile layout.
 */

import { createEngine, ERROR_CODES } from './lib/engine.js'
import { MODES, GOALS, TEMPLATES, FORMATS } from './lib/prompts.js'
import { t, templateName, goalName, modeName } from './lib/i18n.js'
import { createOptimizeRoute, ROUTE_PATH } from './lib/route.js'

export const name = 'prompt-optimizer'

/** `tools` and `llm` are hard requirements; other surfaces attach when present. */
export const inject = ['tools', 'llm']

const MODE_SET = new Set(MODES)
const GOAL_SET = new Set(GOALS)
const TEMPLATE_SET = new Set(TEMPLATES)
const FORMAT_SET = new Set(FORMATS)

const DEFAULTS = {
  modelSource: 'host',
  mode: 'user',
  goal: 'clarity',
  template: 'auto',
  format: 'structured',
  language: 'auto',
  maxInputChars: 20000,
  maxOutputChars: 24000,
  timeoutMs: 60000,
  temperature: 0.3,
  maxTokens: 6000,
  retryOnRateLimit: true,
  cacheEnabled: true,
  cacheTtlMs: 600000,
  cacheMaxEntries: 64,
  debug: false,
  guideAgent: true,
  composerButton: true,
  byok: { baseURL: '', apiKey: '', model: 'deepseek-chat' },
}

/**
 * Normalizes whatever the loader passed as the row config. Every field has a
 * safe default, so an absent or partial config never breaks activation.
 */
function resolveConfig(raw) {
  const input = raw !== null && typeof raw === 'object' ? raw : {}
  const byokInput = input.byok !== null && typeof input.byok === 'object' ? input.byok : {}
  const pickNumber = (value, fallback) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback)
  return {
    modelSource: input.modelSource === 'byok' ? 'byok' : 'host',
    mode: MODE_SET.has(input.mode) ? input.mode : DEFAULTS.mode,
    goal: GOAL_SET.has(input.goal) ? input.goal : DEFAULTS.goal,
    template: input.template === 'auto' || TEMPLATE_SET.has(input.template) ? input.template : DEFAULTS.template,
    format: FORMAT_SET.has(input.format) ? input.format : DEFAULTS.format,
    language: input.language === 'zh' || input.language === 'en' ? input.language : 'auto',
    maxInputChars: pickNumber(input.maxInputChars, DEFAULTS.maxInputChars),
    maxOutputChars: pickNumber(input.maxOutputChars, DEFAULTS.maxOutputChars),
    timeoutMs: pickNumber(input.timeoutMs, DEFAULTS.timeoutMs),
    temperature: typeof input.temperature === 'number' ? input.temperature : DEFAULTS.temperature,
    maxTokens: pickNumber(input.maxTokens, DEFAULTS.maxTokens),
    retryOnRateLimit: input.retryOnRateLimit !== false,
    cacheEnabled: input.cacheEnabled !== false,
    cacheTtlMs: pickNumber(input.cacheTtlMs, DEFAULTS.cacheTtlMs),
    cacheMaxEntries: pickNumber(input.cacheMaxEntries, DEFAULTS.cacheMaxEntries),
    debug: input.debug === true,
    guideAgent: input.guideAgent !== false,
    composerButton: input.composerButton !== false,
    warnOnExpansion: input.warnOnExpansion === true,
    byok: {
      baseURL: typeof byokInput.baseURL === 'string' ? byokInput.baseURL.trim() : '',
      apiKey: typeof byokInput.apiKey === 'string' ? byokInput.apiKey.trim() : '',
      model: typeof byokInput.model === 'string' && byokInput.model.length > 0 ? byokInput.model : DEFAULTS.byok.model,
    },
  }
}

/**
 * Builds the exact shape the declared output schema accepts. The engine's
 * richer internal record carries `null`s (no error, unknown source) that the
 * schema forbids, so the tool value is assembled explicitly.
 */
function toToolValue(result) {
  const value = {
    ok: result.ok === true,
    mode: String(result.mode ?? ''),
    goal: String(result.goal ?? ''),
    template: String(result.template ?? ''),
    language: String(result.language ?? ''),
    original: String(result.original ?? ''),
    optimized: String(result.optimized ?? ''),
    changes: Array.isArray(result.changes) ? result.changes.map(String) : [],
    warnings: Array.isArray(result.warnings) ? result.warnings.map(String) : [],
    assumptions: Array.isArray(result.assumptions) ? result.assumptions.map(String) : [],
    cached: result.cached === true,
    elapsedMs: Number.isFinite(result.elapsedMs) ? result.elapsedMs : 0,
    stats: {
      originalChars: Number(result.stats?.originalChars ?? 0),
      optimizedChars: Number(result.stats?.optimizedChars ?? 0),
      protections: Number(result.stats?.protections ?? 0),
    },
  }
  if (result.source === 'host' || result.source === 'byok') value.source = result.source
  if (typeof result.model === 'string' && result.model.length > 0) value.model = result.model
  if (result.error !== null && typeof result.error === 'object') {
    value.error = {
      code: String(result.error.code ?? 'INTERNAL'),
      message: String(result.error.message ?? ''),
    }
  }
  for (const key of ['variables', 'codeBlocks', 'urls', 'numbers']) {
    const count = result.stats?.[key]
    if (Number.isFinite(count)) value.stats[key] = count
  }
  return value
}

/** Caps the payload persisted as tool presentation metadata. */
const META_TEXT_LIMIT = 16000

function toPresentationMeta(value) {
  const clip = (text) => (typeof text === 'string' && text.length > META_TEXT_LIMIT
    ? `${text.slice(0, META_TEXT_LIMIT)}…`
    : text)
  return {
    v: 1,
    ok: value.ok === true,
    mode: value.mode,
    goal: value.goal,
    template: value.template,
    language: value.language,
    original: clip(value.original),
    optimized: clip(value.optimized),
    changes: value.changes.slice(0, 12),
    warnings: value.warnings.slice(0, 12),
    assumptions: value.assumptions.slice(0, 12),
    source: value.source,
    model: value.model,
    cached: value.cached === true,
    elapsedMs: value.elapsedMs,
    errorCode: value.error?.code ?? null,
    truncated: typeof value.original === 'string' && value.original.length > META_TEXT_LIMIT,
  }
}

function summaryLine(language, value) {
  return t(language, 'meta', {
    template: templateName(language, value.template),
    goal: goalName(language, value.goal),
    mode: modeName(language, value.mode),
    source: value.source === 'byok' ? t(language, 'viaByok') : t(language, 'viaHost'),
  })
}

/** Model-facing content: the optimized prompt plus the audit trail. */
function renderForModel(language, value) {
  if (value.ok !== true) {
    const lines = [t(language, 'before') + ':', value.original, '', (value.error?.message ?? '')]
    return lines.join('\n')
  }
  const parts = [value.optimized, '', '---', summaryLine(language, value)]
  if (value.cached) parts[parts.length - 1] += ` ${t(language, 'cached')}`
  if (value.changes.length > 0) {
    parts.push('', `${t(language, 'changes')}:`)
    for (const change of value.changes) parts.push(`- ${change}`)
  }
  if (value.warnings.length > 0) {
    parts.push('', `${t(language, 'warnings')}:`)
    for (const warning of value.warnings) parts.push(`- ${warning}`)
  }
  if (value.assumptions.length > 0) {
    parts.push('', `${t(language, 'assumptions')}:`)
    for (const assumption of value.assumptions) parts.push(`- ${assumption}`)
  }
  return parts.join('\n')
}

/** Command output: the same audit trail, human-first and compact. */
function renderForCommand(language, value) {
  const head = summaryLine(language, value)
  if (value.ok !== true) {
    return [value.error?.message ?? t(language, 'badResponse'), '', `${t(language, 'before')}:`, value.original].join('\n')
  }
  const parts = [`${t(language, 'after')}:`, value.optimized, '', head]
  if (value.changes.length > 0) {
    parts.push('', `${t(language, 'changes')}:`)
    for (const change of value.changes) parts.push(`- ${change}`)
  }
  if (value.warnings.length > 0) {
    parts.push('', `${t(language, 'warnings')}:`)
    for (const warning of value.warnings) parts.push(`- ${warning}`)
  }
  parts.push('', t(language, 'retryHint'))
  return parts.join('\n')
}

/** `--mode user --goal clarity --template concise --lang zh` then the text. */
function parseCommandInput(rawInput) {
  const text = String(rawInput ?? '')
  const options = {}
  let rest = text
  const flagPattern = /(?:^|\s)--([a-z-]+)(?:=|\s+)([^\s]+)/gi
  let match
  while ((match = flagPattern.exec(text)) !== null) {
    const key = match[1].toLowerCase()
    const value = match[2]
    if (key === 'mode') options.mode = value
    else if (key === 'goal') options.goal = value
    else if (key === 'template') options.template = value
    else if (key === 'format') options.format = value
    else if (key === 'lang' || key === 'language') options.language = value
    rest = rest.replace(match[0], ' ')
  }
  return { options, text: rest.trim(), help: /(^|\s)--help(\s|$)/.test(text) }
}

/** Validates the model-facing arguments before any work happens. */
function normalizeRequest(args, config, language) {
  const mode = typeof args.mode === 'string' && MODE_SET.has(args.mode) ? args.mode : config.mode
  const goal = typeof args.goal === 'string' && GOAL_SET.has(args.goal) ? args.goal : config.goal
  const template = typeof args.template === 'string' && TEMPLATE_SET.has(args.template)
    ? args.template
    : config.template
  const format = typeof args.format === 'string' && FORMAT_SET.has(args.format) ? args.format : config.format
  const requestedLanguage = args.language === 'zh' || args.language === 'en' ? args.language : undefined
  void language
  return { mode, goal, template, format, language: requestedLanguage }
}

/**
 * Resolves the deployment's default model route for a caller that has no
 * agent step of its own (the composer button rides an HTTP request). BYOK
 * still works when this service is absent, and an absent route produces the
 * actionable "no model" message rather than a silent failure.
 */
function readDefaultSelection(scope) {
  try {
    const service = typeof scope?.get === 'function' ? scope.get('agentDefaultModel') : undefined
    if (service !== undefined && typeof service.currentSelection === 'function') {
      const selection = service.currentSelection()
      if (selection !== undefined) return selection
    }
  } catch {
    /* fall through to BYOK or the no-model report */
  }
  return undefined
}

export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig)
  const language = config.language === 'auto' ? 'zh' : config.language
  const log = (() => {
    try {
      if (ctx.logger !== undefined) return ctx.logger
    } catch {
      /* fall back to the console below */
    }
    return console
  })()
  const engine = createEngine({ ctx, config, log })

  if (config.debug) {
    log.info?.(`prompt-optimizer: active (modelSource=${config.modelSource}, template=${config.template}, language=${config.language})`)
  }

  // ---------------------------------------------------------------- tool (B1)
  ctx.tools.register({
    name: 'optimize_prompt',
    description: t(language, 'toolDescription'),
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: t(language, 'toolParamPrompt') },
        mode: { type: 'string', enum: [...MODES], description: t(language, 'toolParamMode') },
        goal: { type: 'string', enum: [...GOALS], description: t(language, 'toolParamGoal') },
        template: { type: 'string', enum: [...TEMPLATES], description: t(language, 'toolParamTemplate') },
        format: { type: 'string', enum: [...FORMATS], description: t(language, 'toolParamFormat') },
        language: { type: 'string', enum: ['zh', 'en'], description: t(language, 'toolParamLanguage') },
      },
      required: ['prompt'],
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', description: 'Whether an optimized result is being returned.' },
          mode: { type: 'string' },
          goal: { type: 'string' },
          template: { type: 'string' },
          language: { type: 'string' },
          original: { type: 'string' },
          optimized: { type: 'string' },
          changes: { type: 'array', items: { type: 'string' } },
          warnings: { type: 'array', items: { type: 'string' } },
          assumptions: { type: 'array', items: { type: 'string' } },
          source: { type: 'string' },
          model: { type: 'string' },
          cached: { type: 'boolean' },
          elapsedMs: { type: 'number' },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
            },
            required: ['code', 'message'],
            additionalProperties: false,
          },
          stats: {
            type: 'object',
            properties: {
              originalChars: { type: 'number' },
              optimizedChars: { type: 'number' },
              protections: { type: 'number' },
              variables: { type: 'number' },
              codeBlocks: { type: 'number' },
              urls: { type: 'number' },
              numbers: { type: 'number' },
            },
            required: ['originalChars', 'optimizedChars', 'protections'],
            additionalProperties: false,
          },
        },
        required: ['ok', 'mode', 'goal', 'template', 'language', 'original', 'optimized', 'changes', 'warnings', 'assumptions', 'cached', 'elapsedMs', 'stats'],
        additionalProperties: false,
      },
      render: (_args, value) => [{ type: 'text', text: renderForModel(value.language || language, value) }],
      presentationMeta: (_args, value) => toPresentationMeta(value),
    },
    async execute(args, exec) {
      const request = normalizeRequest(args, config, language)
      const result = await engine.optimize(
        { text: args.prompt, ...request },
        { signal: exec.signal, agent: exec.agent },
      )
      return toToolValue(result)
    },
  })

  // ------------------------------------------------------------- command (B2)
  if (typeof ctx.inject === 'function') {
    ctx.inject(['commands'], (scope) => {
      scope.commands.register({
        name: 'optimize',
        description: t(language, 'commandHelp'),
        input: { hint: '[--mode user|system|message] [--goal ...] [--template ...] [--format structured|plain] <prompt>' },
        handler: async ({ agent, rawInput, signal }) => {
          const parsed = parseCommandInput(rawInput)
          if (parsed.text.length === 0 || parsed.help) {
            return {
              kind: 'error',
              text: [
                t(language, 'empty'),
                '',
                t(language, 'commandHelp'),
                '',
                t(language, 'firstUse'),
              ].join('\n'),
            }
          }
          const result = await engine.optimize(
            {
              text: parsed.text,
              mode: MODE_SET.has(parsed.options.mode) ? parsed.options.mode : config.mode,
              goal: GOAL_SET.has(parsed.options.goal) ? parsed.options.goal : config.goal,
              template: TEMPLATE_SET.has(parsed.options.template) ? parsed.options.template : config.template,
              format: FORMAT_SET.has(parsed.options.format) ? parsed.options.format : config.format,
              language: parsed.options.language === 'zh' || parsed.options.language === 'en'
                ? parsed.options.language
                : undefined,
            },
            { signal, agent },
          )
          return {
            kind: result.ok ? 'success' : 'error',
            text: renderForCommand(result.language ?? language, result),
          }
        },
      })
    })

    // --------------------------------------------------- system guidance (B3)
    ctx.inject(['systemPrompt'], (scope) => {
      if (!config.guideAgent) return
      scope.systemPrompt.section({
        name: 'tool:prompt-optimizer',
        order: 9500,
        text: [
          '# Optimizing prompts',
          'Call `optimize_prompt` when the user asks to improve, rewrite, tighten, restructure, or optimize a prompt they are writing — and when you are about to hand over a prompt as a deliverable and a quick pass would clearly help.',
          'Do not call it to rewrite an ordinary question into a "better prompt" on your own initiative, and never apply a result to the user\'s text without showing it first: present the optimized prompt, then the change summary and warnings, then let the user copy or apply it.',
          'Pass the prompt verbatim. The tool preserves variables, code blocks, URLs, quoted text, and numbers; if it reports that a protected span would have been destroyed, say so and keep the original.',
          'Modes: `user` for a prompt a person sends, `system` for a system/role specification, `message` for one message inside a thread. Goals: clarity, structure, concise, professional, creative, technical. Templates: generic, professional, analytical, concise, output-format, conversation.',
          'Running out of attempts or getting a model-format failure is not an error to hide — report it and offer the original text.',
        ].join('\n\n'),
      })
    })
    // ------------------------------------------------ composer button route
    // The composer button needs the optimized text back in the editor, so it
    // cannot ride a chat message. One exact JSON route serves it.
    if (config.composerButton) {
      ctx.inject(['connection'], (scope) => {
        const route = createOptimizeRoute({
          engine,
          config,
          language,
          resolveSelection: () => readDefaultSelection(scope),
        })
        scope.effect(() => scope.connection.fetch.register({
          path: ROUTE_PATH,
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: route,
        }), `prompt-optimizer: ${ROUTE_PATH}`)
      })
    }
  }

  return () => {
    engine.cache.clear()
  }
}

export { ERROR_CODES }
