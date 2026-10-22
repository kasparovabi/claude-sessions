const vscode = require('vscode')
const { execFile } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const readline = require('node:readline')

const { SESSION_ID, claudeSessions, cleanTitle, isRestorable, matchRevived, nextTracked, parseProcessTable, resumeLine, sessionsByShell, snapshot, transcriptTitle } = require('./restore')

const PROJECTS = path.join(os.homedir(), '.claude', 'projects')
const SESSIONS = path.join(os.homedir(), '.claude', 'sessions')
const NAMES = path.join(os.homedir(), '.claude', 'oturum-adlari.json')
const AUTO_NAMES = path.join(os.homedir(), '.claude', 'oturum-otomatik-adlari.json')
const CLAUDE = path.join(os.homedir(), '.local', 'bin', 'claude')
const STATE_KEY = 'oturumlar.terminals'
const TICK_MS = 10000
const REVIVE_WAIT_MS = 4000
const FIRST_GROUP = { viewColumn: vscode.ViewColumn.One }

let tracked = new Map()
let isShuttingDown = false

function findTranscript(sessionId) {
  for (const dir of fs.readdirSync(PROJECTS)) {
    const file = path.join(PROJECTS, dir, `${sessionId}.jsonl`)
    if (fs.existsSync(file)) return file
  }
  return null
}

async function cwdOf(file) {
  const lines = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity })
  try {
    for await (const line of lines) {
      if (!line.includes('"cwd"')) continue
      try {
        const { cwd } = JSON.parse(line)
        if (typeof cwd === 'string' && cwd) return cwd
      } catch {}
    }
  } finally {
    lines.close()
  }
  return null
}

function readNames(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return {}
  }
}

function sessionTitle(sessionId, names, autoNames) {
  if (typeof names[sessionId] === 'string') return names[sessionId]
  const transcript = findTranscript(sessionId)
  let fromTranscript = null
  try {
    fromTranscript = transcript && transcriptTitle(fs.readFileSync(transcript, 'utf8'))
  } catch {}
  return fromTranscript ?? (typeof autoNames[sessionId] === 'string' ? autoNames[sessionId] : null)
}

function processTable() {
  const [command, args] =
    process.platform === 'win32'
      ? ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_Process | ForEach-Object { "{0} {1} {2}" -f $_.ProcessId, $_.ParentProcessId, $_.CommandLine }']]
      : ['ps', ['-A', '-o', 'pid=,ppid=,command=']]
  return new Promise(resolve => {
    execFile(command, args, { timeout: 15000, windowsHide: true, maxBuffer: 32 * 1024 * 1024 }, (error, stdout) => {
      resolve(error ? null : parseProcessTable(stdout))
    })
  })
}

const transcriptCwds = new Map()

async function transcriptCwd(sessionId) {
  if (!transcriptCwds.has(sessionId)) {
    const transcript = findTranscript(sessionId)
    transcriptCwds.set(sessionId, transcript ? await cwdOf(transcript) : null)
  }
  return transcriptCwds.get(sessionId)
}

function readSessionFiles() {
  let names = []
  try {
    names = fs.readdirSync(SESSIONS)
  } catch {}
  return names.flatMap(name => {
    if (!name.endsWith('.json') || name.startsWith('._')) return []
    try {
      const file = JSON.parse(fs.readFileSync(path.join(SESSIONS, name), 'utf8'))
      if (typeof file.pid !== 'number' || !SESSION_ID.test(file.sessionId ?? '')) return []
      if (file.kind && file.kind !== 'interactive') return []
      return [{ pid: file.pid, sessionId: file.sessionId, cwd: file.cwd ?? '' }]
    } catch {
      return []
    }
  })
}

async function currentTerminals() {
  const terminals = vscode.window.terminals
  const shellPids = await Promise.all(terminals.map(terminal => terminal.processId))
  return terminals.map((terminal, index) => ({ terminal, name: terminal.name, shellPid: shellPids[index] }))
}

