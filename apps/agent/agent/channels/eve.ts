import { defaultEveAuth, eveChannel } from 'eve/channels/eve'
import { routePolicy } from '#lib/auth.ts'
import { isOffered } from '#lib/models.ts'

export default eveChannel({
  auth: routePolicy('tianyancha-agent'),
  /**
   * The web UI sends the chosen model as `clientContext: { model }`. Move it onto the turn's auth
   * attributes, where agent.ts reads it, and keep it out of the model's context. An id that is not
   * offered (lib/models.ts) is dropped, and the default model answers.
   */
  onMessage(ctx) {
    const auth = defaultEveAuth(ctx)
    const sent = ctx.eve.clientContext
    if (!sent || typeof sent !== 'object' || Array.isArray(sent) || !('model' in sent)) return { auth }
    const { model, ...rest } = sent as Record<string, unknown>
    const clientContext = Object.keys(rest).length > 0 ? (rest as typeof sent) : []
    if (!auth || !isOffered(model)) return { auth, clientContext }
    return { auth: { ...auth, attributes: { ...auth.attributes, model } }, clientContext }
  },
})
