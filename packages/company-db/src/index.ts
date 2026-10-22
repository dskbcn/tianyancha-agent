export { cleanError, CompanyDb, CompanyDbError, type CompanyDbConfig } from './client.ts'
export { toCsv } from './csv.ts'
export {
  COMPANIES,
  findCompanies,
  lookupCompany,
  runSql,
  type FindInput,
  type FindResult,
  type Options,
  type QueryResult,
} from './operations.ts'
export { lintSql, rejectSql, SERVER_ROW_CAP } from './sql.ts'

/** Reads the data-source settings from the environment. Throws naming what is missing. */
export function configFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const url = env.COMPANY_DB_MCP_URL
  const apiKey = env.COMPANY_DB_API_KEY
  if (!url || !apiKey) {
    throw new Error('Set COMPANY_DB_MCP_URL and COMPANY_DB_API_KEY (see .env.example).')
  }
  return {
    url,
    apiKey,
    concurrency: Number(env.COMPANY_DB_CONCURRENCY ?? 3),
    findRowCap: Number(env.FIND_ROW_CAP ?? 5000),
  }
}
