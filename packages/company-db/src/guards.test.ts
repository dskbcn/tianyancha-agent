import { describe, expect, it } from 'vitest'
import { toCsv } from './csv.ts'
import { cleanError } from './client.ts'
import { lintSql, rejectSql } from './sql.ts'

describe('lintSql', () => {
  it('flags the pitfalls from the spikes', () => {
    expect(lintSql("SELECT date_trunc('month', established_date::date) FROM t")).toHaveLength(1)
    expect(lintSql("SELECT 1 FROM t WHERE established_date >= '2026-8-1'")).toHaveLength(1)
    expect(lintSql("SELECT 1 FROM t WHERE province = '浙江省'")).toHaveLength(1)
    expect(lintSql("SELECT 1 FROM t WHERE enterprise_type <> '个体工商户'")).toHaveLength(1)
    expect(lintSql("SELECT COUNT(*) FROM t WHERE business_scope LIKE '%人工智能%'")).toHaveLength(1)
    expect(lintSql("SELECT COUNT(*) FROM t WHERE company_name ILIKE '%AI%'")).toHaveLength(1)
  })

  it('accepts ISO date comparisons and text grouping', () => {
    const sql =
      "SELECT LEFT(established_date,7) m, COUNT(*) FROM t WHERE city='杭州市' AND established_date >= '2026-01-01' GROUP BY 1"
    expect(lintSql(sql)).toEqual([])
  })
})

describe('toCsv', () => {
  it('writes a BOM, quotes where needed, and leaves nulls empty', () => {
    const csv = toCsv(['a', 'b'], [{ a: '含,逗号', b: null }, { a: 'say "hi"', b: 2 }])
    expect(csv).toBe('﻿a,b\r\n"含,逗号",\r\n"say ""hi""",2\r\n')
  })
})

describe('rejectSql', () => {
  it('rejects a doubled paren after FILTER, as the model wrote it', () => {
    expect(rejectSql("SELECT COUNT(*) FILTER ((WHERE company_name LIKE '%AI%')) FROM t")).toMatch(/FILTER/)
  })

  it('accepts FILTER with grouping inside WHERE', () => {
    expect(rejectSql("SELECT COUNT(*) FILTER (WHERE (a LIKE '%x%' OR b LIKE '%y%') AND c = 1) FROM t")).toBeUndefined()
  })
})

describe('cleanError', () => {
  it('strips terminal escape codes from server messages', () => {
    expect(cleanError('COUNT(*) FILTER ((\x1b[4mWHERE\x1b[0m company_name')).toBe('COUNT(*) FILTER ((WHERE company_name')
  })
})
