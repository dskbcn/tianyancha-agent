import { CompanyDbError, searchArticles } from '@tianyancha-agent/company-db'
import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { companyDb, saveCsv } from '#lib/db.ts'

export default defineTool({
  description:
    '按内容检索公众号文章（杭州企业落地动态：总部迁入、项目落地、新成立、新设子公司、研发中心），' +
    '返回标题、发布日期、落地类型、区县、主体企业（含 company_id）、链接和命中片段。' +
    '纯计数或按条件列清单用 company_sql 查 wechat_articles；看全文用 article_read。',
  inputSchema: z.object({
    query: z.string().describe('一句话描述要找的内容，如"机器人企业在杭州设立研发中心"'),
    keywords: z
      .array(z.string())
      .optional()
      .describe('必须命中的专有名词（公司名、品牌、人名），不要放"企业""杭州"这种泛词'),
    settleTypes: z
      .array(z.string())
      .optional()
      .describe('落地类型：总部迁入、项目落地、新成立、新设子公司、研发中心、新设团队/业务单元'),
    districts: z.array(z.string()).optional().describe('区县，带后缀，如 ["余杭区"]'),
    dateFrom: z.string().optional().describe('发布日期起，YYYY-MM-DD'),
    dateTo: z.string().optional().describe('发布日期止，YYYY-MM-DD'),
    companyId: z
      .number()
      .int()
      .optional()
      .describe('只看某家企业的文章：tyc_advanced_search_companies.id'),
    limit: z.number().int().min(1).max(50).default(10),
  }),
  async execute(input, ctx) {
    const { db } = companyDb()
    try {
      const { rows, ms } = await searchArticles(db, input, { signal: ctx.abortSignal })
      const columns = [
        'article_id',
        'publish_date',
        'settle_type',
        'district',
        'title',
        'company_name',
        'company_id',
        'read_count',
        'url',
      ]
      const file =
        rows.length > 0
          ? await saveCsv(
              ctx.session.id,
              ctx.callId,
              `文章_${input.query}`,
              columns,
              rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c as keyof typeof r]]))),
            )
          : null
      return { kind: 'articles' as const, query: input.query, rows, ms, file }
    } catch (error) {
      if (error instanceof CompanyDbError) return { kind: 'error' as const, error: error.message }
      throw error
    }
  },
  label: {
    start: ({ query }) => `检索文章：${query}`,
    complete: (_input, output) =>
      output.kind === 'error' ? '检索文章（失败）' : `找到 ${output.rows.length} 篇文章`,
  },
  toModelOutput(output) {
    if (output.kind === 'error') return { type: 'text', value: `检索失败：${output.error}` }
    if (output.rows.length === 0) return { type: 'text', value: '没有找到相关文章。' }
    const lines = output.rows.map(
      (r) =>
        `[#${r.article_id}] ${r.publish_date} ${r.settle_type ?? '-'} ${r.district ?? '区县未标注'}｜${r.title}｜` +
        `企业：${r.company_name ?? '未关联'}${r.company_id ? `（company_id ${r.company_id}）` : ''}｜` +
        `相关度 ${r.score?.toFixed(2) ?? '-'}（${r.source}）｜${r.url}\n  片段：${r.snippet.replace(/\s+/g, ' ').slice(0, 160)}`,
    )
    return {
      type: 'text',
      value: `${output.rows.length} 篇（按相关度）。结果文件：${output.file?.name}（做产物时在 data 里引用）\n${lines.join('\n')}`,
    }
  },
})
