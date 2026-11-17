/**
 * Loads the Client bundle the way the DSH module loader does, without a
 * browser: captures the registered factory, applies it against a fake client
 * context, renders the result card for each phase, and drives the composer
 * button through its full state machine against a stubbed Host route.
 *
 * Run: node tests/client-selftest.mjs
 */

import assert from 'node:assert/strict'

const loaded = []
globalThis.window = {
  __ModuleLoader__: {
    load(entry) {
      loaded.push(entry)
    },
  },
}

// ------------------------------------------------------------ mini React
// Enough of the hook model to let the button's state machine run for real:
// cells persist per mount, setters schedule a re-render, and only the hook
// kinds this bundle uses are implemented.

const RENDER = Symbol('render')
function createElement(type, props, ...children) {
  return { [RENDER]: true, type, props: props ?? {}, children }
}

let activeCells = []
let hookCursor = 0
let requestRender = () => {}

const React = {
  createElement,
  Fragment: Symbol('Fragment'),
  useState(initial) {
    const index = hookCursor++
    if (!(index in activeCells)) {
      activeCells[index] = typeof initial === 'function' ? initial() : initial
    }
    const set = (next) => {
      activeCells[index] = typeof next === 'function' ? next(activeCells[index]) : next
      requestRender()
    }
    return [activeCells[index], set]
  },
  useRef(value) {
    const index = hookCursor++
    if (!(index in activeCells)) activeCells[index] = { current: value }
    return activeCells[index]
  },
}

function mount(component, props) {
  activeCells = []
  hookCursor = 0
  let tree = null
  let scheduled = false
  const render = () => {
    hookCursor = 0
    requestRender = () => {
      if (scheduled) return
      scheduled = true
      queueMicrotask(() => {
        scheduled = false
        render()
      })
    }
    tree = component(props)
  }
  render()
  return {
    get tree() {
      return tree
    },
    render,
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function fakeRequire(name) {
  if (name === 'react') return React
  throw new Error(`unexpected module: ${name}`)
}

await import('../client.js')

assert.equal(loaded.length, 1, 'the client bundle must register exactly one module')
const entry = loaded[0]
assert.equal(entry.id, 'dsh-prompt-expansion', 'the module id must equal the package name')
assert.equal(typeof entry.factory, 'function')

const clientModule = entry.factory(fakeRequire)
assert.deepEqual(clientModule.inject, ['slots', 'locale'])
assert.equal(typeof clientModule.apply, 'function')

// ---------------------------------------------------------------- apply()

const registered = []
const dictionaries = []
const injectedSlots = []
const fakeCtx = {
  effect(fn) {
    fn()
  },
  locale: {
    register(namespace, dictionary) {
      dictionaries.push({ namespace, dictionary })
      return () => {}
    },
  },
  slots: {
    inject(slotName, callback) {
      injectedSlots.push(slotName)
      callback()
      return () => {}
    },
    register(options, component) {
      registered.push({ options, component })
      return () => {}
    },
  },
}

clientModule.apply(fakeCtx)

assert.deepEqual(injectedSlots.sort(), ['conversation.input.right', 'tool.call.toolview'])

const toolview = registered.find((item) => item.options.name === 'tool.call.toolview')
const dock = registered.find((item) => item.options.name === 'conversation.input.right')
assert.ok(toolview !== undefined, 'the tool result card must register')
assert.ok(dock !== undefined, 'the composer button must register')
assert.equal(toolview.options.key, 'optimize_prompt', 'the key must be the wire tool name')
assert.equal(toolview.options.locale, 'promptOptimizer')
assert.equal(dock.options.id, 'prompt-optimizer-button')

const t = (key) => dictionaries[0].dictionary.en[key] ?? key
assert.ok(dictionaries[0].dictionary.zh['btn.send'].length > 0)

// ------------------------------------------------------------- tree helpers

function collectText(node, out = []) {
  if (node === null || node === undefined || typeof node !== 'object') {
    if (typeof node === 'string') out.push(node)
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out)
    return out
  }
  if (node[RENDER] !== true) return out
  if (typeof node.type === 'function') {
    collectText(node.type({ ...node.props, children: node.children }), out)
    return out
  }
  for (const child of node.children) collectText(child, out)
  return out
}

function collectButtons(node, out = []) {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) collectButtons(child, out)
    return out
  }
  if (node[RENDER] !== true) return out
  if (node.type === 'function') {
    collectButtons(node.type({ ...node.props, children: node.children }), out)
    return out
  }
  if (node.type === 'button') out.push(node)
  for (const child of node.children) collectButtons(child, out)
  return out
}

