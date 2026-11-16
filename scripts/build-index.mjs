#!/usr/bin/env node
/**
 * Regenerates index.json — the DSH plugin-market index (format 1) that makes
 * this plugin appear in DSH's Discover tab once a user adds its URL.
 *
 * Run after committing, then commit index.json: the entry pins a commit SHA,
 * and that commit must already contain everything the entry installs.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

// Card copy for Discover. Kept here rather than in package.json so the bundle
// manifest stays exactly what DSH's loader validates.
const MARKET = {
  index: {
    title: { en: 'Community DSH plugins', zh: '社区 DSH 插件' },
    description: {
      en: 'Plugins published from this repository.',
      zh: '本仓库发布的 DSH 插件。',
    },
  },
  plugin: {
    title: { en: 'Prompt optimizer', zh: '提示词优化' },
    description: {
      en: 'An icon button in the composer rewrites your draft into a numbered specification, then sends it in one click — with variables, code, URLs and numbers preserved byte for byte.',
      zh: '输入框里的图标按钮把草稿改写成分层编号的规格说明，一键即可发送；变量、代码、URL 与数字逐字保留。',
    },
  },
  dshRange: '>=0.2.2-rc.1',
}

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

function normalizeRemote(remote) {
  // git@github.com:owner/repo.git -> https://github.com/owner/repo
  const ssh = /^git@([^:]+):(.+?)(?:\.git)?$/u.exec(remote)
  if (ssh !== null) return `https://${ssh[1]}/${ssh[2]}`
  return remote.replace(/\.git$/u, '')
}

const commit = process.env.DSH_INDEX_COMMIT ?? git(['rev-parse', 'HEAD'])
const sourceType = process.env.DSH_INDEX_SOURCE === 'npm' ? 'npm' : 'git'
const publishTimestamp = Number(
  process.env.DSH_INDEX_TIMESTAMP
    ?? (sourceType === 'npm' ? Math.floor(Date.now() / 1000) : git(['log', '-1', '--format=%ct'])),
)
const repositoryUrl = normalizeRemote(
  process.env.DSH_INDEX_REPO ?? git(['config', '--get', 'remote.origin.url']) ?? '',
)

if (!/^[0-9a-f]{40}$/u.test(commit)) {
  console.error(`build-index: expected a 40-hex commit SHA, got ${JSON.stringify(commit)}`)
  process.exit(1)
}
if (!repositoryUrl.startsWith('http')) {
  console.error('build-index: set a git remote (origin) or DSH_INDEX_REPO')
  process.exit(1)
}

const index = {
  format: 1,
  title: MARKET.index.title,
  description: MARKET.index.description,
  plugins: [
    {
      name: manifest.name,
      title: MARKET.plugin.title,
      description: MARKET.plugin.description,
      icon: 'icon.svg',
      author: manifest.author?.name ?? undefined,
      homepage: repositoryUrl,
      repository: { url: repositoryUrl },
      versions: [
        {
          version: manifest.version,
          publishTimestamp,
          source: sourceType === 'npm'
            ? { type: 'npm' }
            : {
                type: 'git',
                url: repositoryUrl,
                commit,
              },
          engines: { dsh: MARKET.dshRange },
          icon: 'icon.svg',
        },
      ],
    },
  ],
}

// Drop undefined members so the file stays clean; the format ignores them anyway.
const clean = JSON.parse(JSON.stringify(index))
const target = join(root, 'index.json')
writeFileSync(target, `${JSON.stringify(clean, null, 2)}\n`, 'utf8')
console.log(`build-index: wrote index.json for ${manifest.name}@${manifest.version} at ${commit.slice(0, 7)}`)

const validatorPath = process.env.MARKET_INDEX_VALIDATOR
if (validatorPath !== undefined && existsSync(validatorPath)) {
  const specifier = validatorPath.startsWith('file:') ? validatorPath : pathToFileURL(validatorPath).href
  const { parseMarketIndex } = await import(specifier)
  const parsed = parseMarketIndex(clean, `https://example.invalid/index.json`)
  const plugin = parsed.plugins[0]
  console.log(`build-index: validated — ${plugin.versions.length} version(s), latest ${plugin.versions[0].version}`)
} else if (validatorPath !== undefined) {
  console.error('build-index: MARKET_INDEX_VALIDATOR does not exist; skipping validation')
  process.exitCode = 1
} else {
  console.log('build-index: set MARKET_INDEX_VALIDATOR to validate against DSH\'s own parser')
}
