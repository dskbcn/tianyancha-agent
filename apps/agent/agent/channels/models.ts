import { defineChannel, GET } from 'eve/channels'
import { denied } from '#lib/auth.ts'
import { modelCatalog } from '#lib/models.ts'

/** The models the web UI may offer, and the default. */
export default defineChannel({
  routes: [
    GET('/models', async (request) => {
      const refused = await denied(request)
      if (refused) return refused
      return Response.json(modelCatalog(), { headers: { 'cache-control': 'private, no-cache' } })
    }),
  ],
})
