import { defaultEveAuth, eveChannel } from 'eve/channels/eve'
import { REALM, sessionPolicy } from '#lib/auth.ts'
import { isOffered } from '#lib/models.ts'

// A transcript carried into a fresh session when the old one ended (dev restart, redeploy).
const HISTORY_ENTRIES = 40
const HISTORY_ENTRY_CHARS = 8_000

export default eveChannel({
  // Logins, and each session only for the login whose chat holds it (lib/auth.ts).
  auth: sessionPolicy(REALM),
  /**
   * The web UI sends app state in `clientContext`, none of which is for the model:
   * - `model`: the chosen model. Moved onto the turn's auth attributes, where agent.ts reads it.
   *   An id that is not offered (lib/models.ts) is dropped, and the default model answers.
   * - `history`: when the server no longer has the chat's session (409 session_not_active after a
   *   restart), the UI starts a new one and sends the conversation so far as plain text. It becomes
   *   real prior turns through `history`.
   */
  onMessage(ctx) {
    const auth = defaultEveAuth(ctx)
    const sent = ctx.eve.clientContext
    if (!sent || typeof sent !== 'object' || Array.isArray(sent)) return { auth }
    const { model, history, ...rest } = sent as Record<string, unknown>
    if (model === undefined && history === undefined) return { auth }
    const clientContext = Object.keys(rest).length > 0 ? (rest as typeof sent) : []
    const imported = toHistory(history)
    return {
      auth:
        auth && isOffered(model) ? { ...auth, attributes: { ...auth.attributes, model } } : auth,
      clientContext,
      ...(imported ? { history: imported } : {}),
    }
  },
})

function toHistory(value: unknown): { role: 'user' | 'assistant'; text: string }[] | undefined {
  if (!Array.isArray(value)) return undefined
  const entries = value
    .filter(
      (e): e is { role: 'user' | 'assistant'; text: string } =>
        typeof e === 'object' &&
        e !== null &&
        (e.role === 'user' || e.role === 'assistant') &&
        typeof e.text === 'string' &&
        e.text.trim() !== '',
    )
    .slice(-HISTORY_ENTRIES)
    .map((e) => ({ role: e.role, text: e.text.slice(0, HISTORY_ENTRY_CHARS) }))
  return entries.length > 0 ? entries : undefined
}
