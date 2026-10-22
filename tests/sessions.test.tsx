import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { buildRows, fold, folderName, formatAge, groupByFolder, matches, openCommand, parseTerms, pickLang, pickTitle, resumeUrl, snippetLabel } from '../hooks/register'
import type { IndexedSession, LiveSession } from '../types'

const HOME = '/Users/test'
const LIVE_DIR = `${HOME}/.claude/sessions`
const LABELS = `${HOME}/.claude/oturum-adlari.json`
const AUTO = `${HOME}/.claude/oturum-otomatik-adlari.json`

function indexedSession(over: Partial<IndexedSession>): IndexedSession {
  return {
    sessionId: 'x',
    cwd: '/p/a',
    customTitle: null,
    aiTitle: null,
    firstPrompt: null,
    startedAt: 1,
    lastAt: 1,
    prompts: 1,
    entrypoint: 'cli',
    path: '/x.jsonl',
    ...over,
  }
}

const INDEXED: IndexedSession[] = [
  indexedSession({ sessionId: 'self-id', cwd: '/p/notlar', aiTitle: 'Oturum modu', lastAt: 900_000 }),
  indexedSession({ sessionId: 'old-id', cwd: '/p/notlar', customTitle: 'Rapor şablonu', lastAt: 100_000, path: '/proj/-p-notlar/old-id.jsonl' }),
  indexedSession({ sessionId: 'bare-id', cwd: '/p/site', firstPrompt: 'grafik yanlış ölçekleniyor', lastAt: 500_000 }),
  indexedSession({ sessionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', cwd: '/p/eski proje', aiTitle: 'Eski "iş"', lastAt: 200_000 }),
]

const LIVE_FILES: Record<string, string> = {
  [`${LIVE_DIR}/100.json`]: JSON.stringify({ pid: 100, sessionId: 'self-id', cwd: '/p/notlar', name: 'notlar-1', nameSource: 'derived', status: 'busy', kind: 'interactive', entrypoint: 'cli', statusUpdatedAt: 990_000 }),
  [`${LIVE_DIR}/200.json`]: JSON.stringify({ pid: 200, sessionId: 'sdk-id', cwd: '/p/notlar', name: 'bot', status: 'busy', kind: 'interactive', entrypoint: 'sdk-cli' }),
  [`${LIVE_DIR}/300.json`]: JSON.stringify({ pid: 300, sessionId: 'new-id', cwd: '/p/yeni', name: 'yeni-2', nameSource: 'derived', status: 'idle', kind: 'interactive', entrypoint: 'cli', statusUpdatedAt: 980_000 }),
}

function stubHost(on: On, env: Record<string, string> = {}, language: string | null = 'Turkish') {
  const written: Record<string, string> = {}
  const renames: string[] = []
  const titlePrompts: string[] = []
  const transcriptTitles: unknown[] = []
  const opened: string[][] = []
  const searches: string[] = []
  mock.env(on, { HOME, TMPDIR: '/tmp/x/', ...env })
  on('settings.read', () => ({ value: language ? { language } : {} }) as never)
  const clock = mock.clock(on, { now: 1_000_000 })
  on('session.id', () => ({ value: 'self-id' }))
  on('fs.list', () => ({
    value: ['100.json', '200.json', '300.json', '._100.json'].map(name => ({ name, kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false })),
  }))
  on('fs.read', (_$, e) => {
    const text = written[e.path] ?? LIVE_FILES[e.path]
    return text === undefined ? { deny: 'ENOENT' } : { value: text }
  })
  on('fs.write', (_$, e) => {
    written[e.path] = e.text
    return { value: undefined }
  })
  on('process.run', (_$, e) => {
    if (e.argv[0] === 'ps' && env.OS === 'Windows_NT') return { deny: 'ENOENT' }
    if (e.argv[0] === 'uname') return { value: { exitCode: 0, stdout: 'Darwin\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    if (e.argv[1] === '-e') return { value: { exitCode: 0, stdout: '100\n300\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    if (e.argv[1] === '--open-url' || e.argv[0] === 'rundll32' || e.argv[0] === 'open') opened.push([...e.argv])
    if (String(e.argv[1]).endsWith('set-titles.mjs')) transcriptTitles.push(...(JSON.parse(e.init?.stdin ?? '[]') as unknown[]))
    if (String(e.argv[1]).endsWith('search.mjs')) searches.push(e.argv.slice(2).join(' '))
    const stdout = e.argv[0] === 'ps' ? '  100\n  200\n  300\n' : String(e.argv[1]).endsWith('search.mjs') ? JSON.stringify({ hits: e.argv[2] === 'any' ? [{ sessionId: 'old-id', score: 101, matched: ['zamanlayıcı'] }] : [{ sessionId: 'bare-id', score: 3, snippet: '…S: yedek betiği nerede' }] }) : String(e.argv[1]).endsWith('set-titles.mjs') ? JSON.stringify({ done: [], skipped: [] }) : JSON.stringify({ sessions: INDEXED })
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('model.complete', (_$, e) => {
    if (String(e.system).includes('genişletiyorsun')) return { value: { isAnswered: true, text: '- gece görevi\n2. zamanlayıcı\nyok', usage: {} } as never }
    titlePrompts.push(String(e.prompt))
    return { value: { isAnswered: true, text: '"Grafik ölçek hatası."', usage: {} } as never }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('command.run', { command: 'rename' }, (_$, e) => {
    renames.push(e.args)
    return { text: '' }
  })
  return { written, renames, titlePrompts, clock, transcriptTitles, opened, searches }
}

const PANE = {
  component: 'Pane',
  requestId: 'sessions',
  props: { title: 'Oturumlar', isFocused: true, bodyColumns: 70, placement: 'dock' } as never,
} as const

test('title order: own label, rename, Claude title, generated, first message', () => {
  const session = indexedSession({ customTitle: 'Özel', aiTitle: 'AI', firstPrompt: 'ilk' })
  expect(pickTitle(session, null, 'Etiket', 'Oto').titleSource).toBe('label')
  expect(pickTitle(session, null, undefined, 'Oto').title).toBe('Özel')
  expect(pickTitle({ ...session, customTitle: null }, null, undefined, 'Oto').title).toBe('AI')
  expect(pickTitle({ ...session, customTitle: null, aiTitle: null }, null, undefined, 'Oto').title).toBe('Oto')
  expect(pickTitle({ ...session, customTitle: null, aiTitle: null }, null, undefined, undefined).titleSource).toBe('prompt')
})

test('groups by folder, newest folder first, live sessions on top', () => {
  const liveSessions: LiveSession[] = [
    { sessionId: 'old-id', cwd: '/p/notlar', name: 'x', isUserNamed: false, status: 'idle', changedAt: 50, kind: 'interactive', entrypoint: 'cli' },
    { sessionId: 'sdk-id', cwd: '/p/notlar', name: 'bot', isUserNamed: false, status: 'busy', changedAt: 999_999, kind: 'interactive', entrypoint: 'sdk-cli' },
  ]
  const folders = groupByFolder(buildRows(INDEXED, liveSessions, {}, {}, 'self-id'))
  expect(folders.map(folder => folder.cwd)).toEqual(['/p/notlar', '/p/site', '/p/eski proje'])
  expect(folders[0]?.rows.map(row => row.sessionId)).toEqual(['old-id', 'self-id'])
  expect(folders[0]?.liveCount).toBe(1)
})

test('panel lists every folder, hides sdk sessions, names and auto-titles', async ($, on) => {
  const host = stubHost(on)
  await $.command.run({ command: 'oturumlar', args: '' } as never)
  await host.clock.advance(1)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'sessions', surface, ...PANE })
    expect((await ui.find({ key: 'klasor:/p/notlar' }))?.text).toContain('notlar')
    expect((await ui.find({ key: 'klasor:/p/site' }))?.text).toContain('site')
    expect((await ui.find({ key: 'klasor:/p/yeni' }))?.text).toContain('yeni')
    expect(await ui.find({ key: 'sdk-id' })).toBeUndefined()
    await ui.unmount()
  }

  expect(host.titlePrompts).toHaveLength(1)
  expect(host.titlePrompts[0]).toContain('grafik yanlış')
  expect(JSON.parse(host.written[AUTO] ?? '{}')).toEqual({ 'bare-id': 'Grafik ölçek hatası' })

  const ui = await $.ui.mount({ plugin: 'sessions', surface: 'terminal', ...PANE })
  await ui.press({ key: 'klasor:/p/site' })
  expect((await ui.find({ key: 'bare-id' }))?.text).toContain('Grafik ölçek hatası')

  await ui.press({ key: 'klasor:/p/notlar' })
  expect((await ui.find({ key: 'old-id' }))?.text).toContain('Rapor şablonu')
  await ui.press({ key: 'old-id' })
  await ui.input({ key: 'ad-old-id', text: 'Rapor biçimi' })
  expect(JSON.parse(host.written[LABELS] ?? '{}')).toEqual({ 'old-id': 'Rapor biçimi' })
  expect((await ui.find({ key: 'old-id' }))?.text).toContain('Rapor biçimi')
  expect(host.renames).toEqual([])
  await host.clock.advance(1)
  expect(host.transcriptTitles).toEqual([{ path: '/proj/-p-notlar/old-id.jsonl', sessionId: 'old-id', title: 'Rapor biçimi' }])

  await ui.press({ key: 'self-id' })
  await ui.input({ key: 'ad-self-id', text: 'Oturum paneli' })
  expect(host.renames).toEqual(['Oturum paneli'])

  await ui.input({ key: 'ara', text: 'rapor', kind: 'change' })
  expect(await ui.find({ key: 'klasor:/p/site' })).toBeUndefined()
  await ui.unmount()
})

for (const [name, env, start, expected] of [
  ['opens in the terminal REPL', {}, { surface: 'terminal', isInteractive: true }, ['oturumlar']],
  ['stays out of a -p run', {}, { surface: null, isInteractive: false }, []],
  ['stays out of SDK sessions', { CLAUDE_CODE_ENTRYPOINT: 'sdk-cli' }, { surface: 'terminal', isInteractive: true }, []],
  ['registers /sessions for an English locale', { LANG: 'en_GB.UTF-8' }, { surface: 'terminal', isInteractive: true }, ['sessions']],
] as const) {
  test(name, async ($, on) => {
    stubHost(on, env, 'LANG' in env ? null : 'Turkish')
    const registered: string[] = []
    on('command.register', (_$, e) => {
      registered.push(e.name)
      return { value: { command: e.name } as never }
    })
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    await $.session.start({ cwd: '/p/notlar', ...start })
    expect(registered).toEqual([...expected])
  })
}

test('resume link carries only a valid session id and an encoded title', () => {
  const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
  expect(resumeUrl(id, 'Eski "iş" & ?')).toBe(
    `vscode://kasparov.oturumlar-ac/resume?session=${id}&title=Eski%20%22i%C5%9F%22%20%26%20%3F`,
  )
  expect(resumeUrl('x&session=evil', 't')).toBeNull()
})

test('opens a closed session in VS Code, never a live one', async ($, on) => {
  const host = stubHost(on)
  await $.command.run({ command: 'oturumlar', args: '' } as never)
  await host.clock.advance(1)
  const ui = await $.ui.mount({ plugin: 'sessions', surface: 'terminal', ...PANE })

  await ui.press({ key: 'klasor:/p/notlar' })
  await ui.press({ key: 'self-id' })
  expect(await ui.find({ key: 'ac-self-id' })).toBeUndefined()

  const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
  await ui.press({ key: 'klasor:/p/eski proje' })
  await ui.press({ key: id })
  await ui.press({ key: `ac-${id}` })
  expect(host.opened).toEqual([['open', resumeUrl(id, 'Eski "iş"')]])
  await ui.unmount()
})

test('a VS Code CLI set in the options opens the session through it', { options: { vscodeCli: '/Apps/Code 2.app/bin/code' } }, async ($, on) => {
  const host = stubHost(on)
  await $.command.run({ command: 'oturumlar', args: '' } as never)
  await host.clock.advance(1)
  const ui = await $.ui.mount({ plugin: 'sessions', surface: 'terminal', ...PANE })
  const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
  await ui.press({ key: 'klasor:/p/eski proje' })
  await ui.press({ key: id })
  await ui.press({ key: `ac-${id}` })
  expect(host.opened).toEqual([['/Apps/Code 2.app/bin/code', '--open-url', resumeUrl(id, 'Eski "iş"')]])
  expect(openCommand('u', 'Linux', '')).toEqual(['xdg-open', 'u'])
  await ui.unmount()
})

test('speaks English unless the language setting or the locale is Turkish', async ($, on) => {
  const host = stubHost(on, { LANG: 'en_US.UTF-8' }, null)
  await $.command.run({ command: 'sessions', args: '' } as never)
  await host.clock.advance(1)
  const ui = await $.ui.mount({ plugin: 'sessions', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /5 sessions · 4 folders · 2 live/ })).toBeDefined()
  expect(host.titlePrompts[0]).toContain('First message: grafik')
  await ui.unmount()
  expect(pickLang('Türkçe', 'en_US')).toBe('tr')
  expect(pickLang('English', 'tr_TR.UTF-8')).toBe('en')
  expect(pickLang(undefined, 'tr_TR.UTF-8')).toBe('tr')
  expect(formatAge(7_200_000, 'en')).toBe('2 h')
})

test('pinned sessions move to the top and stay pinned across refreshes', async ($, on) => {
  const host = stubHost(on)
  await $.command.run({ command: 'oturumlar', args: '' } as never)
  await host.clock.advance(1)
  const ui = await $.ui.mount({ plugin: 'sessions', surface: 'terminal', ...PANE })

  await ui.press({ key: 'klasor:/p/site' })
  await ui.press({ key: 'bare-id' })
  await ui.press({ key: 'sabitle-bare-id' })
  expect(JSON.parse(host.written[`${HOME}/.claude/oturum-sabitler.json`] ?? '[]')).toEqual(['bare-id'])
  expect(await ui.find({ key: 'klasor:/p/site' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Sabitlenenler 1/ })).toBeDefined()
  expect((await ui.find({ key: 'bare-id' }))?.text).toContain('site')

  await host.clock.advance(5000)
  expect(await ui.find({ type: 'Text', text: /Sabitlenenler 1/ })).toBeDefined()

  await ui.input({ key: 'ara', text: 'rapor', kind: 'change' })
  expect(await ui.find({ type: 'Text', text: /Sabitlenenler/ })).toBeUndefined()
  await ui.input({ key: 'ara', text: '', kind: 'change' })

  await ui.press({ key: 'sabitle-bare-id' })
  expect(JSON.parse(host.written[`${HOME}/.claude/oturum-sabitler.json`] ?? '[]')).toEqual([])
  expect(await ui.find({ key: 'klasor:/p/site' })).toBeDefined()
  await ui.unmount()
})

test('on Windows it checks liveness with node and opens through the vscode protocol handler', async ($, on) => {
  const host = stubHost(on, { OS: 'Windows_NT' })
  await $.command.run({ command: 'oturumlar', args: '' } as never)
  await host.clock.advance(1)
  const ui = await $.ui.mount({ plugin: 'sessions', surface: 'terminal', ...PANE })
  expect(await ui.find({ type: 'Text', text: /2 aktif/ })).toBeDefined()

  const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
  await ui.press({ key: 'klasor:/p/eski proje' })
  await ui.press({ key: id })
  await ui.press({ key: `ac-${id}` })
  expect(host.opened).toEqual([['rundll32', 'url.dll,FileProtocolHandler', resumeUrl(id, 'Eski "iş"')]])
  expect(folderName('C:\\Users\\ali\\proje')).toBe('proje')
  await ui.unmount()
})

test('search folds Turkish letters and cleans expanded terms', () => {
  expect(fold('Şifre IŞIK Ünlü')).toBe('sifre isik unlu')
  const rows = buildRows(INDEXED, [], {}, {}, 'self-id')
  expect(matches(rows[1]!, 'rapor SABLONU')).toBe(true)
  expect(parseTerms('- gece görevi\n2. `zamanlayıcı`\n* gece görevi\nyok\nx\n')).toEqual(['gece görevi', 'zamanlayıcı'])
  expect(snippetLabel('…C: tamam')).toBe('…Claude: tamam')
})

test('Enter searches every message and by meaning, results stay in folders', async ($, on) => {
  const host = stubHost(on)
  await $.command.run({ command: 'oturumlar', args: '' } as never)
  await host.clock.advance(1)
  const ui = await $.ui.mount({ plugin: 'sessions', surface: 'terminal', ...PANE })

  await ui.input({ key: 'ara', text: 'yedek', kind: 'change' })
  expect(await ui.find({ key: 'klasor:/p/site' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Enter: tüm mesajlarda/ })).toBeDefined()

  await ui.input({ key: 'ara', text: 'yedek' })
  expect(host.searches).toEqual(['all yedek', 'any ["gece görevi","zamanlayıcı"]'])
  expect((await ui.find({ key: 'bare-id' }))?.text).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /sen: yedek betiği nerede/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /anlamca: zamanlayıcı geçiyor/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1 oturumun mesajlarında geçiyor · 1 oturum anlamca ilgili/ })).toBeDefined()

  await ui.input({ key: 'ara', text: 'yedekx', kind: 'change' })
  expect(await ui.find({ type: 'Text', text: /anlamca:/ })).toBeUndefined()
  await ui.unmount()
})
