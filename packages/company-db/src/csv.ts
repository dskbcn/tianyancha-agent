/** CSV with a UTF-8 BOM, so Excel opens Chinese text correctly. */
export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const lines = [columns.map(cell).join(',')]
  for (const row of rows) lines.push(columns.map((c) => cell(row[c])).join(','))
  return '﻿' + lines.join('\r\n') + '\r\n'
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}
