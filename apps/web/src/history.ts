import {
  Client,
  conversationReducer,
  type EveMessage,
  type MessageStreamEvent,
  type SessionSnapshot,
} from 'eve/client'

/** A message from one of the chat's earlier sessions, rendered read-only. */
export interface PastMessage {
  key: string
  message: EveMessage
  /** The model that answered, for assistant messages. */
  model?: string
}

export interface ChatHistory {
  earlier: PastMessage[]
  /** The live session's recorded events and cursor; the chat view resumes from there. */
  live?: SessionSnapshot
  /**
   * Hide the live session's imported history: it is the text transcript of the earlier sessions,
   * which render in full above it.
   */
  hideImported: boolean
  /** Sessions whose stream the server no longer keeps (410 session_expired) or could not read. */
  lost: number
}

export const EMPTY_HISTORY: ChatHistory = { earlier: [], hideImported: false, lost: 0 }

/**
 * Reads a chat's sessions back from the agent. `follow=false` reads only what was recorded, so
 * it works for sessions that can no longer run (stranded after an eve upgrade, dormant after a
 * restart); sending to one of those moves the chat to a new session (Chat.tsx).
 */
export async function loadHistory(sessions: readonly string[]): Promise<ChatHistory> {
  if (sessions.length === 0) return EMPTY_HISTORY
  const client = new Client({ host: window.location.origin })
  const snapshots = await Promise.all(
    sessions.map((id) =>
      client.sessions
        .attach(id)
        .snapshot()
        .catch((error: unknown) => error),
    ),
  )
  const history: ChatHistory = { earlier: [], hideImported: false, lost: 0 }
  let loaded = false
  snapshots.forEach((snapshot, i) => {
    const live = i === sessions.length - 1
    if (!isSnapshot(snapshot)) {
      // The live session may only have failed to read (a network blip): let the chat view resume
      // it from the start and report its own error. An expired one starts a new session instead.
      if (live && !isExpired(snapshot)) {
        history.live = { events: [], session: { sessionId: sessions[i]!, streamIndex: 0 } }
        history.hideImported = loaded
      } else history.lost++
      return
    }
    if (live) {
      history.live = snapshot
      history.hideImported = loaded
      return
    }
    history.earlier.push(...pastMessages(snapshot.events, sessions[i]!, loaded))
    loaded = true
  })
  return history
}

/** The messages a session's events render, minus imported history when it is shown elsewhere. */
export function pastMessages(
  events: readonly MessageStreamEvent[],
  sessionId: string,
  hideImported: boolean,
): PastMessage[] {
  const state = events.reduce(
    (s, event) => conversationReducer.reduce(s, event),
    conversationReducer.initial(),
  )
  return toPast(state.messages, modelsByTurn(events), sessionId, hideImported)
}

export function toPast(
  messages: readonly EveMessage[],
  answeredBy: Map<string, string>,
  sessionId: string,
  hideImported: boolean,
): PastMessage[] {
  return messages
    .filter((m) => isSettled(m) && !(hideImported && m.metadata?.imported))
    .map((message) => ({
      key: `${sessionId}:${message.id}`,
      message,
      ...(message.role === 'assistant' && message.metadata?.turnId
        ? { model: answeredBy.get(message.metadata.turnId) }
        : {}),
    }))
}

/** Not a message the user saw fail or one still waiting for the server. */
export function isSettled(message: EveMessage): boolean {
  return !message.metadata?.optimistic && message.metadata?.status !== 'failed'
}

/** turnId → the model that served its last step, from step.started events (eve reports `modelId`). */
export function modelsByTurn(
  events: readonly { type: string; data?: unknown }[],
): Map<string, string> {
  const out = new Map<string, string>()
  for (const event of events) {
    if (event.type !== 'step.started') continue
    const data = event.data as
      | { turnId?: unknown; modelId?: unknown; model?: { id?: unknown } }
      | undefined
    const id =
      typeof data?.modelId === 'string'
        ? data.modelId
        : typeof data?.model?.id === 'string'
          ? data.model.id
          : undefined
    if (typeof data?.turnId === 'string' && id)
      out.set(data.turnId, id.replace(/^bailian[./:]/, ''))
  }
  return out
}

function isSnapshot(value: unknown): value is SessionSnapshot {
  return typeof value === 'object' && value !== null && 'events' in value && 'session' in value
}

function isExpired(error: unknown): boolean {
  const { status, code } = (error ?? {}) as { status?: unknown; code?: unknown }
  return code === 'session_expired' || status === 410 || status === 404
}
