/**
 * Plugin-owned UI copy. Kept in one table so every surface (tool result,
 * command output, card, errors) can be switched with one config value.
 */

import { normalizeLanguage } from './prompts.js'

const STRINGS = {
  zh: {
    toolDescription:
      '在不改变原意、变量、代码块、URL 与数字的前提下，把一段提示词改写得更清晰、更结构化、更可执行。仅在你需要交付一段提示词文本时使用；不要用它改写用户刚发来的普通提问，也不要在用户没有要求改写时自动调用。返回优化前后的对比、变更摘要与警告。',
    toolParamPrompt: '待优化的提示词原文。原样传入，不要预先改写。',
    toolParamMode: '优化对象类型：user=用户提示词（默认），system=系统提示词，message=多轮对话中的单条消息。',
    toolParamGoal: '优化目标：clarity=更清晰，structure=更结构化，concise=更精简，professional=更专业，creative=更有创意，technical=更技术化。',
    toolParamTemplate: '结构模板：generic=通用，professional=专业角色，analytical=分析推理，concise=精简，output-format=输出格式契约，conversation=多轮消息。留空时按原文自动推荐。',
    toolParamFormat: '输出格式：structured=分层编号的规格体（默认，会补齐这类任务的通行实现细节），plain=通顺散文。',
    toolParamLanguage: '输出语言。留空跟随原文语言。',

    commandHelp: '优化一段提示词：/optimize [--mode user|system|message] [--goal ...] [--template ...] [--lang zh|en] <提示词原文>',

    empty: '没有可优化的内容。请在 /optimize 后面粘贴提示词原文。',
    tooShort: '内容过短，无法判断意图。请提供至少 2 个字符的提示词。',
    tooLong: '内容超出长度上限（{length} 字符 > {max}）。请拆分后分段优化，或在插件配置中提高 maxInputChars。',
    binary: '内容看起来是二进制或包含大量控制字符，不是提示词文本，已拒绝处理。',
    codeOnly: '内容看起来是一段源代码，而不是提示词。请描述你想让模型做什么，或把代码作为示例放进提示词。',
    notPrompt: '这看起来不是可优化的提示词文本。',

    noModel: '没有可用的模型。请在 DSH 设置里选择模型，或把插件配置 modelSource 设为 byok 并填写 Base URL / Key / 模型。',
    auth: '鉴权失败：API Key 无效或没有权限。请检查插件配置中的 apiKey（或 DSH_PROMPT_OPTIMIZER_API_KEY 环境变量）。',
    rateLimit: '模型端点限流，已重试一次仍失败。请稍后再试或降低调用频率。',
    timeout: '请求超时（{ms}ms）。请检查网络或代理，或在插件配置中提高 timeoutMs。',
    network: '无法连接到模型端点（{reason}）。请检查 Base URL、网络与代理设置。',
    badResponse: '模型返回的内容不符合约定格式，已回退为原文。可重试一次或换一个模型。',
    maxTokens: '模型输出在达到 maxTokens（{max}）时被截断，已回退为原文。请在插件配置里提高 maxTokens，或把提示词拆短一些。',
    aborted: '已取消，未产生新的请求。',
    protectedLost: '优化结果破坏了受保护内容（{items}），已回退为原文，未做任何改写。',
    noImprovement: '模型认为原文已足够好，返回了未改动的结果。',
    truncated: '输出超过 maxOutputChars，已截断。',
    grewALot: '结果比原文长了 {ratio}%，请确认没有过度扩写。',
    shrankALot: '结果比原文短了 {ratio}%，请确认没有丢失需求。',
    cached: '（命中缓存）',
    viaByok: 'BYOK',
    viaHost: '宿主模型',
    copyHint: '复制优化后的提示词',
    copied: '已复制',
    copyFailed: '复制失败，请手动选择文本。',
    before: '原文',
    after: '优化后',
    changes: '变更摘要',
    warnings: '警告',
    assumptions: '已假设',
    meta: '模板 {template} · 目标 {goal} · 模式 {mode} · {source}',
    retryHint: '想换一种风格可执行 /optimize --template concise，或切换 goal。',
    firstUse:
      '首次使用：插件默认使用 DSH 当前模型，无需额外配置；如需自备 Key，把插件配置 modelSource 设为 byok 并填写 byok.baseURL / byok.apiKey / byok.model。',
  },
  en: {
    toolDescription:
      'Rewrite a prompt so it is clearer, better structured, and more executable, without changing its intent, variables, code blocks, URLs, or numbers. Use it only when you are delivering prompt text; do not use it to rewrite an ordinary user question, and never call it unless the user asked for a rewrite. Returns a before/after view, a change summary, and warnings.',
    toolParamPrompt: 'The prompt text to optimize. Pass it verbatim; do not pre-rewrite it.',
    toolParamMode: 'Target kind: user = user prompt (default), system = system prompt, message = one message in a conversation.',
    toolParamGoal: 'Optimization goal: clarity, structure, concise, professional, creative, or technical.',
    toolParamTemplate: 'Structure template: generic, professional, analytical, concise, output-format, conversation. Omit to auto-recommend from the text.',
    toolParamFormat: 'Output shape: structured (default — a lead sentence plus a numbered requirement list, filling in conventional implementation detail) or plain (flowing prose).',
    toolParamLanguage: 'Output language. Omit to follow the source text.',

    commandHelp: 'Optimize a prompt: /optimize [--mode user|system|message] [--goal ...] [--template ...] [--lang zh|en] <prompt text>',

    empty: 'Nothing to optimize. Paste the prompt text after /optimize.',
    tooShort: 'Too short to infer intent. Provide at least 2 characters.',
    tooLong: 'Over the input limit ({length} > {max} characters). Split it, or raise maxInputChars in the plugin configuration.',
    binary: 'This looks like binary or control-character data, not prompt text, so it was refused.',
    codeOnly: 'This looks like source code rather than a prompt. Describe what you want the model to do, or keep the code as an example inside a prompt.',
    notPrompt: 'This does not look like optimizable prompt text.',

    noModel: 'No model available. Choose a model in DSH settings, or set modelSource to byok and fill in baseURL / apiKey / model.',
    auth: 'Authentication failed: the API key is invalid or lacks permission. Check apiKey (or the DSH_PROMPT_OPTIMIZER_API_KEY environment variable).',
    rateLimit: 'The endpoint rate-limited the request and the single retry also failed. Try again later.',
    timeout: 'The request timed out ({ms}ms). Check the network or proxy, or raise timeoutMs.',
    network: 'Could not reach the model endpoint ({reason}). Check the base URL, network, and proxy settings.',
    badResponse: 'The model response did not match the required format, so the original text was kept. Retry once or switch models.',
    maxTokens: 'The model output was cut off at the maxTokens limit ({max}), so the original text was kept. Raise maxTokens in the plugin configuration, or shorten the prompt.',
    aborted: 'Cancelled; no further request was made.',
    protectedLost: 'The result would have destroyed protected content ({items}), so the original text was kept unchanged.',
    noImprovement: 'The model judged the original good enough and returned it unchanged.',
    truncated: 'Output exceeded maxOutputChars and was truncated.',
    grewALot: 'The result is {ratio}% longer than the original; check for over-expansion.',
    shrankALot: 'The result is {ratio}% shorter than the original; check that no requirement was dropped.',
    cached: '(cache hit)',
    viaByok: 'BYOK',
    viaHost: 'host model',
    copyHint: 'Copy the optimized prompt',
    copied: 'Copied',
    copyFailed: 'Copy failed; select the text manually.',
    before: 'Original',
    after: 'Optimized',
    changes: 'Changes',
    warnings: 'Warnings',
    assumptions: 'Assumptions',
    meta: 'template {template} · goal {goal} · mode {mode} · {source}',
    retryHint: 'For a different style, run /optimize --template concise, or switch the goal.',
    firstUse:
      'First use: this plugin calls the model already configured in DSH, so no extra setup is needed. To bring your own key, set modelSource to byok and fill byok.baseURL / byok.apiKey / byok.model.',
  },
}

