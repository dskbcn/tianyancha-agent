/**
 * Counts over every row a company_find call returned, so the model can answer "按区县/按月"
 * from the find result instead of falling back to LIKE in SQL (it only sees 30 rows).
 */
export interface Breakdown {
  district: [string, number][]
  month: [string, number][]
  status: [string, number][]
  industry: [string, number][]
}

export function breakdown(rows: Record<string, unknown>[]): Breakdown {
  return {
    district: countBy(rows, (r) => r.district_county, 20),
    month: countBy(
      rows,
      (r) => (typeof r.established_date === 'string' ? r.established_date.slice(0, 7) : null),
      24,
    ).sort(([a], [b]) => a.localeCompare(b)),
    status: countBy(rows, (r) => r.registration_status, 10),
    industry: countBy(rows, (r) => r.industry_major, 12),
  }
}

function countBy(
  rows: Record<string, unknown>[],
  key: (row: Record<string, unknown>) => unknown,
  top: number,
) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const value = key(row)
    const label = value === null || value === undefined || value === '' ? '未标注' : String(value)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, top)
}

export function breakdownText(b: Breakdown): string {
  const line = (title: string, entries: [string, number][]) =>
    entries.length ? `${title}：${entries.map(([k, n]) => `${k} ${n}`).join('，')}` : ''
  return [
    line('按区县', b.district),
    line('按成立月份', b.month),
    line('按登记状态', b.status),
    line('按行业大类（前 12）', b.industry),
  ]
    .filter(Boolean)
    .join('\n')
}
