import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const TEXT_DIR = join(homedir(), '.claude', 'oturumlar-metin')
const LIMIT = 40
const SNIPPET = 140
const FOLD = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' }

export function fold(text) {
  return text.toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, char => FOLD[char])
}

function snippetAround(line, at, length) {
  const start = Math.max(0, at - Math.floor((SNIPPET - length) / 2))
  const piece = line.slice(start, start + SNIPPET)
  return `${start > 0 ? '…' : ''}${piece}${start + SNIPPET < line.length ? '…' : ''}`
}

export function searchText(text, query) {
  const phrase = fold(query.trim())
  const terms = phrase.split(/\s+/).filter(term => term.length >= 2)
  if (terms.length === 0) return null
  const lines = text.split('\n')
  const folded = lines.map(fold)
  const whole = folded.join('\n')
  if (!terms.every(term => whole.includes(term))) return null

  let score = 0
  for (const term of terms) score += whole.split(term).length - 1
  const phraseHits = terms.length > 1 ? whole.split(phrase).length - 1 : 0
  score += phraseHits * 10

  const needle = phraseHits > 0 ? phrase : terms[0]
  const index = folded.findIndex(line => line.includes(needle))
  const line = lines[index] ?? ''
  return { score, snippet: snippetAround(line, folded[index].indexOf(needle), needle.length) }
}

export function searchAny(text, terms) {
  const whole = fold(text)
  const matched = []
  let count = 0
  for (const term of terms) {
    const hits = whole.split(fold(term)).length - 1
    if (hits > 0) matched.push(term)
    count += hits
  }
  return matched.length > 0 ? { score: matched.length * 100 + count, matched } : null
}

async function main() {
  const [mode, input = ''] = process.argv.slice(2)
  const terms = mode === 'any' ? JSON.parse(input).filter(term => typeof term === 'string' && term.trim().length >= 2) : []
  let names = []
  try {
    names = await readdir(TEXT_DIR)
  } catch {}
  const hits = []
  for (const name of names) {
    if (!name.endsWith('.txt') || name.startsWith('._')) continue
    const text = await readFile(join(TEXT_DIR, name), 'utf8')
    const found = mode === 'any' ? searchAny(text, terms) : searchText(text, input)
    if (found) hits.push({ sessionId: name.slice(0, -4), ...found })
  }
  hits.sort((a, b) => b.score - a.score)
  process.stdout.write(JSON.stringify({ hits: hits.slice(0, LIMIT) }))
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(String(error?.stack ?? error))
    process.exit(1)
  })
}