export function t(language, key, params = {}) {
  const lang = normalizeLanguage(language)
  const table = STRINGS[lang] ?? STRINGS.zh
  const fallback = STRINGS.en
  let text = table[key] ?? fallback[key] ?? key
  for (const [name, value] of Object.entries(params)) {
    text = text.split(`{${name}}`).join(String(value))
  }
  return text
}

export function templateName(language, template) {
  const names = {
    zh: {
      generic: '通用',
      professional: '专业角色',
      analytical: '分析推理',
      concise: '精简',
      'output-format': '输出格式',
      conversation: '多轮消息',
    },
    en: {
      generic: 'generic',
      professional: 'professional',
      analytical: 'analytical',
      concise: 'concise',
      'output-format': 'output format',
      conversation: 'conversation',
    },
  }
  const lang = normalizeLanguage(language)
  return names[lang][template] ?? template
}

export function goalName(language, goal) {
  const names = {
    zh: {
      clarity: '更清晰',
      structure: '更结构化',
      concise: '更精简',
      professional: '更专业',
      creative: '更有创意',
      technical: '更技术化',
    },
    en: {
      clarity: 'clarity',
      structure: 'structure',
      concise: 'concise',
      professional: 'professional',
      creative: 'creative',
      technical: 'technical',
    },
  }
  const lang = normalizeLanguage(language)
  return names[lang][goal] ?? goal
}

export function modeName(language, mode) {
  const names = {
    zh: { user: '用户提示词', system: '系统提示词', message: '单条消息' },
    en: { user: 'user prompt', system: 'system prompt', message: 'single message' },
  }
  const lang = normalizeLanguage(language)
  return names[lang][mode] ?? mode
}
