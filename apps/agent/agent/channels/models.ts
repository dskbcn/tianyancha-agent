import { defineChannel, GET } from 'eve/channels'
import { routeAuth } from 'eve/channels/auth'
import { routePolicy } from '#lib/auth.ts'
import { modelCatalog } from '#lib/models.ts'

/** The models the web UI may offer, and the default. */
export default defineChannel({
  routes: [
    GET('/models', async (request) => {
      await routeAuth(request, routePolicy('tianyancha-agent'))
      return Response.json(modelCatalog(), { headers: { 'cache-control': 'private, no-cache' } })
    }),
  ],
})