// ------------------------------------------------------- result card tests

const Card = toolview.component

function renderCard(props) {
  return Card({
    t,
    useDisclosure: () => ({ expanded: props.expanded === true, setExpanded() {}, toggle() {} }),
    callId: 'call-1',
    toolName: 'optimize_prompt',
    ...props,
  })
}

const pending = renderCard({ phase: 'preparing', block: {} })
assert.ok(collectText(pending).some((text) => text.includes('Prompt optimizer')))

const meta = {
  v: 1,
  ok: true,
  mode: 'user',
  goal: 'clarity',
  template: 'generic',
  language: 'zh',
  original: '原文',
  optimized: '优化后',
  changes: ['改了一处', '改了两处', '改了三处'],
  warnings: ['注意'],
  assumptions: [],
  source: 'host',
  model: 'host:deepseek-account/deepseek-flash',
  cached: false,
  elapsedMs: 1200,
  errorCode: null,
  truncated: false,
}
const settled = {
  phase: 'result',
  kind: 'tool-result',
  callId: 'call-1',
  name: 'optimize_prompt',
  content: [{ type: 'text', text: 'fallback' }],
  isError: false,
  meta,
}

assert.ok(collectText(renderCard({ phase: 'result', block: settled })).join(' ').includes('generic'))

const expanded = collectText(renderCard({ phase: 'result', block: settled, expanded: true })).join('\n')
assert.ok(expanded.includes('优化后'), 'expanded card shows the optimized text')
assert.ok(expanded.includes('Original'), 'tab labels come from the dictionary')
assert.ok(expanded.includes('Changes'))
assert.ok(expanded.includes('改了一处'))
assert.ok(expanded.includes('Warnings'))
assert.ok(expanded.includes('注意'))
assert.ok(expanded.includes('1200 ms'))

const failed = collectText(renderCard({
  phase: 'result',
  block: { ...settled, isError: true, meta: { ...meta, ok: false, errorCode: 'AUTH', warnings: ['鉴权失败'] } },
  expanded: true,
})).join('\n')
assert.ok(failed.includes('Not optimized'))
assert.ok(failed.includes('鉴权失败'))

const legacy = collectText(renderCard({
  phase: 'result',
  block: { phase: 'result', kind: 'tool-result', callId: 'call-1', name: 'optimize_prompt', content: [{ type: 'text', text: 'plain text result' }], isError: false },
  expanded: true,
})).join('\n')
assert.ok(legacy.includes('plain text result'))

console.log('result card: 1 slot registration, 4 render states verified')

// ------------------------------------------------------ composer button

const Button = dock.component

function mountButton({ draft = '', phase = 'plain', fetchImpl }) {
  const holder = { draft, phase }
  const setDraftCalls = []
  const submitCalls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = fetchImpl

  const inputActions = {
    setDraft(text) {
      setDraftCalls.push(text)
      holder.draft = text
      // A real composer re-renders every subscriber after a draft write.
      queueMicrotask(() => instance.render())
    },
    submit() {
      submitCalls.push(holder.draft)
    },
    focus() {},
  }

  const instance = mount(Button, {
    t,
    inputActions,
    useInput: (selector) => selector(holder),
  })

  return {
    instance,
    holder,
    setDraftCalls,
    submitCalls,
    buttons() {
      return collectButtons(instance.tree)
    },
    /** Simulates the user editing the composer. */
    type(text) {
      holder.draft = text
      instance.render()
    },
    restore() {
      globalThis.fetch = originalFetch
    },
  }
}

// 1. Empty draft: one icon button, disabled, and nobody is called.
{
  let called = false
  const ui = mountButton({
    draft: '   ',
    fetchImpl: async () => {
      called = true
      return { json: async () => ({ ok: true, optimized: 'x' }) }
    },
  })
  const [optimize] = ui.buttons()
  assert.ok(optimize !== undefined, 'the dock must render a button')
  assert.equal(optimize.props.disabled, true, 'an empty draft disables the button')
  assert.equal(collectText(optimize).join(''), '', 'the button is icon-only, with no visible label')
  assert.ok(optimize.props['aria-label'].length > 0, 'the icon still needs an accessible name')
  await optimize.props.onClick()
  await flush()
  ui.restore()
  assert.equal(called, false, 'no request for an empty draft')
}

