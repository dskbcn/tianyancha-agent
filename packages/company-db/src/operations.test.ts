import { describe, expect, it } from 'vitest'
import type { CompanyDb } from './client.ts'
import { readArticle, searchArticles } from './articles.ts'
import { lookupCompany } from './operations.ts'

/** A CompanyDb that answers every call with a canned server response. */
function stubDb(response: unknown, calls: unknown[][] = []): CompanyDb {
  return {
    call: async (...args: unknown[]) => {
      calls.push(args)
      return response
    },
  } as unknown as CompanyDb
}

describe('lookupCompany', () => {
  it('works with query_table responses, which carry no columns', async () => {
    // Shape recorded from the live server, 2026-10-22.
    const db = stubDb({
      table: 'tyc_advanced_search_companies',
      row_count: 1,
      rows: [
        { id: 3732676, company_name: '浙江都快传媒集团有限公司', established_date: '2020-06-11' },
      ],
    })
    const result = await lookupCompany(db, { name: '都快传媒' }, {})
    expect(result.rowCount).toBe(1)
    expect(result.rows[0]?.company_name).toBe('浙江都快传媒集团有限公司')
    expect(result.columns).toContain('company_name')
  })
})

describe('articles', () => {
  it("sends search filters under the server's names and drops empty ones", async () => {
    const calls: unknown[][] = []
    await searchArticles(
      stubDb({ rows: [] }, calls),
      { query: '机器人研发中心', keywords: [], settleTypes: ['研发中心'], dateFrom: '2026-01-01' },
      {},
    )
    expect(calls[0]?.[0]).toBe('search_articles')
    expect(calls[0]?.[1]).toMatchObject({
      query: '机器人研发中心',
      keywords: null,
      settle_types: ['研发中心'],
      districts: null,
      date_from: '2026-01-01',
      limit: 10,
    })
  })

  it('reads an article page by id and offset', async () => {
    const calls: unknown[][] = []
    await readArticle(stubDb({ content_text: '…' }, calls), { articleId: 299, offset: 4000 }, {})
    expect(calls[0]?.[1]).toEqual({ article_id: 299, offset: 4000, max_chars: null })
  })
})
