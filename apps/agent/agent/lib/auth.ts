import { httpBasic, localDev, none, routeAuth, type AuthFn } from 'eve/channels/auth'

/**
 * One auth policy for every channel and route (weixin-article-agent's), so a new route cannot
 * open a less-protected door. eve fails closed: no match is a 401 in production.
 */
export function routePolicy(realm: string): AuthFn<Request>[] {
  const username = process.env.AGENT_USER
  const password = process.env.AGENT_PASSWORD
  return [
    ...(username && password ? [httpBasic({ username, password }, { realm })] : []),
    // Only authenticates inside an `eve dev` process.
    localDev(),
    // A trusted private network where the proxy authenticates. Never on a public host.
    ...(process.env.AGENT_PUBLIC === 'true' ? [none()] : []),
  ]
}

export const REALM = 'tianyancha-agent'

/**
 * Auth for a custom route: the 401 to send back, or null when the caller may proceed.
 * `routeAuth` returns its 401 rather than throwing, so a route that only awaited it served every
 * request (found in a production build, 2026-10-22). Always `return` what this gives.
 */
export async function denied(request: Request): Promise<Response | null> {
  const result = await routeAuth(request, routePolicy(REALM))
  return result instanceof Response ? result : null
}
