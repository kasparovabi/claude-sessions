import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { IndexedSession, Lang, LiveSession, LiveStatus, MeaningHit, SearchState, SessionRow, TextHit, TitleSource } from '../types'

const PANE = 'sessions'
const COMMANDS = ['oturumlar', 'sessions'] as const
const LIVE_MS = 5000
const INDEX_MS = 30000
const PAGE = 15
const TITLES_PER_PASS = 3
const MEANING_TERMS = 12
const MEANING_LIMIT = 10
const NODE_CANDIDATES = ['node', '/opt/homebrew/bin/node', '/usr/local/bin/node']
const ALIVE_CHECK =
  "for (const pid of process.argv.slice(1)) { try { process.kill(Number(pid), 0); console.log(pid) } catch (error) { if (/EPERM/.test(error.code)) console.log(pid) } }"
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export const TEXT = {
  tr: {
    units: ['sn', 'dk', 'sa', 'gün', 'ay'],
    newSession: 'yeni oturum',
    liveCount: (count: number) => `${count} aktif oturum`,
    exitCode: (code: number) => `çıkış kodu ${code}`,
    titleSystem:
      'Bir Claude Code oturumuna kısa başlık veriyorsun. Kullanıcının ilk mesajına bakıp işin konusunu 2-6 kelimelik Türkçe bir başlıkla yaz. Sadece başlığı yaz; tırnak, nokta, açıklama yok.',
    titlePrompt: (cwd: string, prompt: string) => `Klasör: ${cwd}\nİlk mesaj: ${prompt}`,
    meaningSystem:
      'Bir arama sorgusunu, kişinin Claude Code oturum kayıtlarında geçebilecek ilgili kelimelere genişletiyorsun. Sorgunun konusunu düşün; eş anlamlılar, yakın kavramlar, Türkçe ve İngilizce karşılıklar, ilgili teknik terimler ve araç adları yaz. Her satıra bir kelime ya da en fazla iki kelimelik öbek, en fazla 12 satır. Başka hiçbir şey yazma.',
    indexFailed: (error: string) => `Geçmiş oturumlar okunamadı: ${error}`,
    scanning: 'Oturumlar taranıyor…',
    scriptFailed: 'arama betiği çalışmadı',
    textSearch: 'mesaj araması',
    meaningSearch: 'anlam araması',
    and: ' ve ',
    searchFailed: (what: string) => `${what} yapılamadı`,
    saved: (name: string) => `"${name}" kaydedildi`,
    nameRemoved: 'Verdiğin ad kaldırıldı',
    pinnedToast: 'En üste sabitlendi',
    unpinnedToast: 'Sabitleme kaldırıldı',
    badId: 'Bu oturum açılamadı: oturum kimliği geçersiz',
    opening: (title: string) => `VS Code'da açılıyor: ${title}`,
    unreachable: (error: string) => `VS Code'a ulaşılamadı: ${error}`,
    command: 'oturumlar',
    commandDescription: 'Tüm Claude oturumlarını klasör klasör gösteren paneli aç',
    paneTitle: 'Oturumlar',
    paneOpened: 'Oturumlar paneli açıldı. Klasöre basınca açılır, oturuma basınca ad verebilirsin.',
    busy: 'çalışıyor',
    idle: 'boşta',
    self: ' (bu)',
    you: 'sen',
    byMeaning: (reason: string) => `anlamca: ${reason} geçiyor`,
    hereNow: 'Şu an bu oturumdasın',
    openElsewhere: 'Bu oturum zaten bir terminalde açık',
    open: "VS Code'da aç",
    pin: 'En üste sabitle',
    unpin: 'Sabitlemeyi kaldır',
    nameLabel: 'Ad: ',
    save: 'kaydet',
    firstMessage: 'İlk mesaj: ',
    searchLabel: 'Ara: ',
    searchPlaceholder: 'başlık ya da klasör; Enter ile tüm mesajlarda ve anlamca',
    searchSubmit: 'mesajlarda ara',
    searchHint: 'Enter: tüm mesajlarda ve anlamca ara',
    searching: 'Mesajlarda ve anlamca aranıyor…',
    searchSummary: (text: number, meaning: number) => `${text} oturumun mesajlarında geçiyor · ${meaning} oturum anlamca ilgili`,
    counts: (sessions: number, folders: number, live: number) => `${sessions} oturum · ${folders} klasör · ${live} aktif`,
    pinnedHeader: (count: number) => `★ Sabitlenenler ${count}`,
    folderLive: (count: number) => ` · ${count} aktif`,
    more: (count: number) => `    + ${count} oturum daha`,
  },
  en: {
    units: ['s', 'min', 'h', 'd', 'mo'],
    newSession: 'new session',
    liveCount: (count: number) => `${count} live session${count === 1 ? '' : 's'}`,
    exitCode: (code: number) => `exit code ${code}`,
    titleSystem:
      'You give a Claude Code session a short title. Read the user\'s first message and name the topic of the work in 2 to 6 English words. Write only the title: no quotes, no period, no explanation.',
    titlePrompt: (cwd: string, prompt: string) => `Folder: ${cwd}\nFirst message: ${prompt}`,
    meaningSystem:
      'You expand a search query into related words that could appear in the person\'s Claude Code session transcripts. Think about the topic of the query; write synonyms, close concepts, related technical terms and tool names. One word or a phrase of at most two words per line, at most 12 lines. Write nothing else.',
    indexFailed: (error: string) => `Could not read past sessions: ${error}`,
    scanning: 'Scanning sessions…',
    scriptFailed: 'the search script did not run',
    textSearch: 'message search',
    meaningSearch: 'meaning search',
    and: ' and ',
    searchFailed: (what: string) => `${what} failed`,
    saved: (name: string) => `Saved "${name}"`,
    nameRemoved: 'Your name for it was removed',
    pinnedToast: 'Pinned to the top',
    unpinnedToast: 'Unpinned',
    badId: 'Could not open this session: invalid session id',
    opening: (title: string) => `Opening in VS Code: ${title}`,
    unreachable: (error: string) => `Could not reach VS Code: ${error}`,
    command: 'sessions',
    commandDescription: 'Open the pane that lists every Claude session by folder',
    paneTitle: 'Sessions',
    paneOpened: 'Sessions pane opened. Press a folder to open it, press a session to name it.',
    busy: 'working',
    idle: 'idle',
    self: ' (this one)',
    you: 'you',
    byMeaning: (reason: string) => `by meaning: mentions ${reason}`,
    hereNow: 'You are in this session now',
    openElsewhere: 'This session is already open in a terminal',
    open: 'Open in VS Code',
    pin: 'Pin to top',
    unpin: 'Unpin',
    nameLabel: 'Name: ',
    save: 'save',
    firstMessage: 'First message: ',
    searchLabel: 'Search: ',
    searchPlaceholder: 'title or folder; Enter searches every message and by meaning',
    searchSubmit: 'search messages',
    searchHint: 'Enter: search every message and by meaning',
    searching: 'Searching messages and by meaning…',
    searchSummary: (text: number, meaning: number) => `found in the messages of ${text} sessions · ${meaning} related by meaning`,
    counts: (sessions: number, folders: number, live: number) => `${sessions} sessions · ${folders} folders · ${live} live`,
    pinnedHeader: (count: number) => `★ Pinned ${count}`,
    folderLive: (count: number) => ` · ${count} live`,
    more: (count: number) => `    + ${count} more sessions`,
  },
} as const

