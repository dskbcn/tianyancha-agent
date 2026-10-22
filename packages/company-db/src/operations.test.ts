import { describe, expect, it } from 'vitest'
import type { CompanyDb } from './client.ts'
import { lookupCompany } from './operations.ts'

/** A CompanyDb that answers every call with a canned server response. */
function stubDb(response: unknown): CompanyDb {
  return { call: async () => response } as unknown as CompanyDb
}

describe('lookupCompany', () => {
  it('works with query_table responses, which carry no columns', async () => {
    // Shape recorded from the live server, 2026-10-22.
    const db = stubDb({
      table: 'tyc_advanced_search_companies',
      row_count: 1,
      rows: [{ id: 3732676, company_name: '浙江都快传媒集团有限公司', established_date: '2020-06-11' }],
    })
    const result = await lookupCompany(db, { name: '都快传媒' }, { exposeContacts: false })
    expect(result.rowCount).toBe(1)
    expect(result.rows[0]?.company_name).toBe('浙江都快传媒集团有限公司')
    expect(result.columns).toContain('company_name')
    expect(result.columns).not.toContain('legal_representative')
  })
})
