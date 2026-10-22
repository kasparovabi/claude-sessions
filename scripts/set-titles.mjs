import { appendFile, open, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'

const PROJECTS = process.argv[2] ?? join(homedir(), '.claude', 'projects')
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

async function endsWithNewline(path) {
  const handle = await open(path, 'r')
  try {
    const { size } = await handle.stat()
    if (size === 0) return true
    const last = Buffer.alloc(1)
    await handle.read(last, 0, 1, size - 1)
    return last[0] === 0x0a
  } finally {
    await handle.close()
  }
}

async function isTranscriptOf(path, sessionId, root) {
  if (basename(path) !== `${sessionId}.jsonl`) return false
  const real = await realpath(path)
  return dirname(dirname(real)) === root
}

async function main() {
  const root = await realpath(PROJECTS)
  const requests = JSON.parse(await readStdin())
  const done = []
  const skipped = []
  for (const { path, sessionId, title } of Array.isArray(requests) ? requests : []) {
    const clean = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim().slice(0, 200) : ''
    try {
      if (!SESSION_ID.test(sessionId) || !clean || !(await isTranscriptOf(path, sessionId, root))) {
        skipped.push(sessionId)
        continue
      }
      const line = JSON.stringify({ type: 'custom-title', customTitle: clean, sessionId })
      await appendFile(path, `${(await endsWithNewline(path)) ? '' : '\n'}${line}\n`)
      done.push(sessionId)
    } catch {
      skipped.push(sessionId)
    }
  }
  process.stdout.write(JSON.stringify({ done, skipped }))
}

main().catch(error => {
  process.stderr.write(String(error?.stack ?? error))
  process.exit(1)
})
