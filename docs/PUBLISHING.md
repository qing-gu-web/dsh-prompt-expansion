# Publishing

This plugin is distributed **from this repository only**. There is no npm package,
and nothing here needs an npm account.

## 1. This repository's index — the working install path

`index.json` is a [format 1](https://github.com/deepseek-ai/deepseek-harness/blob/main/packages/util/plugin-market-index/README.md)
plugin-market index listing exactly this plugin, with the source pinned to a git
commit. Users add its URL in DSH and install from the list:

**Plugins → Discover → Manage index sources →**

```
https://raw.githubusercontent.com/qing-gu-web/dsh-prompt-expansion/main/index.json
```

No review, no registry, no build step. The entry resolves through pnpm as
`git+https://github.com/qing-gu-web/dsh-prompt-expansion.git#<commit>`, so an install
is reproducible and does not follow later commits.

### Regenerate it after every release

```sh
node scripts/build-index.mjs
```

The script reads `package.json` and the current git state, pins `HEAD`, and writes
`index.json`. It must run **after** the code commit and be committed separately:
the entry must point at a commit that already contains everything it installs.

Validate the output against DSH's own parser:

```sh
MARKET_INDEX_VALIDATOR=/path/to/@deepseek-ai/dsh-plugin-market-index/lib/index.js \
  node scripts/build-index.mjs
```

`MARKET_INDEX_VALIDATOR` accepts a path to the validator's `lib/index.js`; the script
imports it by absolute path and fails loudly on a bad field.

## 2. The community catalog — GitHub-only entry

[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) is
both an Awesome list and the index most users have in Discover. Its submission rules
accept a GitHub-only plugin: the entry appears in the list and is installable with the
command beside it. What GitHub-only entries do **not** get is a row in its shared
Discover index, because that index is built from registry releases with a known
version.

Submission is one file, never a README edit:

```
data/plugins/qing-gu-web__dsh-prompt-expansion.yml
```

```yaml
url: https://github.com/qing-gu-web/dsh-prompt-expansion
name: qing-gu-web/dsh-prompt-expansion
category: ui
description:
  en: A composer button, an /optimize command and an optimize_prompt tool that rewrite a prompt into a numbered specification, leaving variables, code blocks, URLs and numbers unchanged.
  zh: 输入框按钮、/optimize 命令与 optimize_prompt 工具，把提示词改写成分层编号的规格说明，并保持变量、代码块、URL 与数字不变。
```

Admission requirements, checked by their CI:

- `dsh.bundle` declared in `package.json` — ✅ `./cordis.patch.yml`
- repository at least **1 day old** — ✅ (created 2026-11-16)
- the `dsh-plugin` topic on the repository — ✅
- one file per plugin, accurate description, no marketing copy

Copy the row format from the repository's own `contributing.md` at submission time
rather than from here; the format moves.

## 3. npm — published

`dsh-prompt-expansion@0.1.0` is on the public registry, so
`dsh plugin add dsh-prompt-expansion` works and the community index can map the entry
to a version.

Publish with the official registry explicitly, because this machine's default registry
is a read-only mirror:

```sh
npm publish --registry=https://registry.npmjs.org/
DSH_INDEX_SOURCE=npm node scripts/build-index.mjs   # point the index at the registry
```

### Two behaviours that look like failures

**A brand-new package's first publish is staged.** npm creates a public placeholder at
`0.0.0-stage` ("Temporary package placeholder for staged publishing") and holds the real
version until it is approved. The CLI reports success and prints "being processed",
which is easy to mistake for a broken release. The approval happens in the browser
session `npm publish` opens, or at **npmjs.com → Staged Packages**. Until then
`npm view <name>@<version>` returns 404 while the placeholder is `latest`.

**Write actions need a second factor.** This account's 2FA is a security key, so there
is no 6-digit code to type and `--otp` cannot be used directly. The workable paths are
the browser approval flow that `npm publish` opens, a recovery code passed as `--otp`,
or clearing **Require two-factor authentication for write actions** on the account's
2FA page for the duration of the release. Keep the recovery codes saved: a
security-key-only account has no other way back in.

## Release checklist

```sh
npm test && npm run check
# 1. bump "version" in package.json and add a CHANGELOG section
git commit -am "release: vX.Y.Z"
git tag vX.Y.Z
# 2. publish, and finish the browser approval if npm opens one
npm publish --registry=https://registry.npmjs.org/
npm view dsh-prompt-expansion@X.Y.Z --prefer-online --registry=https://registry.npmjs.org/
# 3. regenerate the index against the registry and commit it separately
DSH_INDEX_SOURCE=npm node scripts/build-index.mjs
git commit -am "market: index for vX.Y.Z"
git push --follow-tags
```

Step 2's `npm view` must print the version before step 3 runs: an index that points at
a version the registry does not serve yet is worse than no index at all.

Codeload for `raw.githubusercontent.com` can lag a minute or two behind the push; the
index URL is live when that branch is.

## Repository topics

Set on GitHub (Settings → Topics):

```
dsh  dsh-plugin  deepseek-harness  cordis  cordis-plugin
prompt-optimizer  prompt-engineering  plugin-market
```

`.github/workflows/ci.yml` runs the suite on Node 22 and 24 for every push and PR.
