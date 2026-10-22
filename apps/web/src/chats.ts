import type { ClientSessionState, MessageStreamEvent } from 'eve/client'
import { useCallback, useState } from 'react'

/** One saved conversation: the eve session cursor plus the events to render it after a reload. */
export interface SavedChat {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  session?: ClientSessionState
  events?: readonly MessageStreamEvent[]
  /** The model the user picked for this chat; the server's default when unset. */
  model?: string
}

const KEY = 'tianyancha-agent:chats'

function load(): SavedChat[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as SavedChat[]) : []
  } catch {
    return []
  }
}

function store(chats: SavedChat[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(chats))
  } catch {
    // Quota or private mode: drop stored events of older chats and keep the cursors, which
    // are enough to resume from the server.
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify(chats.map((c, i) => (i < 3 ? c : { ...c, events: undefined }))),
      )
    } catch {
      /* the page still works without persistence */
    }
  }
}

export function newChat(): SavedChat {
  const now = Date.now()
  return { id: crypto.randomUUID(), title: '新对话', createdAt: now, updatedAt: now }
}

/** Saved chats, newest first, persisted in localStorage. */
export function useChats() {
  const [chats, setChats] = useState<SavedChat[]>(() => {
    const saved = load()
    return saved.length > 0 ? saved : [newChat()]
  })
  const [activeId, setActiveId] = useState(() => chats[0]!.id)

  const update = useCallback((id: string, patch: Partial<SavedChat>) => {
    setChats((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c))
      next.sort((a, b) => b.updatedAt - a.updatedAt)
      store(next.filter((c) => c.session))
      return next
    })
  }, [])

  const create = useCallback(() => {
    setChats((prev) => {
      // Reuse an untouched chat instead of stacking empty ones.
      const empty = prev.find((c) => !c.session)
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
        let next = prev.filter((c) => c.id !== id)
        if (next.length === 0) next = [newChat()]
        if (id === activeId) setActiveId(next[0]!.id)
        store(next.filter((c) => c.session))
        return next
      })
    },
    [activeId],
  )

  const active = chats.find((c) => c.id === activeId) ?? chats[0]!
  return { chats, active, select: setActiveId, create, update, remove }
}
