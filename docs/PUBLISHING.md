# Publishing

Distributing this plugin has three layers. They are listed in dependency order:
the catalog only lists plugins that already exist on npm, and this repository's own
index works before either of the other two.

## 1. npm — the package identity

The name is `dsh-optimize-prompt`. It was free as of 2026-11-16; re-check before
every release attempt:

```sh
npm view dsh-optimize-prompt version    # E404 means the name is still free
```

Publish:

```sh
npm login
npm test && npm run check
npm pack --dry-run          # 23 files, ~50 kB tarball, no tests or .github
npm publish                 # publishConfig.access is public
```

`dsh plugin add dsh-optimize-prompt` works from this moment on.

> **Why not `dsh-prompt-optimizer`?** That name belongs to an unrelated project on
> npm (`winditer/dsh-prompt-optimizer`). Never publish this plugin under it.

## 2. The community catalog — how people actually find it

The catalog everyone's Discover tab points at is
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin). It is
both an Awesome list and a format-1 market index:
`https://awesome-dsh-plugin.com/index.json`, mirrored at
`https://dshmarket.com/index.json` and, npm-distributed,
`https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json`.

Its README states that the index only lists plugins **published on npm with an exact
version**, and that the market app pulls the list from that registry on every open. A
GitHub-only release can still be installed, but it will not appear in the catalog.

To get listed:

1. Read that repository's `README.md` and `CONTRIBUTING.md` and copy the exact row
   format it uses today — do not trust a format copied from here a month from now.
2. Add **one** entry under the closest category (prompt engineering / productivity),
   in the same shape as its neighbours, linking to
   `https://github.com/qing-gu-web/dsh-optimize-prompt`.
3. Open the PR. The site and the market pick the entry up automatically after merge,
   usually within a day.
4. Keep the entry's version and description in sync with future releases; a catalog
   entry that points at a stale version is worse than none.

## 3. This repository's own index — no review, works now

`index.json` in this repository is a valid format-1 index listing exactly one plugin.
It needs no approval and no merge:

```
https://raw.githubusercontent.com/qing-gu-web/dsh-optimize-prompt/main/index.json
```

In DSH: **Plugins → Discover → Manage index sources →** paste the URL. The entry then
appears with its icon, title, description and install action.

Regenerate it after every release:

```sh
node scripts/build-index.mjs
```

The script pins the current `HEAD` commit, so it must run **after** the code commit
and before committing `index.json`. Validate it against DSH's own parser:

```sh
MARKET_INDEX_VALIDATOR=/path/to/@deepseek-ai/dsh-plugin-market-index/lib/index.js \
  node scripts/build-index.mjs
```

### Switch the entry to npm once the package is published

A git source needs no registry but makes every install clone the repository. After
`npm publish`, prefer the registry:

```sh
DSH_INDEX_SOURCE=npm node scripts/build-index.mjs
```

## Release checklist

```sh
npm test && npm run check
# 1. bump "version" in package.json, add a CHANGELOG section
git commit -am "release: vX.Y.Z"
git tag vX.Y.Z
npm publish
# 2. regenerate the index, now pointing at the npm source
DSH_INDEX_SOURCE=npm node scripts/build-index.mjs
git commit -am "market: index for vX.Y.Z"
git push --follow-tags
```

Keep the catalog PR's version current in the same pass.

## Repository topics

Set these on GitHub so the repository itself is findable (Settings → Topics):

```
dsh  dsh-plugin  deepseek-harness  cordis  cordis-plugin
prompt-optimizer  prompt-engineering  plugin-market
```

`.github/workflows/ci.yml` runs the suite on Node 22 and 24 for every push and PR. A
green badge is part of the pitch: the first thing a visitor checks is whether the
tests still pass.
