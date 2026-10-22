export type TitleSource = 'label' | 'custom' | 'ai' | 'auto' | 'prompt' | 'none'

export type LiveStatus = 'busy' | 'idle' | 'other'

export type SessionRow = {
  sessionId: string
  cwd: string
  title: string
  titleSource: TitleSource
  firstPrompt: string | null
  lastAt: number
  live: LiveStatus | null
  isSelf: boolean
}

export type IndexedSession = {
  sessionId: string
  cwd: string
  customTitle: string | null
  aiTitle: string | null
  firstPrompt: string | null
  startedAt: number
  lastAt: number
  prompts: number
  entrypoint: string
  path: string
}

export type LiveSession = {
  sessionId: string
  cwd: string
  name: string | null
  isUserNamed: boolean
  status: LiveStatus
  changedAt: number
  kind: string
  entrypoint: string
}

export type TextHit = { sessionId: string; score: number; snippet: string }

export type MeaningHit = { sessionId: string; reason: string }

export type SearchState = {
  query: string
  isRunning: boolean
  text: TextHit[]
  meaning: MeaningHit[]
  note: string | null
}

export type Lang = 'tr' | 'en'

declare module 'claude-code' {
  interface PluginState {
    sessions: {
      lang: Lang
      indexed: IndexedSession[]
      live: LiveSession[]
      labels: Record<string, string>
      pinned: string[]
      autoTitles: Record<string, string>
      selfId: string
      selectedId: string | null
      expanded: string[]
      limits: Record<string, number>
      filter: string
      search: SearchState | null
      now: number
      indexNote: string | null
      appliedLabel: string | null
    }
  }
}
