import { cellText, COLUMN_LABELS, isNumeric } from '../format.ts'

export function DataTable({
  columns,
  rows,
  maxHeight = 320,
}: {
  columns: string[]
  rows: Record<string, unknown>[]
  maxHeight?: number
}) {
  const numeric = new Set(
    columns.filter((c) => rows.length > 0 && rows.every((r) => r[c] == null || isNumeric(r[c]))),
  )
  return (
    <div className="overflow-auto rounded-lg border border-line bg-surface" style={{ maxHeight }}>
      <table className="w-full border-collapse text-[13px] tabular-nums">
        <thead className="sticky top-0 z-10 bg-sunken">
          <tr>
            <th className="w-10 border-b border-line px-2 py-2 text-right font-normal text-faint">
              #
            </th>
            {columns.map((c) => (
              <th
                key={c}
                className={`border-b border-line px-3 py-2 font-medium whitespace-nowrap ${numeric.has(c) ? 'text-right' : 'text-left'}`}
                title={c}
              >
                {COLUMN_LABELS[c] ?? c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="odd:bg-surface even:bg-bg/60 hover:bg-accent-soft/60">
              <td className="border-b border-line/60 px-2 py-1.5 text-right text-faint">{i + 1}</td>
              {columns.map((c) => (
                <td
                  key={c}
                  className={`max-w-[28rem] truncate border-b border-line/60 px-3 py-1.5 ${numeric.has(c) ? 'text-right' : ''} ${row[c] == null ? 'text-faint' : ''}`}
                  title={typeof row[c] === 'string' ? (row[c] as string) : undefined}
                >
                  {cellText(row[c], c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
