import { CompanyDbError, type CompanyDb } from './client.ts'
import { mentionsContacts, stripContacts, type Table } from './contacts.ts'
import { lintSql, SERVER_ROW_CAP } from './sql.ts'

export const COMPANIES = 'tyc_advanced_search_companies'

export interface Options {
  exposeContacts: boolean
  signal?: AbortSignal
}

export interface QueryResult extends Table {
  rowCount: number
  /** Ours, not the server's: a full page may have been cut (spike 0.1). */
  truncated: boolean
  warnings: string[]
  ms: number
}

interface ServerTable {
  columns: string[]
  rows: Record<string, unknown>[]
  row_count: number
}

export async function runSql(
  db: CompanyDb,
  sql: string,
  { limit = SERVER_ROW_CAP, ...options }: Options & { limit?: number },
): Promise<QueryResult> {
  const warnings = lintSql(sql)
  if (!options.exposeContacts && mentionsContacts(sql).length > 0) {
    throw new CompanyDbError(
      `不允许查询联系人字段（${mentionsContacts(sql).join(', ')}）。这些字段默认不对外开放。`,
    )
  }
  const pageSize = Math.min(limit, SERVER_ROW_CAP)
  const started = performance.now()
  const result = (await db.call('query', { sql, limit: pageSize }, { signal: options.signal })) as ServerTable
  return finish(result, pageSize, warnings, started, options)
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
    options,
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
  const columns = options.exposeContacts
    ? [...PROFILE_COLUMNS, 'legal_representative', 'valid_mobile_phone', 'email']
    : PROFILE_COLUMNS
  const started = performance.now()
  const result = (await db.call(
    'query_table',
    { table: COMPANIES, columns, filters, limit: code ? 1 : 10 },
    { signal: options.signal },
  )) as ServerTable
  return finish(result, code ? 1 : 10, [], started, options)
}

function finish(
  result: ServerTable,
  pageSize: number,
  warnings: string[],
  started: number,
  { exposeContacts }: Options,
): QueryResult {
  const table = exposeContacts
    ? { columns: result.columns, rows: result.rows }
    : stripContacts({ columns: result.columns, rows: result.rows })
  return {
    columns: table.columns,
    rows: table.rows,
    rowCount: result.rows.length,
    truncated: result.rows.length >= pageSize,
    warnings,
    ms: Math.round(performance.now() - started),
  }
}
