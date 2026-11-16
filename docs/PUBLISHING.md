# Adding the plugin to DSH Discover

DSH's Discover tab reads **plugin indexes** — JSON documents in [format 1](https://github.com/deepseek-ai/deepseek-harness/blob/main/packages/util/plugin-market-index/README.md). No index source ships by default, so a plugin becomes discoverable when a user adds the index URL that lists it.

This repository ships one: `index.json`, served straight from the default branch.

## Generate it

```sh
node scripts/build-index.mjs
```

The script reads `package.json` and the current git state, then writes `index.json`:

- `version` — `package.json` `version`
- `publishTimestamp` — the HEAD commit time, in Unix seconds
- `source.commit` — the HEAD commit SHA, so an install is pinned to a real tree
- `source.type: "git"` — installs with `git+https://…#<commit>`, no npm account needed

Run it **after** committing, then commit `index.json` itself. That ordering matters: the index must point at a commit that already contains everything it installs.

## Validate it

```sh
MARKET_INDEX_VALIDATOR=/path/to/@deepseek-ai/dsh-plugin-market-index/lib/index.js \
  node scripts/build-index.mjs
```

Setting that variable makes the script validate its own output with the same validator DSH uses, and fail loudly on a bad field. Without it the script still writes a document, and CI checks only that the JSON parses.

## Use it

In DSH, open **Discover**, add a plugin index, and paste:

```
https://raw.githubusercontent.com/qing-gu-web/dsh-optimize-prompt/main/index.json
```

The entry then appears in Discover with its icon, title, description and install action. `dsh plugin add <package>@<version>` keeps working as the manual path.
