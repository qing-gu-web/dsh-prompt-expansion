# dsh-prompt-expansion

[![CI](https://github.com/qing-gu-web/dsh-prompt-expansion/actions/workflows/ci.yml/badge.svg)](https://github.com/qing-gu-web/dsh-prompt-expansion/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/qing-gu-web/dsh-prompt-expansion.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/qing-gu-web/dsh-prompt-expansion.svg)](https://github.com/qing-gu-web/dsh-prompt-expansion/stargazers)

English | [中文](README.zh.md)

A DeepSeek Harness plugin that rewrites a prompt so it is clearer, better
structured, and more executable — without touching the parts your downstream
system depends on.

You get an optimized prompt, a change summary, the warnings, and a copy button.
You never get your input silently replaced.

## What it does

- **Composer button** — an icon-only sparkle button in the composer's tool row.
  Type a prompt, click it, and the draft is replaced with the optimized version;
  **Send** then appears beside it, and **Undo** restores what you had.
- **`optimize_prompt` tool** — the agent calls it when you ask it to improve a
  prompt. Returns the optimized text plus an audit trail.
- **`/optimize` command** — you run it yourself from the composer; it does not
  create a model message.
- **Result card** — optimized text, original for comparison, change summary,
  warnings, one-click copy.
- **Protection** — template variables, code, URLs, quoted text, and numbers are
  extracted first and verified afterwards. If any of them would be destroyed, the
  original text is returned unchanged with an explanation.
- **Safe fallback** — every failure path returns your input untouched.

## Install

**From DSH Discover.** Open **Plugins → Discover → Manage index sources**, add
this repository's plugin index, then install the entry from the list:

```
https://raw.githubusercontent.com/qing-gu-web/dsh-prompt-expansion/main/index.json
```

The index pins a git commit, so an install is reproducible and needs no npm
account.

**From a checkout.** Clone the repository, then choose **Plugins → Add plugin** in
the app and point at the directory. A local directory install links the checkout,
so edits take effect without reinstalling.

```sh
git clone https://github.com/qing-gu-web/dsh-prompt-expansion.git
```

Enable the plugin row if it comes up disabled, then start a new session so the
button, tool, and command are registered.

> There is no npm package. The unqualified `dsh-prompt-optimizer` on npm is an
> unrelated project; this plugin installs from this repository only.

## Use it

### The button

A sparkle button sits in the composer's own tool row, next to the model selector.
It carries no text — the icon is the label.

1. Type anything and click the sparkle. It becomes a spinning ring while one model
   call runs; clicking it again cancels.
2. On success the draft is replaced in place and the sparkle becomes a check.
   **Send** appears beside it and submits the optimized prompt immediately;
   **Undo** restores exactly what you had.
3. On failure nothing is replaced; the reason appears next to the button.
4. It is disabled while the draft is empty and while a message is being sent.
   Editing the optimized text drops the Send/Undo offer instead of overwriting
   your edit.

The button runs with the configured `mode`/`goal`/`template`. To override them for
one run, use the command below instead.

### The command

```
/optimize 帮我把这段提示词改得更清楚：把用户上传的表格整理成摘要，别太长
```

```
/optimize --mode system --goal structure --template professional <your system prompt>
```

```
/optimize --template concise --lang en Summarize this changelog for a release note
```

Or simply ask the agent: *"帮我优化一下这个提示词：……"* — it will call
`optimize_prompt` and show you the result.

| Flag | Values |
|---|---|
| `--mode` | `user` (default), `system`, `message` |
| `--goal` | `clarity` (default), `structure`, `concise`, `professional`, `creative`, `technical` |
| `--template` | `generic`, `professional`, `analytical`, `concise`, `output-format`, `conversation`; omit for auto-recommendation |
| `--format` | `structured` (default: lead sentence + numbered groups) or `plain` (flowing prose) |
| `--lang` | `zh`, `en`; omit to follow the source text |
| `--help` | print the usage line |

### Output shape

By default the result is a **specification**, not prose: one lead sentence
naming the deliverable, then 4–7 numbered requirement groups with 1–4 concrete
sub-items each.

```
请开发一个功能完整、交互流畅的贪吃蛇游戏 HTML 程序，具体要求如下：
1. 技术栈：采用原生 HTML5 + CSS3 + JavaScript，不依赖第三方游戏引擎或外部库
   - 单文件交付，双击即可运行
   - 不引用任何外部资源
2. 核心玩法：方向键控制，吃到食物后增长并加分
   - 碰撞检测：撞边界或自身即结束
   ...
```

Alongside the structure, the optimizer fills in the implementation detail this
class of task normally needs — single-file delivery, persistence for records,
pause/cancel, difficulty progression, accessibility, error handling, file
layout, naming, comments. Those are stated as requirements, never hedged as
"suggested" or "optional".

What it still refuses to invent: facts, data, names, dates, links, citations, or
a different task. Filling in engineering conventions is not licence to make up
content, and added detail may never contradict the original.

Pass `--format plain` (or `format: plain` in the config) for flowing prose
instead, and `--goal concise` to keep the numbering but cap it at 3–5 groups.

## Configure

Configuration lives on the plugin's loader row and can be edited in the
profile's `cordis.patch.yml` without reinstalling:

```yaml
- id: dsh-prompt-expansion
  name: 'dsh-prompt-expansion'
  config:
    modelSource: host          # host | byok
    mode: user
    goal: clarity
    template: auto
    format: structured        # structured (numbered spec) | plain (prose)
    language: auto             # auto | zh | en
    maxInputChars: 20000
    maxOutputChars: 24000
    timeoutMs: 60000
    temperature: 0.3
    maxTokens: 6000
    retryOnRateLimit: true
    cacheEnabled: true
    cacheTtlMs: 600000
    cacheMaxEntries: 64
    guideAgent: true
    composerButton: true       # the Optimize button under the input box
    debug: false
    byok:
      baseURL: 'https://api.deepseek.com/v1'
      apiKey: ''               # prefer the environment variable below
      model: deepseek-chat
```

`modelSource: host` uses the model already selected in DSH — no key needed.
`modelSource: byok` calls an OpenAI-compatible endpoint instead. For the key,
`DSH_PROMPT_OPTIMIZER_API_KEY` in the environment takes precedence over the
`byok.apiKey` field, so you can keep it out of the patch file.

Changes to a row in `cordis.patch.yml` are picked up without reinstalling, but
the plugin is restarted, so a new request uses the new values.

## Privacy

- Your prompt text is sent to exactly one place: the model endpoint — the DSH
  configured provider, or the BYOK `baseURL` you set. Nothing else leaves the
  process; there is no telemetry, no analytics, and no third-party call.
- The composer button talks to this plugin's own local route
  (`/api/prompt-optimizer/optimize`) on the same DSH server. That route is only
  reachable by the owner peer of this installation; it is not exposed publicly and
  it forwards the text only to the model endpoint.
- The API key is never logged, never included in a result, and never sent
  anywhere except the endpoint that needs it as a bearer token. It is not part of
  any prompt.
- The original and the optimized text are recorded in the session log as an
  ordinary tool result, because that is how DSH renders cards and replays
  sessions. They are not written anywhere else by this plugin.
- Results are cached in memory only, for ten minutes by default. The cache is
  cleared when the plugin unloads; `cacheEnabled: false` disables it.
- `debug: true` adds one line to the log at activation. It does not log prompt
  text or keys.

## What it will not do

1. It never rewrites or sends a message on its own. Every run is triggered by you
   or by an agent you asked.
2. It never invents facts, data, names, dates, links, or citations. It does fill
   in the implementation conventions this kind of task normally needs — that is
   the point of the structured output — but those never contradict the original,
   and the parameters it picked are listed under "assumptions" so you can change
   them.
3. It never modifies code blocks, variables, or URLs. If it cannot preserve them,
   it returns the original.
4. It does not send your prompt anywhere except the model endpoint.
5. It does not claim its output is objectively better; the change summary
   describes what changed, not that it improved.
6. It does not expand without limit — `maxOutputChars` caps the result.
7. It does not require an account, a login, or a plugin-specific subscription.

## Compatibility

| DSH version | Status |
|---|---|
| `0.2.2-rc.3` (tested) | Tool, command, system-prompt section, result card |
| `0.2.2-rc.1` / `0.2.2-rc.2` | Expected to work; not separately exercised |
| `< 0.2.2-rc.1` | Not supported |

The Host half imports no `@deepseek-ai/*` package — it reads services from the
Cordis context — so a profile layout change does not break module resolution.
The Client half uses only `react` from the browser module table.

Node `^22.15.0 || >=24.0.0`, Cordis `>=4.0.0-rc <5`.

## Not implemented (yet)

Scored quality dimensions, template import/export, optimization history and
favorites, A/B comparison, evaluation sets and regression reports, team template
bundles. The tool and command already expose `template` and `goal`, so adding a
template library does not change their contract.

## Development

```sh
npm test      # 50 engine/route checks + 6 client-bundle states
npm run check # syntax check every shipped module
```

The tests use a fake `ctx.llm` stream, so they need neither network nor a DSH
runtime. `CONTRIBUTING.md` lists the invariants a change must not break, and
[docs/PUBLISHING.md](docs/PUBLISHING.md) covers npm, the community catalog, and the
market index this repository ships.

## License

MIT — see [LICENSE](LICENSE).

## Feedback

Issues and model-compatibility reports are welcome at the repository's issue
tracker. Please include the DSH version, the provider/model, the mode and goal
you used, and the change summary — but never your API key or a prompt you cannot
share publicly.
