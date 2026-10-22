import { CompanyDbError, type CompanyDb } from './client.ts'
import { lintSql, rejectSql, SERVER_ROW_CAP } from './sql.ts'

export const COMPANIES = 'tyc_advanced_search_companies'

export interface Options {
  signal?: AbortSignal
}

export interface QueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  /** Ours, not the server's: a full page may have been cut (spike 0.1). */
  truncated: boolean
  warnings: string[]
  ms: number
}

/** `query` sends `columns`; `query_table` sends only `table`, `row_count` and `rows`. */
interface ServerTable {
  columns?: string[]
  rows: Record<string, unknown>[]
  row_count: number
}

export async function runSql(
  db: CompanyDb,
  sql: string,
  { limit = SERVER_ROW_CAP, ...options }: Options & { limit?: number },
): Promise<QueryResult> {
  const rejected = rejectSql(sql)
  if (rejected) throw new CompanyDbError(rejected)
  const warnings = lintSql(sql)
  const pageSize = Math.min(limit, SERVER_ROW_CAP)
  const started = performance.now()
  const result = (await db.call(
    'query',
    { sql, limit: pageSize },
    { signal: options.signal },
  )) as ServerTable
  return finish(result, pageSize, warnings, started)
}

export interface FindInput {
  description: string
  keywords: string[]
  filters?: Record<string, unknown>
  minScore?: number
  limit: number
}

export interface FindResult extends QueryResult {
  keywordHits: number
  semanticOnly: number
  scoreDistribution: Record<string, number>
}

export async function findCompanies(
  db: CompanyDb,
  input: FindInput,
  options: Options,
): Promise<FindResult> {
  const started = performance.now()
  const result = (await db.call(
    'find_companies',
    {
      description: input.description,
      keywords: input.keywords,
      filters: input.filters ?? null,
      min_score: input.minScore ?? null,
      limit: input.limit,
    },
    { timeoutMs: 240_000, signal: options.signal },
  )) as {
    rows: Record<string, unknown>[]
    keyword_hits: number
    semantic_only: number
    score_distribution: Record<string, number>
    next_offset: number | null
  }
  const columns = result.rows[0] ? Object.keys(result.rows[0]) : []
  const table = finish(
    { columns, rows: result.rows, row_count: result.rows.length },
    Number.POSITIVE_INFINITY,
    [],
    started,
  )
  return {
    ...table,
    truncated: result.next_offset !== null,
    keywordHits: result.keyword_hits,
    semanticOnly: result.semantic_only,
    scoreDistribution: result.score_distribution,
  }
}

const PROFILE_COLUMNS = [
  'id',
  'company_name',
  'legal_representative',
  'unified_social_credit_code',
  'registration_status',
  'enterprise_type',
  'enterprise_size',
  'registered_capital',
  'paid_in_capital',
  'established_date',
  'approved_date',
  'business_term',
  'city',
  'district_county',
  'industry_category',
  'industry_major',
  'industry_subcategory',
  'insured_person_count',
  'registered_address',
  'latest_annual_report_address',
  'mailing_address',
  'valid_mobile_phone',
  'more_phones',
  'email',
  'other_email',
  'website',
  'former_names',
  'business_scope',
  'tianyan_score',
]

/** One company by credit code, or up to 10 candidates by name. */
export async function lookupCompany(
  db: CompanyDb,
  { code, name }: { code?: string; name?: string },
  options: Options,
): Promise<QueryResult> {
  const filters = code
    ? { unified_social_credit_code: code }
    : { company_name: { op: 'ilike', value: `%${name}%` } }
  const columns = PROFILE_COLUMNS
  const started = performance.now()
  const result = (await db.call(
    'query_table',
    { table: COMPANIES, columns, filters, limit: code ? 1 : 10 },
    { signal: options.signal },
  )) as ServerTable
  return finish({ ...result, columns: result.columns ?? columns }, code ? 1 : 10, [], started)
}

function finish(
  result: ServerTable,
  pageSize: number,
  warnings: string[],
  started: number,
): QueryResult {
  return {
    columns: result.columns ?? Object.keys(result.rows[0] ?? {}),
    rows: result.rows,
    rowCount: result.rows.length,
    truncated: result.rows.length >= pageSize,
    warnings,
    ms: Math.round(performance.now() - started),
  }
}
