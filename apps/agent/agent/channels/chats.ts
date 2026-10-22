import path from 'node:path'
import { defineChannel, DELETE, GET, PUT } from 'eve/channels'
import { denied } from '#lib/auth.ts'
import { chatId, chatPatch, ChatStore } from '#lib/chats.ts'
import { outputRoot } from '#lib/db.ts'

const store = new ChatStore(path.join(outputRoot(), 'chats.json'))
const noStore = { 'cache-control': 'private, no-store' }

/**
 * The web UI's chat list (lib/chats.ts), behind the same auth as the chat. One shared login,
 * so one shared list. The UI renders a chat by replaying its sessions' eve streams.
 */
export default defineChannel({
  routes: [
    GET('/chats', async (request) => {
      const refused = await denied(request)
      if (refused) return refused
      return Response.json(await store.list(), { headers: noStore })
    }),
    PUT('/chats/:id', async (request, { params }) => {
      const refused = await denied(request)
      if (refused) return refused
      const id = chatId.safeParse(params.id)
      const patch = chatPatch.safeParse(await request.json().catch(() => undefined))
      if (!id.success || !patch.success) return new Response('bad request', { status: 400 })
      return Response.json(await store.put(id.data, patch.data), { headers: noStore })
    }),
    DELETE('/chats/:id', async (request, { params }) => {
      const refused = await denied(request)
      if (refused) return refused
      const id = chatId.safeParse(params.id)
      if (!id.success || !(await store.remove(id.data))) {
        return new Response('not found', { status: 404 })
      }
      return new Response(null, { status: 204 })
    }),
  ],
})
