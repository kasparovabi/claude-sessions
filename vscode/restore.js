const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const MISSES_TO_FORGET = 3
const MAX_DEPTH = 8

const ID_FLAG = /(?:^|\s)(?:--resume|-r|--session-id)(?:\s+|=)["']?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/

function sessionIdFromCommand(command) {
  return ID_FLAG.exec(command ?? '')?.[1] ?? null
}

function parseProcessTable(text) {
  const table = new Map()
  for (const line of text.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s?(.*)$/.exec(line.replace(/\r$/, ''))
    if (match) table.set(Number(match[1]), { ppid: Number(match[2]), command: match[3] })
  }
  return table
}

function claudeSessions(table, sessionFiles) {
  const fromFiles = new Map(sessionFiles.filter(session => table.has(session.pid)).map(session => [session.pid, session]))
  const sessions = [...fromFiles.values()]
  for (const [pid, { command }] of table) {
    if (fromFiles.has(pid)) continue
    const sessionId = sessionIdFromCommand(command)
    if (sessionId) sessions.push({ pid, sessionId, cwd: null })
  }
  return sessions
}

function ownerShell(pid, parents, shellPids) {
  let current = pid
  for (let depth = 0; depth < MAX_DEPTH && current; depth += 1) {
    if (shellPids.has(current)) return current
    current = parents.get(current)?.ppid
  }
  return null
}

function sessionsByShell(sessions, parents, shellPids) {
  const byShell = new Map()
  for (const session of sessions) {
    if (!parents.has(session.pid)) continue
    const shell = ownerShell(session.pid, parents, shellPids)
    if (shell) byShell.set(shell, session)
  }
  return byShell
}

function nextTracked(terminals, previous, byShell) {
  const tracked = new Map()
  for (const { terminal, name, shellPid } of terminals) {
    const session = shellPid ? byShell.get(shellPid) : undefined
    const old = previous.get(terminal)
    if (session) tracked.set(terminal, { sessionId: session.sessionId, cwd: session.cwd, name, misses: 0 })
    else if (old && old.misses + 1 < MISSES_TO_FORGET) tracked.set(terminal, { ...old, misses: old.misses + 1 })
  }
  return tracked
}

function snapshot(terminals, tracked) {
  return terminals.flatMap(({ terminal, name }, index) => {
    const entry = tracked.get(terminal)
    return entry ? [{ index, name, sessionId: entry.sessionId, cwd: entry.cwd }] : []
  })
}

function isRestorable(entry) {
  return (
    entry &&
    typeof entry.sessionId === 'string' &&
    SESSION_ID.test(entry.sessionId) &&
    typeof entry.cwd === 'string' &&
    entry.cwd.length > 0 &&
    !/[\u0000-\u001f\u007f]/.test(entry.cwd)
  )
}

function matchRevived(saved, names, isFree) {
  const claimed = new Set()
  const matches = new Map()
  const open = index => index >= 0 && index < names.length && isFree(index) && !claimed.has(index)
  const claim = (savedIndex, spot) => {
    claimed.add(spot)
    matches.set(savedIndex, spot)
  }
  saved.forEach((entry, savedIndex) => {
    const spot = names[entry.index] === entry.name && open(entry.index) ? entry.index : names.findIndex((name, index) => name === entry.name && open(index))
    if (spot >= 0) claim(savedIndex, spot)
  })
  saved.forEach((entry, savedIndex) => {
    if (!matches.has(savedIndex) && open(entry.index)) claim(savedIndex, entry.index)
  })
  return matches
}

function transcriptTitle(text) {
  let custom = null
  let ai = null
  for (const line of text.split('\n')) {
    if (!line.includes('-title"')) continue
    try {
      const entry = JSON.parse(line)
      if (entry.type === 'custom-title') custom = entry.customTitle || null
      else if (entry.type === 'ai-title' && entry.aiTitle) ai = entry.aiTitle
    } catch {}
  }
  return custom ?? ai
}

function cleanTitle(title) {
  return String(title).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 60)
}

function resumeLine(platform, cwd, sessionId, claude, skipPermissions) {
  const flags = skipPermissions ? ' --dangerously-skip-permissions' : ''
  if (platform === 'win32') {
    return `Set-Location -LiteralPath '${cwd.replace(/'/g, "''")}'; claude${flags} --resume ${sessionId}`
  }
  const quote = text => `'${text.replace(/'/g, `'\\''`)}'`
  return `cd ${quote(cwd)} && ${quote(claude)}${flags} --resume ${sessionId}`
}

module.exports = { SESSION_ID, sessionIdFromCommand, parseProcessTable, claudeSessions, ownerShell, sessionsByShell, nextTracked, snapshot, isRestorable, matchRevived, transcriptTitle, cleanTitle, resumeLine }
