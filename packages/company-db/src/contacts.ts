/** Personal data in tyc_advanced_search_companies. Stripped unless EXPOSE_CONTACTS=true. */
export const CONTACT_COLUMNS = [
  'legal_representative',
  'valid_mobile_phone',
  'more_phones',
  'email',
  'other_email',
] as const

const CONTACT_SET = new Set<string>(CONTACT_COLUMNS)

export interface Table {
  columns: string[]
  rows: Record<string, unknown>[]
}

/**
 * Removes contact columns from a result, by column name after the query ran, so free SQL
 * (aliases aside) cannot select its way around it. An alias such as `email AS e` is caught by
 * `mentionsContacts` in the SQL guard instead.
 */
export function stripContacts(table: Table): Table & { stripped: string[] } {
  const stripped = table.columns.filter((column) => CONTACT_SET.has(column))
  if (stripped.length === 0) return { ...table, stripped }
  const columns = table.columns.filter((column) => !CONTACT_SET.has(column))
  const rows = table.rows.map((row) => Object.fromEntries(columns.map((c) => [c, row[c]])))
  return { columns, rows, stripped }
}

export function mentionsContacts(sql: string): string[] {
  return CONTACT_COLUMNS.filter((column) => new RegExp(`\\b${column}\\b`, 'i').test(sql))
}
