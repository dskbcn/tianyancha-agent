import { defineChannel, DELETE, GET, PUT } from 'eve/channels'
import { authenticate, chats } from '#lib/auth.ts'
import { chatId, chatPatch } from '#lib/chats.ts'

const noStore = { 'cache-control': 'private, no-store' }

/**
 * The web UI's chat list (lib/chats.ts): each login sees and changes only its own chats. The UI
 * renders a chat by replaying its sessions' eve streams.
 */
export default defineChannel({
  routes: [
    GET('/chats', async (request) => {
      const caller = await authenticate(request)
      if (caller instanceof Response) return caller
      return Response.json(await chats.list(caller.principalId), { headers: noStore })
    }),
    PUT('/chats/:id', async (request, { params }) => {
      const caller = await authenticate(request)
      if (caller instanceof Response) return caller
      const id = chatId.safeParse(params.id)
      const patch = chatPatch.safeParse(await request.json().catch(() => undefined))
      if (!id.success || !patch.success) return new Response('bad request', { status: 400 })
      const result = await chats.put(caller.principalId, id.data, patch.data)
      if (!result.ok) {
        return result.reason === 'chat'
          ? new Response('not found', { status: 404 })
          : new Response('session belongs to another login', { status: 403 })
      }
      return Response.json(result.chat, { headers: noStore })
    }),
    DELETE('/chats/:id', async (request, { params }) => {
      const caller = await authenticate(request)
      if (caller instanceof Response) return caller
      const id = chatId.safeParse(params.id)
      if (!id.success || !(await chats.remove(caller.principalId, id.data))) {
        return new Response('not found', { status: 404 })
      }
      return new Response(null, { status: 204 })
    }),
  ],
})
