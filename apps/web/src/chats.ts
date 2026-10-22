import { useCallback, useEffect, useState } from 'react'

/**
 * One conversation, as the agent keeps it (GET /chats, apps/agent/agent/channels/chats.ts). The
 * messages are not stored: the chat view replays them from the sessions' eve streams.
 */
export interface SavedChat {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  /** The model the user picked for this chat; the server's default when unset. */
  model?: string
  /** eve session ids, oldest first; the last one is live. */
  sessions: string[]
}

export interface ChatPatch {
  title?: string
  model?: string
  /** The session this chat now runs in; appended to `sessions` when new. */
  sessionId?: string
}

export function newChat(): SavedChat {
  const now = Date.now()
  return { id: crypto.randomUUID(), title: '新对话', createdAt: now, updatedAt: now, sessions: [] }
}

/** Chats on the server, newest first, plus one local draft until its first message. */
export function useChats() {
  const [chats, setChats] = useState<SavedChat[] | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    importLegacy()
      .catch((e: unknown) => console.warn('importing browser chats failed; retried next load', e))
      .then(() => request<SavedChat[]>('GET', '/chats'))
      .then((saved) => {
        if (!live) return
        const list = saved.length > 0 ? saved : [newChat()]
        setChats(list)
        setActiveId(list[0]!.id)
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
    }
  }, [])

  /** Applies the patch at once and saves it; every update counts as activity. */
  const update = useCallback((id: string, patch: ChatPatch) => {
    setChats((prev) =>
      prev ? sortByActivity(prev.map((c) => (c.id === id ? applyPatch(c, patch) : c))) : prev,
    )
    request<SavedChat>('PUT', `/chats/${encodeURIComponent(id)}`, patch)
      .then((saved) =>
        setChats((prev) => prev && sortByActivity(prev.map((c) => (c.id === id ? saved : c)))),
      )
      .catch((e: unknown) => console.warn('saving the chat failed', e))
  }, [])

  const create = useCallback(() => {
    setChats((prev) => {
      if (!prev) return prev
      // Reuse an untouched chat instead of stacking empty ones.
      const empty = prev.find((c) => c.sessions.length === 0)
      if (empty) {
        setActiveId(empty.id)
        return prev
      }
      const chat = newChat()
      setActiveId(chat.id)
      return [chat, ...prev]
    })
  }, [])

  const remove = useCallback(
    (id: string) => {
      setChats((prev) => {
        if (!prev) return prev
        let next = prev.filter((c) => c.id !== id)
        if (next.length === 0) next = [newChat()]
        if (id === activeId) setActiveId(next[0]!.id)
        return next
      })
      request('DELETE', `/chats/${encodeURIComponent(id)}`).catch((e: unknown) =>
        console.warn('deleting the chat failed', e),
      )
    },
    [activeId],
  )

  const active = chats?.find((c) => c.id === activeId) ?? chats?.[0] ?? null
  return { chats, active, error, select: setActiveId, create, update, remove }
}

function applyPatch(chat: SavedChat, patch: ChatPatch): SavedChat {
  const { sessionId, ...rest } = patch
  const sessions =
    sessionId && chat.sessions.at(-1) !== sessionId
      ? [...chat.sessions.filter((s) => s !== sessionId), sessionId]
      : chat.sessions
  return { ...chat, ...rest, sessions, updatedAt: Date.now() }
}

function sortByActivity(chats: SavedChat[]): SavedChat[] {
  return [...chats].sort((a, b) => b.updatedAt - a.updatedAt)
}

async function request<T = void>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  if (!response.ok) throw new Error(`${method} ${url}: ${response.status}`)
  return (response.status === 204 ? undefined : await response.json()) as T
}

/** Where chats lived before they moved to the server (plan item 1.6). */
const LEGACY_KEY = 'tianyancha-agent:chats'

/** Moves chats saved in this browser to the server once; their sessions replay from there. */
async function importLegacy(): Promise<void> {
  let saved: {
    id?: unknown
    title?: unknown
    createdAt?: unknown
    updatedAt?: unknown
    model?: unknown
    session?: { sessionId?: unknown }
  }[]
  try {
    saved = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? '[]')
  } catch {
    return
  }
  if (!Array.isArray(saved) || saved.length === 0) return
  for (const chat of saved) {
    if (typeof chat.id !== 'string' || typeof chat.session?.sessionId !== 'string') continue
    await request('PUT', `/chats/${encodeURIComponent(chat.id)}`, {
      sessionId: chat.session.sessionId,
      ...(typeof chat.title === 'string' && chat.title.trim() ? { title: chat.title } : {}),
      ...(typeof chat.model === 'string' ? { model: chat.model } : {}),
      ...(typeof chat.createdAt === 'number' ? { createdAt: Math.floor(chat.createdAt) } : {}),
      ...(typeof chat.updatedAt === 'number' ? { updatedAt: Math.floor(chat.updatedAt) } : {}),
    })
  }
  localStorage.removeItem(LEGACY_KEY)
}
