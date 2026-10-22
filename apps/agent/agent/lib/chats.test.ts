import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chatPatch, ChatStore } from './chats.ts'

let dir: string
let file: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'chats-'))
  file = path.join(dir, 'nested', 'chats.json')
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe('ChatStore', () => {
  it('creates on first put and lists newest first', async () => {
    const store = new ChatStore(file)
    expect(await store.list()).toEqual([])
    await store.put('a', { title: '杭州 8 月新增' }, 1_000)
    await store.put('b', {}, 2_000)
    const chats = await store.list()
    expect(chats.map((c) => c.id)).toEqual(['b', 'a'])
    expect(chats[1]).toEqual({
      id: 'a',
      title: '杭州 8 月新增',
      createdAt: 1_000,
      updatedAt: 1_000,
      sessions: [],
    })
    expect(chats[0]!.title).toBe('新对话')
  })

  it('appends a new session once and keeps the order', async () => {
    const store = new ChatStore(file)
    await store.put('a', { sessionId: 'wrun_1' }, 1)
    await store.put('a', { sessionId: 'wrun_1' }, 2)
    await store.put('a', { sessionId: 'wrun_2' }, 3)
    expect((await store.list())[0]!.sessions).toEqual(['wrun_1', 'wrun_2'])
  })

  it('sets and clears the model', async () => {
    const store = new ChatStore(file)
    expect((await store.put('a', { model: 'qwen' })).model).toBe('qwen')
    expect((await store.put('a', { title: 'x' })).model).toBe('qwen')
    expect((await store.put('a', { model: null })).model).toBeUndefined()
  })

  it('keeps imported timestamps but never in the future', async () => {
    const store = new ChatStore(file)
    const chat = await store.put('a', { createdAt: 500, updatedAt: 9_999 }, 1_000)
    expect(chat).toMatchObject({ createdAt: 500, updatedAt: 1_000 })
  })

  it('survives a restart and removes', async () => {
    await new ChatStore(file).put('a', { title: 't', sessionId: 's1' }, 1)
    const store = new ChatStore(file)
    expect((await store.list())[0]).toMatchObject({ id: 'a', title: 't', sessions: ['s1'] })
    expect(await store.remove('a')).toBe(true)
    expect(await store.remove('a')).toBe(false)
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual([])
  })

  it('serialises concurrent writes', async () => {
    const store = new ChatStore(file)
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.put(`c${i}`, {}, i + 1)))
    expect(await new ChatStore(file).list()).toHaveLength(20)
  })
})

describe('chatPatch', () => {
  it('rejects unknown fields and bad session ids', () => {
    expect(chatPatch.safeParse({ events: [] }).success).toBe(false)
    expect(chatPatch.safeParse({ sessionId: '../x' }).success).toBe(false)
    expect(chatPatch.safeParse({ sessionId: 'wrun_01ABC', model: null }).success).toBe(true)
  })
})
