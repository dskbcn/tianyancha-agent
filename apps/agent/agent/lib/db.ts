import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { CompanyDb, configFromEnv, toCsv } from '@tianyancha-agent/company-db'

let cached: { db: CompanyDb; config: ReturnType<typeof configFromEnv> } | undefined

/** The process-wide MCP client; created on first use so a missing key fails the call, not boot. */
export function companyDb() {
  if (!cached) {
    const config = configFromEnv()
    cached = { db: new CompanyDb(config), config }
  }
  return cached
}

export function outputRoot(): string {
  return path.resolve(process.env.OUTPUT_DIR ?? './output')
}

export interface SavedFile {
  name: string
  /** Served by agent/channels/files.ts behind the same auth as the chat. */
  url: string
  rows: number
}

/** Writes a full result as CSV under OUTPUT_DIR/<sessionId>/ and returns its download link. */
export async function saveCsv(
  sessionId: string,
  callId: string,
  stem: string,
  columns: string[],
  rows: Record<string, unknown>[],
): Promise<SavedFile> {
  const dir = path.join(outputRoot(), safe(sessionId))
  await mkdir(dir, { recursive: true })
  const name = `${safe(stem).slice(0, 40) || 'result'}-${safe(callId).slice(-6)}.csv`
  await writeFile(path.join(dir, name), toCsv(columns, rows))
  // The same rows as JSON, for artifacts that load a result as window.DATA.
  await writeFile(
    path.join(dir, name.replace(/\.csv$/, '.json')),
    JSON.stringify({ columns, rows }),
  )
  return {
    name,
    url: `/files/${encodeURIComponent(safe(sessionId))}/${encodeURIComponent(name)}`,
    rows: rows.length,
  }
}

export function safe(segment: string): string {
  return segment.replace(/[^\p{L}\p{N}_-]+/gu, '_')
}

/** Rows the UI renders inline; the CSV holds the rest. Kept small: tool output is stored durably. */
export const UI_PREVIEW_ROWS = 100
/** Rows the model sees in full; above this it gets a slice and the CSV path. */
export const MODEL_ROWS = 30

export function modelTable(columns: string[], rows: Record<string, unknown>[]): string {
  const shown = rows.slice(0, MODEL_ROWS)
  const head = `| ${columns.join(' | ')} |\n|${columns.map(() => '---').join('|')}|`
  const body = shown.map((row) => `| ${columns.map((c) => fmt(row[c])).join(' | ')} |`).join('\n')
  return `${head}\n${body}`
}

function fmt(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).replaceAll('|', '/').replaceAll('\n', ' ').slice(0, 80)
}