type Text = (typeof TEXT)[Lang]

const indexed = atom({ plugin: 'sessions', key: 'indexed' } as const, [])
const live = atom({ plugin: 'sessions', key: 'live' } as const, [])
const labels = atom({ plugin: 'sessions', key: 'labels' } as const, {})
const pinned = atom({ plugin: 'sessions', key: 'pinned' } as const, [])
const autoTitles = atom({ plugin: 'sessions', key: 'autoTitles' } as const, {})
const selfId = atom({ plugin: 'sessions', key: 'selfId' } as const, '')
const selectedId = atom({ plugin: 'sessions', key: 'selectedId' } as const, null)
const expanded = atom({ plugin: 'sessions', key: 'expanded' } as const, [])
const limits = atom({ plugin: 'sessions', key: 'limits' } as const, {})
const filter = atom({ plugin: 'sessions', key: 'filter' } as const, '')
const now = atom({ plugin: 'sessions', key: 'now' } as const, 0)
const indexNote = atom({ plugin: 'sessions', key: 'indexNote' } as const, null)
const appliedLabel = atom({ plugin: 'sessions', key: 'appliedLabel' } as const, null)
const search = atom({ plugin: 'sessions', key: 'search' } as const, null)
const lang = atom({ plugin: 'sessions', key: 'lang' } as const, 'en')

let isIndexing = false
let isTitling = false
let vscodeCli = ''
let osName: string | null = null
const failedTitles = new Set<string>()
const failedTranscripts = new Set<string>()

type LiveFile = {
  pid?: number
  sessionId?: string
  cwd?: string
  name?: string
  nameSource?: string
  status?: string
  kind?: string
  entrypoint?: string
  startedAt?: number
  updatedAt?: number
  statusUpdatedAt?: number
}

