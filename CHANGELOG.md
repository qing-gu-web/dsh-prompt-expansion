# Changelog

All notable changes to this plugin are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the version
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-11-16

First working version. Scope: the P0 surface of the feature list, plus the
protections that make the output safe to hand back.

### Changed

- **Default output shape is now a structured specification**: one lead sentence
  plus 4–7 numbered requirement groups with 1–4 concrete sub-items each, instead
  of a flat list of sentences.
- The optimizer may now fill in the implementation conventions this class of task
  normally needs (single-file delivery, persistence, pause, difficulty
  progression, accessibility, error handling, layout, naming, comments). Filled-in
  detail is stated as a requirement and never hedged as "suggested" or "optional".
  Inventing facts, data, names, links, or citations is still forbidden, as is
  changing the task.
- `--format plain` / `format: plain` restores the previous prose output; the
  format is part of the cache key.
- The over-expansion warning is now opt-in (`warnOnExpansion`), because structured
  expansion is the intended behavior.

### Fixed

- Long structured replies no longer fall back to the original text when the model
  emits a raw newline inside a JSON string value; the parser repairs that one
  defect instead of rejecting the reply.
- A reply cut off at the token limit is reported as its own MAX_TOKENS failure
  with the actionable fix (raise maxTokens), instead of a generic format error.
- Default maxTokens raised to 6000 so a full specification fits in one reply.

### Added

- **Composer button**: an icon-only sparkle button in the composer's tool row
  rewrites the draft in place. It spins while one model call runs, cancels on a
  second click, and shows a check on success. **Send** then appears beside it so
  the optimized prompt goes out without a second trip to the composer's send
  control, and **Undo** restores the previous draft in one click. Editing the
  optimized text drops both offers instead of overwriting the edit. Backed by one
  exact Host route (`/api/prompt-optimizer/optimize`) reachable only by the owner
  peer.
- `optimize_prompt` tool with typed parameters, a declared output schema, and
  persisted presentation metadata for the result card.
- `/optimize` command with `--mode`, `--goal`, `--template`, `--lang` and
  `--help`, running directly against the agent without creating a model message.
- System-prompt section telling the agent when to use the tool, and when not to.
- Three modes (user prompt, system prompt, single conversation message), six
  goals (clarity, structure, concise, professional, creative, technical), and
  six templates (generic, professional, analytical, concise, output-format,
  conversation).
- Protected-span verification for `{{var}}`, `${var}`, `$var`, `%s`/`%1$s`/`%d`,
  `<var>`, fenced and inline code, URLs, quoted literals, and numbers with two or
  more digits or a decimal/percent sign. A result that destroys any of them is
  rejected and the original text is returned instead.
- Input admission for empty, too short, too long, binary, and code-only input
  before any model request is made.
- Model routing: the model already configured in DSH by default, an
  OpenAI-compatible BYOK endpoint as an alternative, and automatic degradation
  from host to BYOK when the host route is unavailable and BYOK is configured.
- Failure classification (no model, auth, rate limit, timeout, network, bad
  response, aborted) with an actionable message for each.
- One exponential-backoff retry for rate limiting only; 4xx responses are never
  retried.
- Bounded in-memory result cache, LRU-evicted, ten-minute TTL by default.
- Result card in the Web client: optimized text, original for comparison, change
  summary, warnings, assumptions, copy button, and a "retry with another
  template" affordance that only fills the composer.
- Bilingual UI copy (zh/en) for tool descriptions, command help, card labels,
  warnings, and errors.

### Not in this version

- Quality scoring (six dimensions), template import/export, optimization
  history, favorites, A/B comparison, evaluation sets, and regression reports.
  See the "Not implemented" section of the README.
