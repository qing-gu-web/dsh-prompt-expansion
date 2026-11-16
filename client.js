/**
 * DSH prompt optimizer — Client half.
 *
 * Renders the `optimize_prompt` tool call as a readable card: the optimized
 * prompt, the original for comparison, the change summary, and warnings, with
 * one-click copy and a "retry with another template" affordance.
 *
 * No build step: DSH loads this file as a Cordis client bundle.
 */

window.__ModuleLoader__.load({
  id: 'dsh-optimize-prompt',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'promptOptimizer'

    const zh = {
      'row.title': '提示词优化',
      'row.pending': '正在优化提示词…',
      'row.failed': '优化失败',
      'row.empty': '没有返回内容',
      'tab.after': '优化后',
      'tab.before': '原文',
      'action.copy': '复制',
      'action.copied': '已复制',
      'action.retry': '换模板重试',
      'section.changes': '变更摘要',
      'section.warnings': '警告',
      'section.assumptions': '已假设',
      'section.error': '未能优化',
      'footer.host': '宿主模型',
      'footer.byok': 'BYOK',
      'footer.cached': '缓存',
      'hint.expand': '展开查看',
      'hint.collapse': '收起',
      'btn.label': '优化',
      'btn.tooltip': '优化输入框里的提示词（可撤销）',
      'btn.busy': '优化中…',
      'btn.cancel': '取消',
      'btn.done': '已优化',
      'btn.undo': '撤销',
      'btn.empty': '输入框是空的',
      'btn.failed': '优化失败',
      'btn.send': '发送',
      'btn.sendTip': '直接发送优化后的提示词',
      'btn.doneTip': '已优化，可直接发送',
      'btn.noRoute': '插件路由未就绪，请重启 DSH 后重试',
      'btn.unauthorized': '本机路由拒绝了这次请求，请刷新页面后重试',
    }

    const en = {
      'row.title': 'Prompt optimizer',
      'row.pending': 'Optimizing prompt…',
      'row.failed': 'Optimization failed',
      'row.empty': 'No content returned',
      'tab.after': 'Optimized',
      'tab.before': 'Original',
      'action.copy': 'Copy',
      'action.copied': 'Copied',
      'action.retry': 'Retry with another template',
      'section.changes': 'Changes',
      'section.warnings': 'Warnings',
      'section.assumptions': 'Assumptions',
      'section.error': 'Not optimized',
      'footer.host': 'host model',
      'footer.byok': 'BYOK',
      'footer.cached': 'cache hit',
      'hint.expand': 'Show details',
      'hint.collapse': 'Hide details',
      'btn.label': 'Optimize',
      'btn.tooltip': 'Optimize the prompt in the composer (undoable)',
      'btn.busy': 'Optimizing…',
      'btn.cancel': 'Cancel',
      'btn.done': 'Optimized',
      'btn.undo': 'Undo',
      'btn.empty': 'The composer is empty',
      'btn.failed': 'Optimization failed',
      'btn.send': 'Send',
      'btn.sendTip': 'Send the optimized prompt now',
      'btn.doneTip': 'Optimized — ready to send',
      'btn.noRoute': 'The plugin route is not ready; restart DSH and try again',
      'btn.unauthorized': 'The local route refused this request; reload the page and try again',
    }

    const styles = {
      card: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        minWidth: 0,
        maxWidth: '100%',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 'var(--dsh-content-font-size-secondary, 13px)',
      },
      header: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        minHeight: '24px',
        minWidth: 0,
        cursor: 'pointer',
        textAlign: 'left',
        background: 'none',
        border: 0,
        padding: 0,
        color: 'inherit',
        font: 'inherit',
      },
      title: { fontWeight: 500, flex: 'none' },
      dot: {
        flex: 'none',
        width: '2px',
        height: '2px',
        borderRadius: '1px',
        background: 'var(--dsw-alias-label-caption)',
      },
      summary: {
        flex: '1 1 auto',
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        color: 'var(--dsw-alias-label-secondary)',
        fontWeight: 400,
      },
      chevron: {
        flex: 'none',
        color: 'var(--dsw-alias-label-caption)',
        fontSize: '11px',
      },
      body: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        minWidth: 0,
        padding: '10px 12px',
        border: '0.5px solid var(--dsw-alias-border-l1)',
        borderRadius: 'var(--dsw-radius-lg)',
        background: 'var(--dsw-alias-markdown-code-block)',
      },
      tabs: { display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' },
      tab: {
        border: '0.5px solid var(--dsw-alias-border-l1)',
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        borderRadius: 'var(--dsw-radius-sm, 6px)',
        padding: '2px 10px',
        fontSize: '12px',
        font: 'inherit',
        cursor: 'pointer',
      },
      tabActive: {
        background: 'var(--dsw-alias-bg-l1, transparent)',
        color: 'var(--dsw-alias-label-primary)',
        borderColor: 'var(--dsw-alias-border-l2)',
      },
      actions: { display: 'flex', gap: '6px', alignItems: 'center', marginLeft: 'auto' },
      text: {
        margin: 0,
        padding: 0,
        maxHeight: '340px',
        overflow: 'auto',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        font: 'var(--dsw-font-xs-13, 13px/1.6)',
        fontFamily: 'var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace)',
      },
      list: { margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '3px' },
      sectionLabel: {
        margin: '0 0 4px',
        fontSize: '12px',
        color: 'var(--dsw-alias-label-caption)',
        letterSpacing: '0.02em',
      },
      notice: {
        color: 'var(--dsw-alias-label-secondary)',
        borderRadius: 'var(--dsw-radius-sm, 6px)',
        border: '0.5px solid var(--dsw-alias-border-l1)',
        padding: '8px 10px',
        lineHeight: 1.6,
      },
      footer: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
        fontSize: '11px',
        color: 'var(--dsw-alias-label-caption)',
      },
    }

    /** Reads the persisted presentation payload, tolerating older shapes. */
    function readMeta(block) {
      const meta = block.meta
      if (meta === null || typeof meta !== 'object') return undefined
      if (typeof meta.optimized !== 'string' && typeof meta.original !== 'string') return undefined
      return meta
    }

    function fallbackText(block) {
      if (!Array.isArray(block.content)) return ''
      const parts = []
      for (const item of block.content) {
        if (item !== null && typeof item === 'object' && item.type === 'text' && typeof item.text === 'string') {
          parts.push(item.text)
        }
      }
      return parts.join('\n')
    }

    async function copyText(text) {
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText !== undefined) {
          await navigator.clipboard.writeText(text)
          return true
        }
      } catch {
        /* fall through to the textarea path */
      }
      try {
        const area = document.createElement('textarea')
        area.value = text
        area.setAttribute('readonly', '')
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(area)
        return ok
      } catch {
        return false
      }
    }

    function smallButton(label, onClick) {
      return h('button', {
        type: 'button',
        style: {
          ...styles.tab,
          padding: '2px 8px',
        },
        onClick: (event) => {
          event.stopPropagation()
          onClick()
        },
      }, label)
    }

    function Section({ label, items, tone }) {
      if (!Array.isArray(items) || items.length === 0) return null
      return h('div', null,
        h('p', { style: styles.sectionLabel }, label),
        h('ul', { style: styles.list },
          items.map((item, index) => h('li', {
            key: String(index),
            style: tone === 'warning' ? { color: 'var(--dsw-alias-label-secondary)' } : undefined,
          }, item))),
      )
    }

    function OptimizeCard(props) {
      const { phase, block, t, useDisclosure } = props
      const disclosure = useDisclosure === undefined ? null : useDisclosure()
      const [tab, setTab] = React.useState('after')
      const [copied, setCopied] = React.useState(false)

      const settled = phase === 'result'
      const meta = settled ? readMeta(block) : undefined
      const text = settled && meta === undefined ? fallbackText(block) : ''
      const failed = settled && ((meta !== undefined && meta.ok !== true) || block.isError === true)

      const expandable = settled && (meta !== undefined || text.length > 0)
      const expanded = expandable && disclosure !== null && disclosure.expanded

      const summary = (() => {
        if (!settled) return t('row.pending')
        if (failed) return t('row.failed')
        if (meta !== undefined) return meta.errorCode ?? (meta.template ? `${meta.template} · ${meta.goal ?? ''}` : '')
        return text.length > 0 ? text.split('\n')[0].slice(0, 80) : t('row.empty')
      })()

      const onToggle = () => {
        if (!expandable || disclosure === null) return
        disclosure.toggle()
      }

      const shown = meta === undefined
        ? text
        : tab === 'after'
          ? meta.optimized ?? ''
          : meta.original ?? ''

      const onCopy = async () => {
        const value = meta === undefined ? text : (meta.optimized ?? '')
        const ok = await copyText(value)
        if (!ok) return
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      }

      const onRetry = () => {
        const actions = props.inputActions
        if (actions === undefined || typeof actions.setDraft !== 'function') return
        const original = meta?.original ?? ''
        if (original.length === 0) return
        actions.setDraft(`/optimize --template concise ${original}`)
      }

      const header = h('button', {
        type: 'button',
        style: styles.header,
        onClick: onToggle,
        'aria-expanded': expandable ? expanded : undefined,
        title: expandable ? (expanded ? t('hint.collapse') : t('hint.expand')) : undefined,
        'data-tool': 'optimize_prompt',
        'data-call-id': props.callId,
      },
        h('span', { style: styles.title }, t('row.title')),
        h('span', { style: styles.dot, 'aria-hidden': true }),
        h('span', { style: styles.summary }, summary),
        expandable ? h('span', { style: styles.chevron, 'aria-hidden': true }, expanded ? '▾' : '▸') : null,
      )

      if (!expanded) return h('div', { style: styles.card }, header)

      const body = h('div', { style: styles.body },
        failed
          ? h('div', { style: styles.notice },
            h('div', { style: { fontWeight: 500, marginBottom: '4px' } }, t('section.error')),
            h('div', null, meta?.warnings?.[0] ?? (block.error?.code ?? t('row.failed'))),
            meta?.original
              ? h('pre', { style: { ...styles.text, marginTop: '8px' } }, meta.original)
              : null,
          )
          : h(React.Fragment, null,
            h('div', { style: styles.tabs },
              h('button', {
                type: 'button',
                style: { ...styles.tab, ...(tab === 'after' ? styles.tabActive : {}) },
                onClick: (event) => { event.stopPropagation(); setTab('after') },
                'aria-pressed': tab === 'after',
              }, t('tab.after')),
              h('button', {
                type: 'button',
                style: { ...styles.tab, ...(tab === 'before' ? styles.tabActive : {}) },
                onClick: (event) => { event.stopPropagation(); setTab('before') },
                'aria-pressed': tab === 'before',
              }, t('tab.before')),
              h('div', { style: styles.actions },
                smallButton(copied ? t('action.copied') : t('action.copy'), onCopy),
                typeof props.inputActions?.setDraft === 'function'
                  ? smallButton(t('action.retry'), onRetry)
                  : null,
              ),
            ),
            h('pre', { style: styles.text }, shown),
          ),
        !failed && Array.isArray(meta?.changes) && meta.changes.length > 0
          ? h(Section, { label: t('section.changes'), items: meta.changes })
          : null,
        !failed && Array.isArray(meta?.assumptions) && meta.assumptions.length > 0
          ? h(Section, { label: t('section.assumptions'), items: meta.assumptions })
          : null,
        Array.isArray(meta?.warnings) && meta.warnings.length > 0
          ? h(Section, { label: t('section.warnings'), items: meta.warnings, tone: 'warning' })
          : null,
        meta !== undefined
          ? h('div', { style: styles.footer },
            h('span', null, meta.source === 'byok' ? t('footer.byok') : t('footer.host')),
            meta.model ? h('span', null, meta.model) : null,
            meta.cached ? h('span', null, t('footer.cached')) : null,
            Number.isFinite(meta.elapsedMs) ? h('span', null, `${meta.elapsedMs} ms`) : null,
            meta.truncated ? h('span', null, '…') : null,
          )
          : null,
      )

      return h('div', { style: styles.card }, header, body)
    }

    // ---------------------------------------------------------- composer button

    const ENDPOINT = '/api/prompt-optimizer/optimize'

    const dockStyles = {
      wrap: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        minWidth: 0,
        maxWidth: '100%',
        fontSize: 'var(--dsh-content-font-size-secondary, 13px)',
      },
      icon: {
        display: 'inline-grid',
        placeItems: 'center',
        width: '26px',
        height: '26px',
        padding: 0,
        border: '0.5px solid transparent',
        borderRadius: '999px',
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        cursor: 'pointer',
        flex: 'none',
      },
      done: {
        color: 'var(--dsw-alias-label-caption)',
        cursor: 'default',
      },
      pill: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        height: '26px',
        padding: '0 10px',
        border: '0.5px solid var(--dsw-alias-border-l2, var(--dsw-alias-border-l1))',
        borderRadius: '999px',
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        fontSize: '12px',
        lineHeight: 1,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        flex: 'none',
      },
      undo: {
        border: 0,
        background: 'transparent',
        color: 'var(--dsw-alias-label-caption)',
        textDecoration: 'underline',
        font: 'inherit',
        fontSize: '12px',
        cursor: 'pointer',
        padding: '0 2px',
        flex: 'none',
      },
      error: {
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '300px',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: '12px',
      },
      disabled: {
        opacity: 0.4,
        cursor: 'default',
      },
    }

    const DOCK_CSS = [
      '.dsh-po-btn{transition:background-color .16s ease,color .16s ease,border-color .16s ease,transform .16s ease}',
      '.dsh-po-btn:hover:not(:disabled){background:var(--dsw-alias-bg-l1,rgba(127,127,127,.1));color:var(--dsw-alias-label-primary)}',
      '.dsh-po-btn:active:not(:disabled){transform:scale(.92)}',
      '.dsh-po-btn:focus-visible{outline:2px solid var(--dsw-alias-border-l2,currentColor);outline-offset:1px}',
      '.dsh-po-ico{transition:transform .22s cubic-bezier(.2,.9,.3,1.2)}',
      '.dsh-po-btn:hover:not(:disabled) .dsh-po-ico{transform:rotate(14deg) scale(1.08)}',
      '.dsh-po-pill:hover{background:var(--dsw-alias-bg-l1,rgba(127,127,127,.1))}',
      '.dsh-po-pill:active{transform:scale(.96)}',
      '@keyframes dsh-po-spin{to{transform:rotate(360deg)}}',
      '.dsh-po-spin{animation:dsh-po-spin 1.1s linear infinite;transform-origin:center}',
      '@keyframes dsh-po-pop{0%{transform:scale(.45);opacity:0}65%{transform:scale(1.2);opacity:1}100%{transform:scale(1)}}',
      '.dsh-po-pop{animation:dsh-po-pop .3s cubic-bezier(.2,.9,.3,1.2)}',
      '@keyframes dsh-po-glow{0%,100%{opacity:.25}50%{opacity:.7}}',
      '.dsh-po-glow{animation:dsh-po-glow 1.6s ease-in-out infinite}',
      '@media (prefers-reduced-motion: reduce){.dsh-po-spin,.dsh-po-pop,.dsh-po-glow{animation:none}.dsh-po-btn,.dsh-po-ico{transition:none}.dsh-po-btn:hover:not(:disabled) .dsh-po-ico{transform:none}}',
    ].join('')

    /** Sparkle: the resting glyph, also used as the error mark. */
    function SparkleIcon({ animated }) {
      return h('svg', {
        viewBox: '0 0 16 16',
        width: 15,
        height: 15,
        'aria-hidden': true,
        className: animated ? 'dsh-po-ico' : undefined,
        style: { flex: 'none', display: 'block' },
      },
        h('path', {
          d: 'M8.6 1.2 9.9 5.3 14 6.6 9.9 7.9 8.6 12 7.3 7.9 3.2 6.6 7.3 5.3Z',
          fill: 'currentColor',
        }),
      )
    }

    /** Busy: a dotted ring turning, so motion never shifts the row's layout. */
    function SpinnerIcon() {
      return h('svg', {
        viewBox: '0 0 16 16',
        width: 15,
        height: 15,
        'aria-hidden': true,
        className: 'dsh-po-spin',
        style: { flex: 'none', display: 'block' },
      },
        h('circle', {
          cx: 8,
          cy: 8,
          r: 5.4,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeDasharray: '1.6 3.2',
          opacity: 0.9,
        }),
      )
    }

    function CheckIcon() {
      return h('svg', {
        viewBox: '0 0 16 16',
        width: 15,
        height: 15,
        'aria-hidden': true,
        className: 'dsh-po-pop',
        style: { flex: 'none', display: 'block' },
      },
        h('path', {
          d: 'M3.4 8.4 6.4 11.4 12.6 4.8',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.9,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )
    }

    /**
     * The composer button: reads the draft, asks the Host to optimize it, and
     * writes the result back into the same composer. A finished run offers the
     * send action right beside it, so an optimized prompt can go out without
     * a second trip to the composer's own send control. The previous draft stays
     * in memory for one-click undo.
     */
    function OptimizeComposerButton(props) {
      const { t, inputActions } = props
      const draft = props.useInput((state) => state.draft)
      const phase = props.useInput((state) => state.phase)
      const [status, setStatus] = React.useState('idle')
      const [detail, setDetail] = React.useState('')
      const [undoText, setUndoText] = React.useState('')
      const abortRef = React.useRef(null)
      const optimizedDraftRef = React.useRef('')

      // Once the user edits the replaced draft, the previous text is no longer
      // "the" previous version: drop the send/undo offer instead of clobbering edits.
      const edited = status === 'done' && draft !== optimizedDraftRef.current
      const state = edited ? 'idle' : status

      const busy = state === 'busy'
      const empty = typeof draft !== 'string' || draft.trim().length === 0
      const locked = phase !== 'plain'
      const disabled = busy ? false : (empty || locked)

      const click = async () => {
        if (busy) {
          abortRef.current?.abort?.()
          return
        }
        if (disabled) return

        const text = draft
        const controller = new AbortController()
        abortRef.current = controller
        setStatus('busy')
        setDetail('')
        try {
          const response = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text }),
            signal: controller.signal,
          })
          if (response.status === 401 || response.status === 403) throw new Error(t('btn.unauthorized'))
          if (response.status === 404) throw new Error(t('btn.noRoute'))

          const payload = await response.json()
          if (payload === null || typeof payload !== 'object') throw new Error(t('btn.failed'))
          if (payload.ok !== true) {
            setStatus('error')
            setDetail(String(payload.error?.message ?? t('btn.failed')))
            return
          }
          const optimized = String(payload.optimized ?? '')
          optimizedDraftRef.current = optimized
          setUndoText(text)
          inputActions.setDraft(optimized)
          if (typeof inputActions.focus === 'function') inputActions.focus()
          setStatus('done')
          setDetail('')
        } catch (error) {
          if (error?.name === 'AbortError') {
            setStatus('idle')
            return
          }
          setStatus('error')
          setDetail(String(error?.message ?? error))
        }
      }

      // The composer already holds the optimized text, so sending is one call;
      // submit() runs the same adjudication a manual Enter would.
      const send = () => {
        if (typeof inputActions.submit !== 'function') return
        if (phase !== 'plain') return
        setUndoText('')
        setStatus('idle')
        inputActions.submit()
      }

      const undo = () => {
        if (undoText.length === 0) return
        inputActions.setDraft(undoText)
        setUndoText('')
        setStatus('idle')
      }

      const title = busy
        ? t('btn.cancel')
        : state === 'done' ? t('btn.doneTip') : empty ? t('btn.empty') : t('btn.tooltip')

      const optimizeButton = h('button', {
        type: 'button',
        className: 'dsh-po-btn',
        onClick: click,
        disabled,
        title,
        'aria-label': busy ? t('btn.cancel') : t('btn.label'),
        'aria-busy': busy ? 'true' : undefined,
        style: {
          ...dockStyles.icon,
          ...(state === 'done' ? dockStyles.done : {}),
          ...(disabled ? dockStyles.disabled : {}),
        },
      },
        busy ? h(SpinnerIcon) : state === 'done' ? h(CheckIcon) : h(SparkleIcon, { animated: true }),
      )

      return h('div', { style: dockStyles.wrap, 'data-prompt-optimizer': 'composer-button' },
        h('style', null, DOCK_CSS),
        optimizeButton,
        state === 'done'
          ? h('button', {
            type: 'button',
            className: 'dsh-po-pill',
            onClick: send,
            title: t('btn.sendTip'),
            style: dockStyles.pill,
          },
            h('span', null, t('btn.send')),
          )
          : null,
        state === 'done' && undoText.length > 0
          ? h('button', { type: 'button', onClick: undo, style: dockStyles.undo }, t('btn.undo'))
          : null,
        state === 'error'
          ? h('span', { style: dockStyles.error, title: detail }, `${t('btn.failed')} · ${detail}`)
          : null,
      )
    }

    function apply(ctx) {
      // The renderer disposes effects with the plugin; keep the dictionary
      // registration scoped to it without assuming `register` returns a disposer.
      const registerDictionary = () => {
        const dispose = ctx.locale.register(NS, { zh, en })
        return typeof dispose === 'function' ? dispose : () => {}
      }
      try {
        if (typeof ctx.effect === 'function') ctx.effect(registerDictionary, 'prompt-optimizer: client dictionaries')
        else registerDictionary()
      } catch {
        // A locale failure must not cost the user the card.
        try { registerDictionary() } catch { /* the card falls back to keys */ }
      }
      ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
        name: 'tool.call.toolview',
        key: 'optimize_prompt',
        locale: NS,
      }, OptimizeCard))
      ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
        name: 'conversation.input.right',
        id: 'prompt-optimizer-button',
        order: 10,
        locale: NS,
      }, OptimizeComposerButton))
    }

    return { inject: ['slots', 'locale'], apply }
  },
})