async function liveByShell(terminals) {
  const table = await processTable()
  if (!table) return null
  const live = claudeSessions(table, readSessionFiles())
  const byShell = sessionsByShell(live, table, new Set(terminals.flatMap(one => (one.shellPid ? [one.shellPid] : []))))
  for (const [shell, session] of byShell) {
    if (!session.cwd) byShell.set(shell, { ...session, cwd: await transcriptCwd(session.sessionId) })
  }
  return { byShell, liveIds: new Set(live.map(session => session.sessionId)), busyShells: new Set([...table.values()].map(row => row.ppid)) }
}

async function save(context, terminals) {
  if (isShuttingDown) return
  await context.workspaceState.update(STATE_KEY, snapshot(terminals ?? (await currentTerminals()), tracked))
}

async function tick(context) {
  if (isShuttingDown) return
  const terminals = await currentTerminals()
  const live = await liveByShell(terminals)
  if (!live) return
  tracked = nextTracked(terminals, tracked, live.byShell)
  await save(context, terminals)
}

function startClaude(terminal, cwd, sessionId) {
  terminal.sendText(resumeLine(process.platform, cwd, sessionId, fs.existsSync(CLAUDE) ? CLAUDE : 'claude', vscode.workspace.getConfiguration('claudeSessions').get('skipPermissions', false)))
}

async function restore(context) {
  const saved = context.workspaceState.get(STATE_KEY, [])
  if (!Array.isArray(saved) || saved.length === 0) return
  const terminals = await currentTerminals()
  const live = await liveByShell(terminals)
  if (!live) return
  const pending = saved.filter(entry => isRestorable(entry) && !live.liveIds.has(entry.sessionId) && fs.existsSync(entry.cwd))
  const isFree = index => {
    const shellPid = terminals[index]?.shellPid
    return Boolean(shellPid) && !live.busyShells.has(shellPid)
  }
  const matches = matchRevived(pending, terminals.map(one => one.name), isFree)
  const wasActive = vscode.window.activeTerminal
  const names = readNames(NAMES)
  const autoNames = readNames(AUTO_NAMES)
  for (const [savedIndex, entry] of pending.entries()) {
    const title = cleanTitle(sessionTitle(entry.sessionId, names, autoNames) ?? entry.name ?? '') || 'Claude'
    const spot = matches.get(savedIndex)
    const terminal = spot === undefined ? vscode.window.createTerminal({ name: title, cwd: entry.cwd, location: FIRST_GROUP }) : terminals[spot].terminal
    tracked.set(terminal, { sessionId: entry.sessionId, cwd: entry.cwd, name: title, misses: 0 })
    terminal.show(true)
    if (spot !== undefined) {
      try {
        await vscode.commands.executeCommand('workbench.action.terminal.renameWithArg', { name: title })
      } catch {}
    }
    startClaude(terminal, entry.cwd, entry.sessionId)
  }
  wasActive?.show(true)
}

async function resume(uri) {
  const query = new URLSearchParams(uri.query)
  const sessionId = query.get('session') ?? ''
  if (!SESSION_ID.test(sessionId)) return
  const transcript = findTranscript(sessionId)
  const cwd = transcript && (await cwdOf(transcript))
  if (!cwd || !isRestorable({ sessionId, cwd }) || !fs.existsSync(cwd)) {
    const isTurkish = vscode.env.language.startsWith('tr')
    vscode.window.showErrorMessage(`${isTurkish ? 'Oturum bulunamadı ya da klasörü yok' : 'Session not found, or its folder is gone'}: ${sessionId}`)
    return
  }
  const title = cleanTitle(query.get('title') ?? '') || 'Claude'
  const terminal = vscode.window.createTerminal({ name: title, cwd, location: FIRST_GROUP })
  terminal.show()
  startClaude(terminal, cwd, sessionId)
}

exports.activate = context => {
  context.subscriptions.push(vscode.window.registerUriHandler({ handleUri: resume }))
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal(terminal => {
      if (terminal.exitStatus?.reason === vscode.TerminalExitReason.Shutdown) {
        isShuttingDown = true
        return
      }
      if (tracked.delete(terminal)) void save(context)
    }),
  )
  const startTicking = () => {
    const timer = setInterval(() => void tick(context), TICK_MS)
    context.subscriptions.push({ dispose: () => clearInterval(timer) })
    void tick(context)
  }
  setTimeout(() => restore(context).catch(() => {}).finally(startTicking), REVIVE_WAIT_MS)
}

exports.deactivate = () => {
  isShuttingDown = true
}
