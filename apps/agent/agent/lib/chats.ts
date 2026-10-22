import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'

/**
 * The web UI's chat list. A chat is a title and the eve sessions it ran in; the conversation
 * itself is read back from those sessions' streams, so a record stays a few hundred bytes.
 */
export interface ChatRecord {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  /** The model the user picked for this chat; the server's default when unset. */
  model?: string
  /**
   * eve sessions, oldest first; the last one is live. A chat moves to a new session when its old
   * one can no longer run (restart, redeploy, eve upgrade), carrying the conversation as history.
   */
  sessions: string[]
}

const ID = /^[A-Za-z0-9_-]{1,128}$/
const TITLE_CHARS = 100

export const chatId = z.string().regex(ID)

/** A PUT body. `createdAt`/`updatedAt` are for importing chats saved in the browser before 1.6. */
export const chatPatch = z
  .object({
    title: z.string().trim().min(1).optional(),
    model: z.string().min(1).max(100).nullable().optional(),
    sessionId: z.string().regex(ID).optional(),
    createdAt: z.number().int().positive().optional(),
    updatedAt: z.number().int().positive().optional(),
  })
  .strict()

export type ChatPatch = z.infer<typeof chatPatch>

/** One JSON file, rewritten atomically. Writes are serialised; the agent is a single process. */
export class ChatStore {
  private chats: Map<string, ChatRecord> | undefined
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly file: string) {}

  /** Newest first. */
  list(): Promise<ChatRecord[]> {
    return this.serial(async () =>
      [...(await this.load()).values()].sort((a, b) => b.updatedAt - a.updatedAt),
    )
  }

  /** Creates the chat on first use. Every write counts as activity unless it says otherwise. */
  put(id: string, patch: ChatPatch, now = Date.now()): Promise<ChatRecord> {
    return this.serial(async () => {
      const chats = await this.load()
      const old = chats.get(id)
      const chat: ChatRecord = old
        ? { ...old, sessions: [...old.sessions] }
        : {
            id,
            title: '新对话',
            createdAt: Math.min(patch.createdAt ?? now, now),
            updatedAt: now,
            sessions: [],
          }
      if (patch.title) chat.title = patch.title.slice(0, TITLE_CHARS)
      if (patch.model === null) delete chat.model
      else if (patch.model) chat.model = patch.model
      if (patch.sessionId && chat.sessions.at(-1) !== patch.sessionId) {
        chat.sessions = [...chat.sessions.filter((s) => s !== patch.sessionId), patch.sessionId]
      }
      chat.updatedAt = Math.min(patch.updatedAt ?? now, now)
      chats.set(id, chat)
      await this.save(chats)
      return chat
    })
  }

  remove(id: string): Promise<boolean> {
    return this.serial(async () => {
      const chats = await this.load()
      if (!chats.delete(id)) return false
      await this.save(chats)
      return true
    })
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work)
    this.queue = run.catch(() => {})
    return run
  }

  private async load(): Promise<Map<string, ChatRecord>> {
    if (this.chats) return this.chats
    let saved: ChatRecord[] = []
    try {
      saved = JSON.parse(await readFile(this.file, 'utf8')) as ChatRecord[]
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    this.chats = new Map(saved.map((c) => [c.id, c]))
    return this.chats
  }

  private async save(chats: Map<string, ChatRecord>): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.${process.pid}.tmp`
    try {
      await writeFile(tmp, JSON.stringify([...chats.values()]))
      await rename(tmp, this.file)
    } catch (error) {
      // The change is in memory only; read the file again on the next call.
      this.chats = undefined
      throw error
    }
  }
}
