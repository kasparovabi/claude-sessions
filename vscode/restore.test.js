const assert = require('node:assert/strict')
const test = require('node:test')

const { claudeSessions, cleanTitle, isRestorable, matchRevived, nextTracked, parseProcessTable, resumeLine, sessionIdFromCommand, sessionsByShell, snapshot, transcriptTitle } = require('./restore')

const ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const OTHER = 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee'

test('finds the terminal shell above a claude process, through a cmd wrapper too', () => {
  const table = parseProcessTable('   30    20 node cli.js\r\n   20    10 cmd /c claude\n   10     1 pwsh\n   40     1 /bin/zsh -il\n')
  const byShell = sessionsByShell([{ pid: 30, sessionId: ID, cwd: '/p' }, { pid: 99, sessionId: 'gone', cwd: '/q' }], table, new Set([10, 40]))
  assert.deepEqual([...byShell.keys()], [10])
})

test('reads the session from its file, or from --resume while the file is not written yet', () => {
  assert.equal(sessionIdFromCommand(`/u/claude --dangerously-skip-permissions --resume ${ID}`), ID)
  assert.equal(sessionIdFromCommand(`node cli.js -r "${ID}"`), ID)
  assert.equal(sessionIdFromCommand(`/u/claude --session-id=${ID}`), ID)
  assert.equal(sessionIdFromCommand('/u/claude --dangerously-skip-permissions'), null)
  const table = parseProcessTable(`5 1 /u/claude --resume ${ID}\n6 1 /u/claude --resume ${ID}\n7 1 /u/claude\n`)
  const sessions = claudeSessions(table, [{ pid: 6, sessionId: OTHER, cwd: '/b' }, { pid: 8, sessionId: ID, cwd: '/dead' }])
  assert.deepEqual(sessions, [{ pid: 6, sessionId: OTHER, cwd: '/b' }, { pid: 5, sessionId: ID, cwd: null }])
})

test('keeps a terminal through two empty ticks, forgets it on the third', () => {
  const tab = {}
  const terminals = [{ terminal: tab, name: 'zsh', shellPid: 10 }]
  let tracked = nextTracked(terminals, new Map(), new Map([[10, { sessionId: ID, cwd: '/p' }]]))
  assert.deepEqual(snapshot(terminals, tracked), [{ index: 0, name: 'zsh', sessionId: ID, cwd: '/p' }])
  tracked = nextTracked(terminals, tracked, new Map())
  tracked = nextTracked(terminals, tracked, new Map())
  assert.equal(snapshot(terminals, tracked).length, 1)
  tracked = nextTracked(terminals, tracked, new Map())
  assert.equal(snapshot(terminals, tracked).length, 0)
})

test('matches revived tabs by place first, then by name, never a busy one', () => {
  const saved = [{ index: 0, name: 'zsh' }, { index: 2, name: 'zsh' }, { index: 5, name: 'ÇİZİM' }]
  const matches = matchRevived(saved, ['zsh', 'zsh', 'zsh', 'ÇİZİM'], index => index !== 2)
  assert.deepEqual([...matches], [[0, 0], [1, 1], [2, 3]])
  assert.equal(matchRevived([{ index: 0, name: 'yok' }], ['zsh'], () => false).size, 0)
})

test('falls back to the idle tab at the same place when the revived name changed', () => {
  const saved = [{ index: 1, name: '✳ Notlar' }, { index: 2, name: 'Rapor' }, { index: 7, name: 'gone' }]
  assert.deepEqual([...matchRevived(saved, ['powershell', 'powershell', 'powershell'], () => true)], [[0, 1], [1, 2]])
  assert.deepEqual([...matchRevived(saved, ['powershell', 'powershell', 'powershell'], index => index !== 2)], [[0, 1]])
  assert.deepEqual([...matchRevived([{ index: 0, name: 'x' }, { index: 1, name: 'ÇİZİM' }], ['ÇİZİM', 'zsh'], () => true)], [[1, 0]])
})

test('takes the last rename over the ai title, an empty rename clears it', () => {
  const ai = JSON.stringify({ type: 'ai-title', aiTitle: 'Taslak' })
  const named = JSON.stringify({ type: 'custom-title', customTitle: 'ÇİZİM' })
  const cleared = JSON.stringify({ type: 'custom-title', customTitle: '' })
  assert.equal(transcriptTitle(`${ai}\n${named}\n{"type":"user"}\nbroken-title"`), 'ÇİZİM')
  assert.equal(transcriptTitle(`${named}\n${cleared}\n${ai}`), 'Taslak')
  assert.equal(transcriptTitle('{"type":"user"}'), null)
  assert.equal(cleanTitle(' a\nb\u0007 '), 'a b')
})

test('rejects bad ids and control characters, quotes the folder for each shell', () => {
  assert.equal(isRestorable({ sessionId: 'x; rm', cwd: '/p' }), false)
  assert.equal(isRestorable({ sessionId: ID, cwd: '/p\nrm' }), false)
  assert.equal(isRestorable({ sessionId: ID, cwd: "/p/ali'nin" }), true)
  assert.equal(resumeLine('darwin', "/p/ali'nin", ID, '/u/claude', true), `cd '/p/ali'\\''nin' && '/u/claude' --dangerously-skip-permissions --resume ${ID}`)
  assert.equal(resumeLine('darwin', '/p', ID, 'claude', false), `cd '/p' && 'claude' --resume ${ID}`)
  assert.equal(resumeLine('win32', "A:\\ali'nin", ID, 'x', true), `Set-Location -LiteralPath 'A:\\ali''nin'; claude --dangerously-skip-permissions --resume ${ID}`)
})