export type Folder = {
  cwd: string
  rows: SessionRow[]
  lastAt: number
  liveCount: number
}

export function pickLang(setting: unknown, locale: string): Lang {
  if (typeof setting === 'string' && setting.trim()) return /^(tr|turk|türk)/i.test(setting.trim()) ? 'tr' : 'en'
  return /^tr/i.test(locale) ? 'tr' : 'en'
}

export function formatAge(ms: number, language: Lang = 'tr'): string {
  const [sec, min, hour, day, month] = TEXT[language].units
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds} ${sec}`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} ${min}`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} ${hour}`
  const days = Math.round(hours / 24)
  if (days < 60) return `${days} ${day}`
  return `${Math.round(days / 30)} ${month}`
}

export function folderName(cwd: string): string {
  return cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? cwd
}

export function shortPath(cwd: string, home: string): string {
  return home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

function toLiveStatus(status: string | undefined): LiveStatus {
  return status === 'busy' ? 'busy' : status === 'idle' ? 'idle' : 'other'
}

export function toLiveSessions(files: readonly LiveFile[], alive: ReadonlySet<number> | null): LiveSession[] {
  const sessions: LiveSession[] = []
  for (const file of files) {
    if (!file.sessionId || typeof file.pid !== 'number') continue
    if (alive && !alive.has(file.pid)) continue
    sessions.push({
      sessionId: file.sessionId,
      cwd: file.cwd ?? '',
      name: file.name ?? null,
      isUserNamed: file.nameSource === 'user',
      status: toLiveStatus(file.status),
      changedAt: file.statusUpdatedAt ?? file.updatedAt ?? file.startedAt ?? 0,
      kind: file.kind ?? '',
      entrypoint: file.entrypoint ?? '',
    })
  }

  return sessions
}

function isUserLive(session: LiveSession): boolean {
  return session.kind === 'interactive' && !session.entrypoint.startsWith('sdk')
}

export function pickTitle(
  session: IndexedSession | null,
  liveSession: LiveSession | null,
  label: string | undefined,
  autoTitle: string | undefined,
  language: Lang = 'tr',
): { title: string; titleSource: TitleSource } {
  if (label) return { title: label, titleSource: 'label' }
  if (liveSession?.isUserNamed && liveSession.name) return { title: liveSession.name, titleSource: 'custom' }
  if (session?.customTitle) return { title: session.customTitle, titleSource: 'custom' }
  if (session?.aiTitle) return { title: session.aiTitle, titleSource: 'ai' }
  if (autoTitle) return { title: autoTitle, titleSource: 'auto' }
  if (session?.firstPrompt) return { title: clip(session.firstPrompt, 60), titleSource: 'prompt' }
  return { title: liveSession?.name ?? TEXT[language].newSession, titleSource: 'none' }
}

export function buildRows(
  indexedSessions: readonly IndexedSession[],
  liveSessions: readonly LiveSession[],
  labelMap: Readonly<Record<string, string>>,
  autoMap: Readonly<Record<string, string>>,
  self: string,
  language: Lang = 'tr',
): SessionRow[] {
  const liveById = new Map(liveSessions.map(session => [session.sessionId, session]))
  const rows: SessionRow[] = []
  const seen = new Set<string>()

  for (const session of indexedSessions) {
    if (seen.has(session.sessionId)) continue
    seen.add(session.sessionId)
    const liveSession = liveById.get(session.sessionId) ?? null
    rows.push({
      sessionId: session.sessionId,
      cwd: session.cwd,
      ...pickTitle(session, liveSession, labelMap[session.sessionId], autoMap[session.sessionId], language),
      firstPrompt: session.firstPrompt,
      lastAt: Math.max(session.lastAt, liveSession?.changedAt ?? 0),
      live: liveSession?.status ?? null,
      isSelf: session.sessionId === self,
    })
  }

  for (const liveSession of liveSessions) {
    if (seen.has(liveSession.sessionId)) continue
    if (!isUserLive(liveSession) && liveSession.sessionId !== self) continue
    seen.add(liveSession.sessionId)
    rows.push({
      sessionId: liveSession.sessionId,
      cwd: liveSession.cwd,
      ...pickTitle(null, liveSession, labelMap[liveSession.sessionId], autoMap[liveSession.sessionId], language),
      firstPrompt: null,
      lastAt: liveSession.changedAt,
      live: liveSession.status,
      isSelf: liveSession.sessionId === self,
    })
  }

  return rows
}

export function groupByFolder(rows: readonly SessionRow[]): Folder[] {
  const folders = new Map<string, Folder>()
  for (const row of rows) {
    const folder = folders.get(row.cwd) ?? { cwd: row.cwd, rows: [], lastAt: 0, liveCount: 0 }
    folder.rows.push(row)
    folder.lastAt = Math.max(folder.lastAt, row.lastAt)
    if (row.live) folder.liveCount += 1
    folders.set(row.cwd, folder)
  }
  for (const folder of folders.values()) {
    folder.rows.sort((a, b) => Number(Boolean(b.live)) - Number(Boolean(a.live)) || b.lastAt - a.lastAt)
  }

  return [...folders.values()].sort((a, b) => b.lastAt - a.lastAt)
}

const FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' }

export function fold(text: string): string {
  return text.toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, char => FOLD[char] ?? char)
}

export function matches(row: SessionRow, query: string): boolean {
  const needle = fold(query)
  return [row.title, row.cwd, row.firstPrompt ?? ''].some(text => fold(text).includes(needle))
}

export function parseTerms(text: string): string[] {
  const terms = text
    .split('\n')
    .map(line => line.replace(/^[\s\-*•\d.)]+/, '').replace(/[`"]/g, '').trim())
    .filter(term => term.length >= 2 && term.length <= 30 && term !== 'yok' && term !== 'none')
  return [...new Set(terms)].slice(0, MEANING_TERMS)
}

