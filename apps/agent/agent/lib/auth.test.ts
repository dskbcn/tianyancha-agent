import { describe, expect, it } from 'vitest'
import { logins } from './auth.ts'

describe('logins', () => {
  it('reads AGENT_USERS and the single AGENT_USER', () => {
    expect(
      logins({
        AGENT_USERS: 'alice:a:1, bob:b2\ncarol:c3,',
        AGENT_USER: 'ops',
        AGENT_PASSWORD: 'x',
      }),
    ).toEqual([
      { username: 'alice', password: 'a:1' },
      { username: 'bob', password: 'b2' },
      { username: 'carol', password: 'c3' },
      { username: 'ops', password: 'x' },
    ])
    expect(logins({})).toEqual([])
  })

  it('fails on an entry without a password or a name listed twice', () => {
    expect(() => logins({ AGENT_USERS: 'alice' })).toThrow(/alice/)
    expect(() => logins({ AGENT_USERS: 'alice:', AGENT_USER: 'x' })).toThrow(/alice/)
    expect(() => logins({ AGENT_USERS: 'a:1,a:2' })).toThrow(/twice/)
  })
})