// 2. Success: the sent action appears, and sending submits the optimized text.
{
  const seen = []
  const ui = mountButton({
    draft: '帮我写点关于 Q3 的东西',
    fetchImpl: async (url, init) => {
      seen.push({ url, body: JSON.parse(init.body) })
      return { json: async () => ({ ok: true, optimized: 'OPTIMIZED' }) }
    },
  })

  const [optimize] = ui.buttons()
  assert.equal(optimize.props.disabled, false)
  await optimize.props.onClick()
  await flush()
  ui.restore()

  assert.equal(seen.length, 1, 'the button must call the Host route once')
  assert.equal(seen[0].url, '/api/prompt-optimizer/optimize')
  assert.equal(seen[0].body.text, '帮我写点关于 Q3 的东西')
  assert.deepEqual(ui.setDraftCalls, ['OPTIMIZED'], 'the composer must receive the optimized text')

  const buttons = ui.buttons()
  assert.ok(buttons.length >= 2, 'a finished run offers the send action')
  const send = buttons.find((button) => collectText(button).join('') === t('btn.send'))
  assert.ok(send !== undefined, 'the send action sits beside the optimized state')
  assert.ok(buttons.some((button) => collectText(button).join('') === t('btn.undo')), 'undo stays available')

  await send.props.onClick()
  await flush()
  assert.deepEqual(ui.submitCalls, ['OPTIMIZED'], 'sending submits the optimized draft, not the original')
}

// 3. Undo restores the previous draft and withdraws the send action.
{
  const ui = mountButton({
    draft: '原始草稿',
    fetchImpl: async () => ({ json: async () => ({ ok: true, optimized: 'OPTIMIZED' }) }),
  })
  await ui.buttons()[0].props.onClick()
  await flush()
  ui.restore()

  const undo = ui.buttons().find((button) => collectText(button).join('') === t('btn.undo'))
  assert.ok(undo !== undefined)
  await undo.props.onClick()
  await flush()
  assert.deepEqual(ui.setDraftCalls, ['OPTIMIZED', '原始草稿'])
  assert.equal(ui.buttons().length, 1, 'the send and undo affordances disappear after undo')
}

// 4. Editing the optimized draft withdraws the send action instead of clobbering it.
{
  const ui = mountButton({
    draft: '原始草稿',
    fetchImpl: async () => ({ json: async () => ({ ok: true, optimized: 'OPTIMIZED' }) }),
  })
  await ui.buttons()[0].props.onClick()
  await flush()
  ui.restore()
  assert.ok(ui.buttons().length >= 2)

  ui.type('我自己又改了')
  await flush()
  assert.equal(ui.buttons().length, 1, 'a manual edit drops the send/undo offer')
}

// 5. A host-side failure keeps the draft untouched and offers nothing.
{
  const ui = mountButton({
    draft: '原始草稿',
    fetchImpl: async () => ({ json: async () => ({ ok: false, error: { code: 'AUTH', message: 'key invalid' } }) }),
  })
  await ui.buttons()[0].props.onClick()
  await flush()
  ui.restore()
  assert.deepEqual(ui.setDraftCalls, [], 'a failed optimization must not rewrite the draft')
  assert.equal(ui.buttons().length, 1, 'no send action after a failure')
}

// 6. A locked composer (submitting/sending) disables the button.
{
  const ui = mountButton({
    draft: 'text',
    phase: 'sending',
    fetchImpl: async () => ({ json: async () => ({ ok: true, optimized: 'x' }) }),
  })
  assert.equal(ui.buttons()[0].props.disabled, true, 'the button is disabled while a message is in flight')
  ui.restore()
}

// 7. An unregistered route reports instead of silently doing nothing.
{
  const ui = mountButton({
    draft: 'some text',
    fetchImpl: async () => ({ status: 404, json: async () => ({ ok: false }) }),
  })
  await ui.buttons()[0].props.onClick()
  await flush()
  ui.restore()
  assert.deepEqual(ui.setDraftCalls, [], 'a 404 must not rewrite the draft')
  const text = collectText(ui.instance.tree).join(' ')
  assert.ok(text.includes(t('btn.failed')), 'the failure is shown next to the button')
}

console.log('composer button: icon-only, empty, success+send, undo, edit, failure, locked, 404 verified')
