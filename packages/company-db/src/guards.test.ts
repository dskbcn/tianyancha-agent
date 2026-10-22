import { describe, expect, it } from 'vitest'
import { mentionsContacts, stripContacts } from './contacts.ts'
import { toCsv } from './csv.ts'
import { lintSql } from './sql.ts'

describe('stripContacts', () => {
  it('removes contact columns from columns and rows', () => {
    const out = stripContacts({
      columns: ['company_name', 'email', 'legal_representative'],
      rows: [{ company_name: '甲', email: 'a@b.c', legal_representative: '张三' }],
    })
    expect(out.columns).toEqual(['company_name'])
    expect(out.rows).toEqual([{ company_name: '甲' }])
    expect(out.stripped).toEqual(['email', 'legal_representative'])
  })

  it('finds contact columns referenced under an alias', () => {
    expect(mentionsContacts('SELECT valid_mobile_phone AS p FROM t')).toEqual(['valid_mobile_phone'])
    expect(mentionsContacts('SELECT company_name FROM t')).toEqual([])
  })
})

describe('lintSql', () => {
  it('flags the pitfalls from the spikes', () => {
    expect(lintSql("SELECT date_trunc('month', established_date::date) FROM t")).toHaveLength(1)
    expect(lintSql("SELECT 1 FROM t WHERE established_date >= '2026-8-1'")).toHaveLength(1)
    expect(lintSql("SELECT 1 FROM t WHERE province = '浙江省'")).toHaveLength(1)
    expect(lintSql("SELECT 1 FROM t WHERE enterprise_type <> '个体工商户'")).toHaveLength(1)
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
