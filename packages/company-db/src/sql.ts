/** `query` returns at most this many rows, and says `truncated: false` when it cut them (spike 0.1). */
export const SERVER_ROW_CAP = 2000

/**
 * SQL that cannot run, caught before a round trip with a hint the model can act on.
 * Returns the problem, or undefined when the statement may go to the server.
 */
export function rejectSql(sql: string): string | undefined {
  if (/\bfilter\s*\(\s*\(\s*where\b/i.test(sql)) {
    return 'SQL 语法错误：FILTER 后多了一层括号。写成 COUNT(*) FILTER (WHERE a OR b)，需要分组时用 FILTER (WHERE (a OR b) AND c)。'
  }
  return undefined
}

/** Pitfalls from spikes 0.2 and 0.3, reported to the model next to the result. */
export function lintSql(sql: string): string[] {
  const warnings: string[] = []
  if (/\bdate_trunc\s*\(/i.test(sql)) {
    warnings.push(
      'date_trunc 返回带时区偏移的时间戳，分组会错位。按月用 LEFT(established_date,7)，按年用 LEFT(established_date,4)。',
    )
  }
  if (/_date\s*(?:[<>]=?|=|between)\s*'(?!\d{4}-\d{2}-\d{2}')/i.test(sql)) {
    warnings.push("日期字面量必须是 'YYYY-MM-DD'（例如 '2026-08-01'），否则字符串比较结果是错的。")
  }
  if (/\bprovince\s*(?:=|in\b|like\b)/i.test(sql)) {
    warnings.push("province 有 '浙江省' 和 '浙江' 两种写法，按 city 过滤。")
  }
  if (/order\s+by\s+(?:\w+\.)?id\b/i.test(sql) && /\bwhere\b/i.test(sql)) {
    warnings.push('带过滤条件时 ORDER BY id 可能触发服务端语句超时。')
  }
  if (/(?:<>|!=|\bnot\s+in\b)/i.test(sql)) {
    warnings.push('<> / NOT IN 会静默丢掉 NULL 行；需要时加 OR 列 IS NULL。')
  }
  return warnings
}
