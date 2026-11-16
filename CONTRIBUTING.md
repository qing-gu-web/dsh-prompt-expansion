# Contributing

Thanks for helping. This plugin makes a few promises to its users; a change that
breaks one needs a very good argument, not just a passing test suite.

## Set up

```sh
git clone https://github.com/qing-gu-web/dsh-optimize-prompt.git
cd dsh-optimize-prompt
node --version        # ^22.15.0 || >=24.0.0
npm test              # 50 engine/route checks + 6 client bundle states
npm run check         # syntax check every shipped module
```

No dependencies to install, no build step. The Client half is loaded as a plain
Cordis bundle by DSH.

## Try a change in a live DSH

1. In DSH: **Plugins → Add plugin →** point at this directory (it links, it does
   not copy).
2. Enable the row, then **start a new session** — the tool, command and button are
   registered at activation.
3. After a Host-side change, toggle the plugin off and on so a fresh module
   generation loads. After a Client-side change, refresh the page.

## Invariants

These are the reasons the plugin exists. Tests cover them; keep it that way.

1. **Nothing is rewritten or sent without a click.** The optimizer never edits the
   draft on its own and never submits a message. `Send` exists only as an explicit
   user action after a visible result.
2. **Protected spans survive.** Variables (`{{var}}`, `${var}`, `$var`, `%s`,
   `<var>`), fenced and inline code, URLs, quoted literals, and numbers with two or
   more digits or a unit. A result that destroys one is rejected and the original
   text is returned with an explanation. Do not relax this to make a model's output
   pass.
3. **No invented facts.** Filling in conventional implementation detail is
   intended and encouraged — that is what the structured output is for. Inventing
   data, names, links, or citations is not, and added detail may never contradict
   the original.
4. **The key never leaks.** It is not logged, not returned, not placed in a
   prompt, and not sent anywhere but the endpoint that needs it.
5. **The composer route stays owner-only.** `/api/prompt-optimizer/optimize` is an
   exact Fetch route; DSH admits only the owner peer. Do not add a second,
   unauthenticated path.
6. **Failure is a fallback, not an exception.** Provider errors, format errors and
   truncation all return the original text plus an actionable message.

## Changing the optimizer's behaviour

The instructions the model receives live in `lib/prompts.js`; the deterministic
parts (validation, protection, shape normalisation, caching) live in `lib/` next to
it. Prefer changing the deterministic side when a behaviour must be guaranteed —
prompts influence, code enforces.

When you change the output contract, update `tests/selftest.mjs` (it asserts the
shape rules string by string) and the "Output shape" section of both READMEs.

## Adding an i18n string

Every user-visible string goes through `lib/i18n.js` (Host) or the `zh`/`en`
dictionaries in `client.js` (Client). Add both languages; a missing English entry
falls back to the key, which is a visible bug.

## Releasing

```sh
npm test
npm run check
# bump "version" in package.json and add a CHANGELOG entry
git commit -am "release: vX.Y.Z"
git tag vX.Y.Z
node scripts/build-index.mjs      # after committing — it pins the new SHA
git commit -am "market: index for vX.Y.Z"
git push --follow-tags
npm publish                        # only if the npm package is part of the release
```

The repository's `index.json` is what DSH's Discover tab reads; see
[docs/PUBLISHING.md](docs/PUBLISHING.md). It must be committed **after** the code it
points at.

## Reporting a model problem

Use the **Model compatibility** issue form. Include the provider, model id, the
flags you used, and a redacted input that keeps variables and code fences intact —
those are exactly what the protections act on.

## Privacy of reports

Never paste an API key, and do not paste a prompt you cannot share. Redact private
content with `X`, keep the structure.
