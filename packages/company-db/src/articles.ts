import type { CompanyDb } from './client.ts'
import type { Options } from './operations.ts'

/**
 * 公众号文章 about companies settling in 杭州 (总部迁入、项目落地、新成立…), added upstream on
 * 2026-10-22. Spike 0.5: 467 articles from one account; search takes 0.2–0.4 s, a full article
 * 30 ms. Article bodies are not in the SQL whitelist, so get_article is the only way to read them.
 */
export const ARTICLES = 'wechat_articles'

export interface ArticleSearchInput {
  query: string
  keywords?: string[]
  settleTypes?: string[]
  districts?: string[]
  dateFrom?: string
  dateTo?: string
  companyId?: number
  limit?: number
}

export interface ArticleHit {
  article_id: number
  title: string
  account_name: string
  publish_date: string
  url: string
  company_name: string | null
  company_id: number | null
  district: string | null
  settle_type: string | null
  read_count: number | null
  snippet: string
  matched_keywords?: string[] | null
  source: 'vector' | 'keyword' | 'both'
  score: number | null
}

export async function searchArticles(
  db: CompanyDb,
  input: ArticleSearchInput,
  { signal }: Options,
): Promise<{ rows: ArticleHit[]; ms: number }> {
  const started = performance.now()
  const result = (await db.call(
    'search_articles',
    {
      query: input.query,
      keywords: input.keywords?.length ? input.keywords : null,
      settle_types: input.settleTypes?.length ? input.settleTypes : null,
      districts: input.districts?.length ? input.districts : null,
      date_from: input.dateFrom ?? null,
      date_to: input.dateTo ?? null,
      company_id: input.companyId ?? null,
      limit: input.limit ?? 10,
    },
    { signal },
  )) as { rows: ArticleHit[] }
  return { rows: result.rows, ms: Math.round(performance.now() - started) }
}

export interface Article {
  article_id: number
  title: string
  account_name: string
  publish_date: string
  url: string
  company_name: string | null
  company_id: number | null
  credit_code: string | null
  district: string | null
  origin_city: string | null
  settle_type: string | null
  read_count: number | null
  llm_reason: string | null
  related_companies: string[] | null
  content_text: string
  total_chars: number
  offset: number
  next_offset: number | null
}

export async function readArticle(
  db: CompanyDb,
  { articleId, offset = 0, maxChars }: { articleId: number; offset?: number; maxChars?: number },
  { signal }: Options,
): Promise<Article> {
  return (await db.call(
    'get_article',
    { article_id: articleId, offset, max_chars: maxChars ?? null },
    { signal },
  )) as Article
}
