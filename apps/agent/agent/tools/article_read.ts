import { CompanyDbError, readArticle } from '@tianyancha-agent/company-db'
import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { companyDb } from '#lib/db.ts'

export default defineTool({
  description:
    '读取一篇公众号文章的元数据和正文（article_search 返回的 article_id）。正文较长时分段：' +
    '结果里 nextOffset 不为空就用它作为 offset 再读。related_companies 是自动抽取的，可能有噪音。',
  inputSchema: z.object({
    articleId: z.number().int().describe('文章 id（article_search 结果里的 #编号）'),
    offset: z.number().int().min(0).default(0).describe('正文起始位置'),
  }),
  async execute({ articleId, offset }, ctx) {
    const { db } = companyDb()
    try {
      const article = await readArticle(
        db,
        { articleId, offset, maxChars: 8000 },
        { signal: ctx.abortSignal },
      )
      return { kind: 'article' as const, ...article }
    } catch (error) {
      if (error instanceof CompanyDbError) return { kind: 'error' as const, error: error.message }
      throw error
    }
  },
  label: {
    start: ({ articleId }) => `读取文章 #${articleId}`,
    complete: (_input, output) =>
      output.kind === 'error' ? '读取文章（失败）' : `读完：${output.title}`,
  },
  toModelOutput(output) {
    if (output.kind === 'error') return { type: 'text', value: `读取失败：${output.error}` }
    const meta = [
      `《${output.title}》 ${output.account_name} · ${output.publish_date} · ${output.url}`,
      `落地类型：${output.settle_type ?? '-'}；区县：${output.district ?? '未标注'}；来源城市：${output.origin_city ?? '-'}`,
      `主体企业：${output.company_name ?? '未关联'}${output.company_id ? `（company_id ${output.company_id}，信用代码 ${output.credit_code ?? '-'}）` : ''}`,
      output.llm_reason ? `入库判定理由：${output.llm_reason}` : '',
      output.related_companies?.length
        ? `相关企业（自动抽取，可能有噪音）：${output.related_companies.join('、')}`
        : '',
      `正文 ${output.offset}–${output.offset + output.content_text.length} / ${output.total_chars} 字${output.next_offset !== null ? `，未读完：offset ${output.next_offset} 继续` : ''}`,
    ]
    return { type: 'text', value: `${meta.filter(Boolean).join('\n')}\n\n${output.content_text}` }
  },
})
