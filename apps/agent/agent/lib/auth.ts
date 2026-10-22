import { httpBasic, localDev, none, type AuthFn } from 'eve/channels/auth'

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
