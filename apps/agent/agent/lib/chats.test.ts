import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chatPatch, ChatStore, type PutResult } from './chats.ts'

let dir: string
let file: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'chats-'))
  file = path.join(dir, 'nested', 'chats.json')
  await mkdir(path.dirname(file), { recursive: true })
})
afterEach(() => rm(dir, { recursive: true, force: true }))

async function model(put: Promise<PutResult>): Promise<string | undefined> {
  const result = await put
  return result.ok ? result.chat.model : 'refused'
}

describe('ChatStore', () => {
  it('creates on first put and lists newest first', async () => {
    const store = new ChatStore(file)
    expect(await store.list('me')).toEqual([])
    await store.put('me', 'a', { title: '杭州 8 月新增' }, 1_000)
    await store.put('me', 'b', {}, 2_000)
    const chats = await store.list('me')
    expect(chats.map((c) => c.id)).toEqual(['b', 'a'])
    expect(chats[1]).toEqual({
      id: 'a',
      owner: 'me',
      title: '杭州 8 月新增',
      createdAt: 1_000,
      updatedAt: 1_000,
      sessions: [],
    })
    expect(chats[0]!.title).toBe('新对话')
  })

  it('appends a new session once and keeps the order', async () => {
    const store = new ChatStore(file)
    await store.put('me', 'a', { sessionId: 'wrun_1' }, 1)
    await store.put('me', 'a', { sessionId: 'wrun_1' }, 2)
    await store.put('me', 'a', { sessionId: 'wrun_2' }, 3)
    expect((await store.list('me'))[0]!.sessions).toEqual(['wrun_1', 'wrun_2'])
  })

  it('sets and clears the model', async () => {
    const store = new ChatStore(file)
    expect(await model(store.put('me', 'a', { model: 'qwen' }))).toBe('qwen')
    expect(await model(store.put('me', 'a', { title: 'x' }))).toBe('qwen')
    expect(await model(store.put('me', 'a', { model: null }))).toBeUndefined()
  })

  it('keeps imported timestamps but never in the future', async () => {
    const store = new ChatStore(file)
    const result = await store.put('me', 'a', { createdAt: 500, updatedAt: 9_999 }, 1_000)
    expect(result).toMatchObject({ ok: true, chat: { createdAt: 500, updatedAt: 1_000 } })
  })

  it('survives a restart and removes', async () => {
    await new ChatStore(file).put('me', 'a', { title: 't', sessionId: 's1' }, 1)
    const store = new ChatStore(file)
    expect((await store.list('me'))[0]).toMatchObject({ id: 'a', title: 't', sessions: ['s1'] })
    expect(await store.remove('me', 'a')).toBe(true)
    expect(await store.remove('me', 'a')).toBe(false)
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual([])
  })

  it('serialises concurrent writes', async () => {
    const store = new ChatStore(file)
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.put('me', `c${i}`, {}, i + 1)))
    expect(await new ChatStore(file).list('me')).toHaveLength(20)
  })
})

describe('ChatStore owners', () => {
  it('keeps each login to its own chats and sessions', async () => {
    const store = new ChatStore(file)
    await store.put('alice', 'a', { sessionId: 's1' })
    await store.put('bob', 'b', {})
    expect((await store.list('alice')).map((c) => c.id)).toEqual(['a'])
    expect(await store.put('bob', 'a', { title: 'mine now' })).toEqual({
      ok: false,
      reason: 'chat',
    })
    expect(await store.put('bob', 'b', { sessionId: 's1' })).toEqual({
      ok: false,
      reason: 'session',
    })
    expect(await store.remove('bob', 'a')).toBe(false)
    expect(await store.mayUse('alice', 's1')).toBe(true)
    expect(await store.mayUse('bob', 's1')).toBe(false)
    // Not in any chat yet: the browser that created it records it right after.
    expect(await store.mayUse('bob', 's2')).toBe(true)
  })

  it('gives a chat from before logins to the first login that writes it', async () => {
    await writeFile(
      file,
      JSON.stringify([{ id: 'old', title: 't', createdAt: 1, updatedAt: 1, sessions: ['s0'] }]),
    )
    const store = new ChatStore(file)
    expect(await store.list('alice')).toHaveLength(1)
    expect(await store.mayUse('bob', 's0')).toBe(true)
    await store.put('alice', 'old', {})
    expect(await store.list('bob')).toEqual([])
    expect(await store.mayUse('bob', 's0')).toBe(false)
  })
})

describe('chatPatch', () => {
  it('rejects unknown fields and bad session ids', () => {
    expect(chatPatch.safeParse({ events: [] }).success).toBe(false)
    expect(chatPatch.safeParse({ sessionId: '../x' }).success).toBe(false)
    expect(chatPatch.safeParse({ sessionId: 'wrun_01ABC', model: null }).success).toBe(true)
  })
})
