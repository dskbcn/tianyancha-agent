import path from 'node:path'
import {
  ForbiddenError,
  httpBasic,
  localDev,
  none,
  routeAuth,
  withAuthChallenges,
  type AuthFn,
} from 'eve/channels/auth'
import { ChatStore } from '#lib/chats.ts'
import { outputRoot } from '#lib/db.ts'

export const REALM = 'tianyancha-agent'

/** An authenticated caller; `principalId` is the login's username (`local-dev` under eve dev). */
export type Caller = Exclude<Awaited<ReturnType<typeof routeAuth>>, Response>

/** The chat list, which also records whose a session is. */
export const chats = new ChatStore(path.join(outputRoot(), 'chats.json'))

export interface Login {
  username: string
  password: string
}

/**
 * Testers' logins: `AGENT_USERS` holds `name:password` entries separated by commas or new lines
 * (a password may contain `:`, not `,`), and `AGENT_USER`/`AGENT_PASSWORD` adds one more. The
 * username becomes the caller's principal id, which scopes chats and sessions.
 */
export function logins(env: Record<string, string | undefined> = process.env): Login[] {
  const out: Login[] = []
  for (const entry of (env.AGENT_USERS ?? '').split(/[,\n]/)) {
    const text = entry.trim()
    if (!text) continue
    const at = text.indexOf(':')
    const username = at > 0 ? text.slice(0, at).trim() : ''
    const password = at > 0 ? text.slice(at + 1) : ''
    if (!username || !password)
      throw new Error(`AGENT_USERS: "${username || text}" needs name:password`)
    out.push({ username, password })
  }
  if (env.AGENT_USER && env.AGENT_PASSWORD) {
    out.push({ username: env.AGENT_USER, password: env.AGENT_PASSWORD })
  }
  const names = out.map((l) => l.username)
  const twice = names.find((n, i) => names.indexOf(n) !== i)
  if (twice) throw new Error(`AGENT_USERS: "${twice}" is listed twice`)
  return out
}

/**
 * One auth policy for every channel and route (weixin-article-agent's), so a new route cannot
 * open a less-protected door. eve fails closed: no match is a 401 in production.
 */
export function routePolicy(realm: string): AuthFn<Request>[] {
  return [
    ...logins().map((login) => httpBasic(login, { realm })),
    // Only authenticates inside an `eve dev` process.
    localDev(),
    // A trusted private network where the proxy authenticates. Never on a public host.
    ...(process.env.AGENT_PUBLIC === 'true' ? [none()] : []),
  ]
}

/**
 * The eve channel's policy: `routePolicy`, and a session route (`/eve/v1/session/:id…`) only for a
 * session no other login's chat holds. eve does not scope sessions to callers by itself.
 */
export function sessionPolicy(realm: string): AuthFn<Request> {
  const policy = routePolicy(realm)
  return withAuthChallenges(
    async (request) => {
      const id = /^\/eve\/v1\/session\/([^/]+)/.exec(new URL(request.url).pathname)?.[1]
      const result = await authenticate(request, id && decodeURIComponent(id), policy)
      // A 401 skips, so eve answers with its own challenge; a 403 ends the walk.
      if (result instanceof Response) {
        if (result.status === 401) return null
        throw new ForbiddenError({ message: 'This session belongs to another login.' })
      }
      return result
    },
    logins().length > 0 ? [{ scheme: 'Basic', parameters: { realm, charset: 'UTF-8' } }] : [],
  )
}

/**
 * The caller of a custom route, or the response that refuses them: 401 without a login, 403 for
 * a session another login's chat holds. Always `return` the response.
 */
export async function authenticate(
  request: Request,
  sessionId?: string,
  policy = routePolicy(REALM),
): Promise<Caller | Response> {
  // `routeAuth` returns its 401 rather than throwing, so a route that only awaited it served every
  // request (found in a production build, 2026-10-22).
  const result = await routeAuth(request, policy)
  if (result instanceof Response) return result
  if (sessionId && !(await chats.mayUse(result.principalId, sessionId))) {
    return Response.json(
      { ok: false, code: 'forbidden', error: 'This session belongs to another login.' },
      { status: 403, headers: { 'cache-control': 'no-store' } },
    )
  }
  return result
}

/** `authenticate` for routes that need only a yes or no. Always `return` what this gives. */
export async function denied(request: Request, sessionId?: string): Promise<Response | null> {
  const result = await authenticate(request, sessionId)
  return result instanceof Response ? result : null
}
