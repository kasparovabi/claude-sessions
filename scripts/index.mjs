import { createReadStream } from 'node:fs'
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

const CACHE_VERSION = 5
const PROJECTS = process.argv[2] ?? join(homedir(), '.claude', 'projects')
const CACHE = process.argv[3] ?? join(homedir(), '.claude', 'oturumlar-index.json')
const TEXT_DIR = process.argv[4] ?? join(homedir(), '.claude', 'oturumlar-metin')
const SNIFF_LINES = 400

function isUserStarted(entrypoint) {
  return typeof entrypoint === 'string' && !entrypoint.startsWith('sdk')
}

function isListed(info) {
  return isUserStarted(info.entrypoint) && info.sessionId && info.cwd && (info.humanPrompts > 0 || info.customTitle)
}

function blockText(content) {
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.filter(block => block?.type === 'text').map(block => block.text).join(' ')
      : ''
  return text.replace(/\s+/g, ' ').trim()
}

function promptText(entry) {
  if (entry.type !== 'user' || entry.isMeta || entry.isSidechain) return null
  const clean = blockText(entry.message?.content)
  if (!clean || clean.startsWith('<') || clean.startsWith('[Request interrupted')) return null
  return clean
}

function replyText(entry) {
  if (entry.type !== 'assistant' || entry.isSidechain) return null
  return blockText(entry.message?.content) || null
}

async function parse(path) {
  const info = {
    entrypoint: null,
    cwd: null,
    sessionId: null,
    firstPrompt: null,
    aiTitle: null,
    customTitle: null,
    startedAt: 0,
    lastAt: 0,
    prompts: 0,
    humanPrompts: 0,
    messages: [],
  }
  const lines = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity })
  let count = 0
  for await (const line of lines) {
    count += 1
    if (!line) continue
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (entry.type === 'ai-title' && entry.aiTitle) info.aiTitle = entry.aiTitle
    else if (entry.type === 'custom-title') info.customTitle = entry.customTitle || null
    if (!info.entrypoint && entry.entrypoint) info.entrypoint = entry.entrypoint
    if (!info.cwd && entry.cwd) info.cwd = entry.cwd
    if (!info.sessionId && entry.sessionId) info.sessionId = entry.sessionId
    if (entry.timestamp) {
      const at = Date.parse(entry.timestamp)
      if (at) {
        if (!info.startedAt) info.startedAt = at
        info.lastAt = at
      }
    }
    const prompt = promptText(entry)
    if (prompt) {
      info.prompts += 1
      if (entry.origin?.kind === 'human' || entry.promptSource === 'typed') info.humanPrompts += 1
      if (!info.firstPrompt) info.firstPrompt = prompt.slice(0, 400)
      info.messages.push(`S: ${prompt}`)
    }
    const reply = replyText(entry)
    if (reply) info.messages.push(`C: ${reply}`)
    if (count === SNIFF_LINES && info.entrypoint && !isUserStarted(info.entrypoint)) {
      lines.close()
      break
    }
  }
  return info
}

async function loadCache() {
  try {
    const cache = JSON.parse(await readFile(CACHE, 'utf8'))
    return cache.version === CACHE_VERSION ? cache.files : {}
  } catch {
    return {}
  }
}

async function main() {
  const previous = await loadCache()
  const files = {}
  const dirs = await readdir(PROJECTS, { withFileTypes: true })
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue
    let names
    try {
      names = await readdir(join(PROJECTS, dir.name))
    } catch {
      continue
    }
    for (const name of names) {
      if (!name.endsWith('.jsonl') || name.startsWith('._')) continue
      const path = join(PROJECTS, dir.name, name)
      const old = previous[path]
      if (old && old.entrypoint && !isUserStarted(old.entrypoint)) {
        files[path] = old
        continue
      }
      let stats
      try {
        stats = await stat(path)
      } catch {
        continue
      }
      if (old && old.mtimeMs === stats.mtimeMs && old.size === stats.size) {
        files[path] = old
        continue
      }
      try {
        const { messages, ...info } = await parse(path)
        if (isListed(info)) {
          await mkdir(TEXT_DIR, { recursive: true })
          await writeFile(join(TEXT_DIR, `${info.sessionId}.txt`), `${messages.join('\n')}\n`)
        }
        files[path] = { ...info, mtimeMs: stats.mtimeMs, size: stats.size }
      } catch {}
    }
  }

  const temp = `${CACHE}.${process.pid}.tmp`
  await writeFile(temp, JSON.stringify({ version: CACHE_VERSION, files }))
  await rename(temp, CACHE)

  const sessions = Object.entries(files)
    .filter(([, info]) => isListed(info))
    .map(([path, info]) => ({
      sessionId: info.sessionId,
      cwd: info.cwd,
      customTitle: info.customTitle,
      aiTitle: info.aiTitle,
      firstPrompt: info.firstPrompt,
      startedAt: info.startedAt,
      lastAt: info.lastAt || info.mtimeMs,
      prompts: info.prompts,
      entrypoint: info.entrypoint,
      path,
    }))
  process.stdout.write(JSON.stringify({ sessions }))
}

main().catch(error => {
  process.stderr.write(String(error?.stack ?? error))
  process.exit(1)
})