export function snippetLabel(snippet: string, language: Lang = 'tr'): string {
  return snippet.replace(/^(…?)S: /, `$1${TEXT[language].you}: `).replace(/^(…?)C: /, '$1Claude: ')
}

async function homeDir($: EngineInterface): Promise<string> {
  return (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? ''
}

async function words($: EngineInterface): Promise<Text> {
  return TEXT[await read($, lang)]
}

async function detectLang($: EngineInterface) {
  let setting: unknown
  try {
    setting = await $.settings.read({ key: 'language' })
  } catch {}
  const locale = (await $.env.get('LC_ALL')) || (await $.env.get('LC_MESSAGES')) || (await $.env.get('LANG')) || ''
  await update($, lang, () => pickLang(setting, locale))
}

async function readJsonMap($: EngineInterface, path: string): Promise<Record<string, string>> {
  try {
    const parsed = JSON.parse(await $.fs.read(path))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}

async function labelsPath($: EngineInterface): Promise<string> {
  return `${await homeDir($)}/.claude/oturum-adlari.json`
}

async function autoTitlesPath($: EngineInterface): Promise<string> {
  return `${await homeDir($)}/.claude/oturum-otomatik-adlari.json`
}

async function pinsPath($: EngineInterface): Promise<string> {
  return `${await homeDir($)}/.claude/oturum-sabitler.json`
}

async function readPins($: EngineInterface): Promise<string[]> {
  try {
    const parsed = JSON.parse(await $.fs.read(await pinsPath($)))
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

async function readLiveFiles($: EngineInterface): Promise<LiveFile[]> {
  const dir = `${await homeDir($)}/.claude/sessions`
  const files: LiveFile[] = []
  for (const entry of await $.fs.list(dir)) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.json') || entry.name.startsWith('._')) continue
    try {
      files.push(JSON.parse(await $.fs.read(`${dir}/${entry.name}`)) as LiveFile)
    } catch {}
  }

  return files
}

async function alivePids($: EngineInterface, pids: readonly number[]): Promise<Set<number> | null> {
  if (pids.length === 0) return new Set()
  const commands = [
    ['ps', '-o', 'pid=', '-p', pids.join(',')],
    ...NODE_CANDIDATES.map(node => [node, '-e', ALIVE_CHECK, ...pids.map(String)]),
  ]
  for (const argv of commands) {
    try {
      const { exitCode, stdout } = await $.process.run(argv)
      if (exitCode === 0) return new Set(stdout.split(/\s+/).filter(Boolean).map(Number))
    } catch {}
  }
  return null
}

async function applyOwnLabel($: EngineInterface, self: string, labelMap: Record<string, string>) {
  const label = labelMap[self]
  if (!label) return
  const own = (await read($, live)).find(session => session.sessionId === self)
  if (own?.isUserNamed && own.name === label) return
  if ((await read($, appliedLabel)) === label) return
  await update($, appliedLabel, () => label)
  try {
    await $.command.run({ command: 'rename', args: label })
  } catch {
    await update($, appliedLabel, () => null)
  }
}

async function refreshLive($: EngineInterface) {
  const [files, labelMap, pins, self, at, language] = await Promise.all([
    readLiveFiles($),
    readJsonMap($, await labelsPath($)),
    readPins($),
    $.session.id(),
    $.clock.now(),
    read($, lang),
  ])
  const alive = await alivePids($, files.flatMap(file => (typeof file.pid === 'number' ? [file.pid] : [])))
  const sessions = toLiveSessions(files, alive)
  await update($, live, () => sessions)
  await update($, labels, () => labelMap)
  await update($, pinned, () => pins)
  await update($, selfId, () => self)
  await update($, now, () => at)

  const rows = buildRows(await read($, indexed), sessions, labelMap, await read($, autoTitles), self, language)
  const own = rows.find(row => row.isSelf)
  const liveCount = TEXT[language].liveCount(rows.filter(row => row.live).length)
  $.ui.status(own ? `${own.title} · ${liveCount}` : liveCount)
  await applyOwnLabel($, self, labelMap)
}

async function runIndexer($: EngineInterface): Promise<IndexedSession[]> {
  const script = `${$.plugin.root}/scripts/index.mjs`
  const text = await words($)
  let lastError = ''
  for (const node of NODE_CANDIDATES) {
    try {
      const result = await $.process.run([node, script], { timeoutMs: 300000 })
      if (result.exitCode === 0) return (JSON.parse(result.stdout) as { sessions: IndexedSession[] }).sessions
      lastError = result.stderr.split('\n')[0] ?? text.exitCode(result.exitCode)
    } catch (error) {
      lastError = String(error)
    }
  }
  throw new Error(lastError)
}

async function generateTitles($: EngineInterface) {
  if (isTitling) return
  isTitling = true
  try {
    const text = await words($)
    const path = await autoTitlesPath($)
    const known = await readJsonMap($, path)
    const liveIds = new Set((await read($, live)).map(session => session.sessionId))
    const pending = (await read($, indexed))
      .filter(session => !session.customTitle && !session.aiTitle && session.firstPrompt)
      .filter(session => !known[session.sessionId] && !failedTitles.has(session.sessionId) && !liveIds.has(session.sessionId))
      .slice(0, TITLES_PER_PASS)
    for (const session of pending) {
      const reply = await $.model.complete({
        model: 'haiku',
        effort: 'low',
        maxTokens: 40,
        timeoutMs: 20000,
        system: text.titleSystem,
        prompt: text.titlePrompt(session.cwd, session.firstPrompt ?? ''),
      })
      const title = reply.isAnswered ? clip(reply.text.replace(/^["'“]+|["'”.]+$/g, ''), 60) : ''
      if (!title) {
        failedTitles.add(session.sessionId)
        continue
      }
      known[session.sessionId] = title
    }
    if (pending.length > 0) {
      await $.fs.write(path, `${JSON.stringify(known, null, 2)}\n`)
    }
    await update($, autoTitles, () => known)
  } finally {
    isTitling = false
  }
}

export function pendingTranscriptTitles(
  indexedSessions: readonly IndexedSession[],
  liveIds: ReadonlySet<string>,
  labelMap: Readonly<Record<string, string>>,
  failed: ReadonlySet<string>,
): { path: string; sessionId: string; title: string }[] {
  return indexedSessions.flatMap(session => {
    const label = labelMap[session.sessionId]
    if (!label || label === session.customTitle || liveIds.has(session.sessionId) || failed.has(session.sessionId)) return []
    return [{ path: session.path, sessionId: session.sessionId, title: label }]
  })
}

async function writeTranscriptTitles($: EngineInterface) {
  const liveIds = new Set((await read($, live)).map(session => session.sessionId))
  const pending = pendingTranscriptTitles(await read($, indexed), liveIds, await read($, labels), failedTranscripts)
  if (pending.length === 0) return
  const script = `${$.plugin.root}/scripts/set-titles.mjs`
  for (const node of NODE_CANDIDATES) {
    try {
      const result = await $.process.run([node, script], { stdin: JSON.stringify(pending), timeoutMs: 30000 })
      if (result.exitCode !== 0) continue
      const { skipped } = JSON.parse(result.stdout) as { skipped: string[] }
      for (const sessionId of skipped) failedTranscripts.add(sessionId)
      return
    } catch {}
  }
  for (const item of pending) failedTranscripts.add(item.sessionId)
}

async function refreshIndex($: EngineInterface) {
  if (isIndexing) return
  isIndexing = true
  try {
    const sessions = await runIndexer($)
    await update($, indexed, () => sessions)
    await update($, indexNote, () => null)
    await writeTranscriptTitles($)
    await generateTitles($)
  } catch (error) {
    const text = await words($)
    await update($, indexNote, () => text.indexFailed(clip(String(error), 120)))
  } finally {
    isIndexing = false
  }
}

async function isPersonSession($: EngineInterface, start: { surface: unknown; isInteractive: boolean }): Promise<boolean> {
  const entrypoint = (await $.env.get('CLAUDE_CODE_ENTRYPOINT')) ?? ''
  if (entrypoint.startsWith('sdk')) return false
  return start.isInteractive || start.surface !== null
}

async function runSearchScript<T>($: EngineInterface, args: readonly string[]): Promise<T[]> {
  const script = `${$.plugin.root}/scripts/search.mjs`
  for (const node of NODE_CANDIDATES) {
    try {
      const result = await $.process.run([node, script, ...args], { timeoutMs: 30000 })
      if (result.exitCode === 0) return (JSON.parse(result.stdout) as { hits: T[] }).hits
    } catch {}
  }
  throw new Error((await words($)).scriptFailed)
}

async function searchMessages($: EngineInterface, query: string): Promise<TextHit[]> {
  return runSearchScript<TextHit>($, ['all', query])
}

async function searchMeaning($: EngineInterface, query: string): Promise<MeaningHit[]> {
  const reply = await $.model.complete({
    model: 'haiku',
    effort: 'low',
    maxTokens: 300,
    timeoutMs: 30000,
    system: (await words($)).meaningSystem,
    prompt: query,
  })
  if (!reply.isAnswered) throw new Error(reply.reason)
  const terms = parseTerms(reply.text)
  if (terms.length === 0) return []
  const hits = await runSearchScript<{ sessionId: string; matched: string[] }>($, ['any', JSON.stringify(terms)])
  return hits.slice(0, MEANING_LIMIT).map(hit => ({ sessionId: hit.sessionId, reason: hit.matched.slice(0, 4).join(', ') }))
}

async function runSearch($: EngineInterface, raw: string) {
  const query = raw.trim()
  if (fold(query).replace(/\s/g, '').length < 2) {
    await update($, search, () => null)
    return
  }
  const text = await words($)
  await update($, search, () => ({ query, isRunning: true, text: [], meaning: [], note: null }))
  const [found, meaning] = await Promise.allSettled([searchMessages($, query), searchMeaning($, query)])
  const failed = [found.status === 'rejected' ? text.textSearch : '', meaning.status === 'rejected' ? text.meaningSearch : '']
    .filter(Boolean)
    .join(text.and)
  const done: SearchState = {
    query,
    isRunning: false,
    text: found.status === 'fulfilled' ? found.value : [],
    meaning: meaning.status === 'fulfilled' ? meaning.value : [],
    note: failed ? text.searchFailed(failed) : null,
  }
  await update($, search, current => (current?.query === query ? done : current))
}

async function quietly(work: Promise<void>) {
  try {
    await work
  } catch {}
}

async function startUp($: EngineInterface) {
  await quietly(refreshLive($))
  const self = await read($, selfId)
  const own = (await read($, live)).find(session => session.sessionId === self)
  if (own?.cwd) await update($, expanded, list => (list.includes(own.cwd) ? list : [...list, own.cwd]))
  const scanning = (await words($)).scanning
  if ((await read($, indexed)).length === 0) await update($, indexNote, () => scanning)
  void quietly(refreshIndex($))
}

async function saveName($: EngineInterface, sessionId: string, value: string) {
  const name = value.trim()
  const path = await labelsPath($)
  const labelMap = await readJsonMap($, path)
  if (name) labelMap[sessionId] = name
  else delete labelMap[sessionId]
  await $.fs.write(path, `${JSON.stringify(labelMap, null, 2)}\n`)
  await update($, selectedId, () => null)
  await refreshLive($)
  void quietly(refreshIndex($))
  const text = await words($)
  $.ui.toast(name ? text.saved(name) : text.nameRemoved)
}

async function togglePin($: EngineInterface, sessionId: string) {
  const pins = await readPins($)
  const isPinned = pins.includes(sessionId)
  const next = isPinned ? pins.filter(id => id !== sessionId) : [sessionId, ...pins]
  await $.fs.write(await pinsPath($), `${JSON.stringify(next, null, 2)}\n`)
  await update($, pinned, () => next)
  const text = await words($)
  $.ui.toast(isPinned ? text.unpinnedToast : text.pinnedToast)
}

async function toggleFolder($: EngineInterface, cwd: string) {
  await update($, expanded, list => (list.includes(cwd) ? list.filter(one => one !== cwd) : [...list, cwd]))
}

async function showMore($: EngineInterface, cwd: string) {
  await update($, limits, map => ({ ...map, [cwd]: (map[cwd] ?? PAGE) + PAGE }))
}

async function toggleSelected($: EngineInterface, sessionId: string) {
  await update($, selectedId, current => (current === sessionId ? null : sessionId))
}

export function resumeUrl(sessionId: string, title: string): string | null {
  if (!SESSION_ID.test(sessionId)) return null
  return `vscode://kasparov.oturumlar-ac/resume?session=${sessionId}&title=${encodeURIComponent(title.slice(0, 60))}`
}

export function openCommand(url: string, os: string, cli: string): string[] {
  if (cli) return [cli, '--open-url', url]
  if (os === 'Windows_NT') return ['rundll32', 'url.dll,FileProtocolHandler', url]
  return os === 'Darwin' ? ['open', url] : ['xdg-open', url]
}

async function systemName($: EngineInterface): Promise<string> {
  if (osName !== null) return osName
  if ((await $.env.get('OS')) === 'Windows_NT') osName = 'Windows_NT'
  else {
    try {
      osName = (await $.process.run(['uname', '-s'])).stdout.trim()
    } catch {
      osName = ''
    }
  }
  return osName
}

async function openInVSCode($: EngineInterface, row: SessionRow) {
  const text = await words($)
  const url = resumeUrl(row.sessionId, row.title)
  if (!url) {
    $.ui.toast(text.badId)
    return
  }
  const result = await $.process.run(openCommand(url, await systemName($), vscodeCli))
  $.ui.toast(result.exitCode === 0 ? text.opening(row.title) : text.unreachable(clip(result.stderr, 120)))
}

async function openPane($: EngineInterface) {
  await detectLang($)
  await quietly(refreshLive($))
  void quietly(refreshIndex($))
  const text = await words($)
  await $.ui.open({ id: PANE, title: text.paneTitle, focus: true })
  return { text: text.paneOpened }
}

export const register: Register = (on, options) => {
  vscodeCli = typeof options.vscodeCli === 'string' ? options.vscodeCli.trim() : ''

  on('session.start', async ($, e, next) => {
    if (!(await isPersonSession($, e))) return next(e)
    await detectLang($)
    const text = await words($)
    await $.command.register({ name: text.command, description: text.commandDescription })
    await startUp($)
    $.clock.every(LIVE_MS, () => quietly(refreshLive($)))
    $.clock.every(INDEX_MS, () => quietly(refreshIndex($)))
    void $.ui.open({ id: PANE, title: text.paneTitle })

    return next(e)
  })

  for (const command of COMMANDS) on('command.run', { command }, async $ => openPane($))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Button } = elements
    const Input = 'Input' in elements ? elements.Input : null
    const [indexedSessions, liveSessions, labelMap, pins, autoMap, self, picked, open, pageLimits, query, at, note, found, language] =
      await Promise.all([
        read($, indexed),
        read($, live),
        read($, labels),
        read($, pinned),
        read($, autoTitles),
        read($, selfId),
        read($, selectedId),
        read($, expanded),
        read($, limits),
        read($, filter),
        read($, now),
        read($, indexNote),
        read($, search),
        read($, lang),
      ])
    const text = TEXT[language]
    const home = await homeDir($)
    const all = buildRows(indexedSessions, liveSessions, labelMap, autoMap, self, language)
    const searching = query.trim().length > 0
    const results = found && found.query === query.trim() ? found : null
    const textById = new Map((results?.text ?? []).map(hit => [hit.sessionId, hit]))
    const meaningById = new Map((results?.meaning ?? []).map(hit => [hit.sessionId, hit]))
    const isFound = (row: SessionRow) =>
      matches(row, query.trim()) || textById.has(row.sessionId) || meaningById.has(row.sessionId)
    const visible = searching ? all.filter(isFound) : all
    const visibleById = new Map(visible.map(row => [row.sessionId, row]))
    const pinnedRows = pins.flatMap(id => visibleById.get(id) ?? [])
    const folders = groupByFolder(visible.filter(row => !pins.includes(row.sessionId)))
    const liveCount = all.filter(row => row.live).length

    const renderRow = (row: SessionRow, isPinned: boolean) => (
      <Box key={`o-${row.sessionId}`} flexDirection="column">
        <Button key={row.sessionId} plain onPress={() => toggleSelected($, row.sessionId)}>
          <Text color={row.live === 'busy' ? 'yellow' : row.live ? 'green' : undefined} dimColor={!row.live}>
            {row.live ? '  ● ' : '  ○ '}
          </Text>
          <Text italic={row.titleSource === 'prompt'}>{row.title}</Text>
          <Text dimColor>
            {isPinned ? ` · ${folderName(row.cwd) || '/'}` : ''}
            {` · ${row.live === 'busy' ? text.busy : row.live === 'idle' ? text.idle : formatAge(at - row.lastAt, language)}`}
            {row.isSelf ? text.self : ''}
          </Text>
        </Button>
        {textById.has(row.sessionId) && (
          <Text dimColor wrap="truncate-end">{`      ${snippetLabel(textById.get(row.sessionId)?.snippet ?? '', language)}`}</Text>
        )}
        {meaningById.has(row.sessionId) && (
          <Text color="cyan" wrap="truncate-end">{`      ${text.byMeaning(meaningById.get(row.sessionId)?.reason ?? '')}`}</Text>
        )}
        {picked === row.sessionId && (
          <Box flexDirection="column" marginLeft={4}>
            {row.live ? (
              <Text dimColor>{row.isSelf ? text.hereNow : text.openElsewhere}</Text>
            ) : (
              <Button key={`ac-${row.sessionId}`} variant="primary" autoFocus onPress={() => openInVSCode($, row)}>
                {text.open}
              </Button>
            )}
            <Button key={`sabitle-${row.sessionId}`} onPress={() => togglePin($, row.sessionId)}>
              {isPinned ? text.unpin : text.pin}
            </Button>
            {Input && (
              <Input
                key={`ad-${row.sessionId}`}
                label={text.nameLabel}
                placeholder={row.title}
                value={labelMap[row.sessionId] ?? ''}
                submitLabel={text.save}
                onSubmit={(value: string) => saveName($, row.sessionId, value)}
              />
            )}
            <Text dimColor wrap="truncate-end">{`claude --resume ${row.sessionId}`}</Text>
            {row.firstPrompt && <Text dimColor wrap="truncate-end">{`${text.firstMessage}${clip(row.firstPrompt, 200)}`}</Text>}
          </Box>
        )}
      </Box>
    )

    return (
      <Box flexDirection="column">
        {Input && (
          <Input
            key="ara"
            label={text.searchLabel}
            placeholder={text.searchPlaceholder}
            value={query}
            submitLabel={text.searchSubmit}
            onInput={(value: string) => update($, filter, () => value)}
            onSubmit={async (value: string) => {
              await update($, filter, () => value)
              await runSearch($, value)
            }}
          />
        )}
        {searching && !results && <Text dimColor>{text.searchHint}</Text>}
        {results?.isRunning && <Text color="yellow">{text.searching}</Text>}
        {results && !results.isRunning && (
          <Text dimColor>
            {text.searchSummary(results.text.length, results.meaning.length)}
            {results.note ? ` · ${results.note}` : ''}
          </Text>
        )}
        <Text dimColor>{text.counts(all.length, folders.length, liveCount)}</Text>
        {note && <Text color="yellow">{note}</Text>}
        {pinnedRows.length > 0 && (
          <Box key="sabitler" flexDirection="column" marginTop={1}>
            <Text bold>{text.pinnedHeader(pinnedRows.length)}</Text>
            {pinnedRows.map(row => renderRow(row, true))}
          </Box>
        )}
        {folders.map(folder => {
          const isOpen = searching || open.includes(folder.cwd)
          const limit = searching ? folder.rows.length : (pageLimits[folder.cwd] ?? PAGE)
          return (
            <Box key={`k-${folder.cwd}`} flexDirection="column" marginTop={1}>
              <Button key={`klasor:${folder.cwd}`} plain onPress={() => toggleFolder($, folder.cwd)}>
                <Text bold>
                  {isOpen ? '▾ ' : '▸ '}
                  {folderName(folder.cwd) || '/'}
                </Text>
                <Text dimColor>{` ${folder.rows.length} · ${formatAge(at - folder.lastAt, language)}`}</Text>
                <Text color="yellow">{folder.liveCount > 0 ? text.folderLive(folder.liveCount) : ''}</Text>
              </Button>
              {isOpen && <Text dimColor wrap="truncate-middle">{`  ${shortPath(folder.cwd, home)}`}</Text>}
              {isOpen && folder.rows.slice(0, limit).map(row => renderRow(row, false))}
              {isOpen && folder.rows.length > limit && (
                <Button key={`fazla:${folder.cwd}`} plain dimColor onPress={() => showMore($, folder.cwd)}>
                  {text.more(folder.rows.length - limit)}
                </Button>
              )}
            </Box>
          )
        })}
      </Box>
    )
  })
}
