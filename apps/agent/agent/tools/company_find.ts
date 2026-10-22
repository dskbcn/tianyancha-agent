import { CompanyDbError, findCompanies } from '@tianyancha-agent/company-db'
import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { breakdown, breakdownText } from '#lib/breakdown.ts'
import { companyDb, MODEL_ROWS, modelTable, saveCsv, UI_PREVIEW_ROWS } from '#lib/db.ts'

export default defineTool({
  description:
    '按"做什么业务"圈定企业的唯一工具：名单、数量、分布都用它（如"杭州近一年做人工智能的公司有多少、在哪些区"）。' +
    '先按关键词在名称和经营范围里圈出候选，再按与业务描述的语义相似度打分；结果自带按区县、月份、登记状态、行业大类的分布。耗时 40–60 秒。' +
    '先不设 minScore，看 scoreDistribution 再决定截断位置；经验上 0.5 左右是真假分界。',
  inputSchema: z.object({
    description: z
      .string()
      .describe('一句话描述目标企业的业务，越具体越好，例如"从事人工智能技术研发与应用的公司，包括机器学习、计算机视觉、大模型"'),
    keywords: z
      .array(z.string())
      .min(1)
      .describe('名称/经营范围子串匹配的关键词，务必展开同义词和工商规范表述'),
    filters: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('结构化条件，写法同 query_table，如 {"city":"杭州市","established_date":{"op":"gte","value":"2025-10-22"}}'),
    minScore: z.number().min(0).max(1).optional().describe('相似度下限 0–1'),
  }),
  async execute(input, ctx) {
    const { db, config } = companyDb()
    try {
      const result = await findCompanies(
        db,
        { ...input, limit: config.findRowCap },
        { exposeContacts: config.exposeContacts, signal: ctx.abortSignal },
      )
      const file =
        result.rowCount > 0
          ? await saveCsv(ctx.session.id, ctx.callId, input.description, result.columns, result.rows)
          : null
      return {
        kind: 'table' as const,
        purpose: input.description,
        keywords: input.keywords,
        columns: result.columns,
        rows: result.rows.slice(0, UI_PREVIEW_ROWS),
        rowCount: result.rowCount,
        truncated: result.truncated,
        keywordHits: result.keywordHits,
        semanticOnly: result.semanticOnly,
        scoreDistribution: result.scoreDistribution,
        breakdown: breakdown(result.rows),
        warnings: [] as string[],
        ms: result.ms,
        file,
      }
    } catch (error) {
      if (error instanceof CompanyDbError) return { kind: 'error' as const, purpose: input.description, error: error.message }
      throw error
    }
  },
  label: {
    start: ({ description }) => `查找企业：${description.slice(0, 30)}`,
    complete: (_input, output) =>
      'error' in output ? '查找企业（失败）' : `找到 ${output.rowCount} 家企业，${(output.ms / 1000).toFixed(0)} 秒`,
  },
  toModelOutput(output) {
    if (output.kind === 'error') return { type: 'text', value: `查找失败：${output.error}` }
    const lines = [
      `关键词候选 ${output.keywordHits} 家，语义补充 ${output.semanticOnly} 家；返回 ${output.rowCount} 家${output.truncated ? `（达到上限，未取完）` : ''}。`,
      `分数分布（累计）：${JSON.stringify(output.scoreDistribution)}`,
      output.rowCount > 0
        ? `以下分布基于返回的 ${output.rowCount} 家${output.truncated ? '（未取完，用 minScore 收窄后再统计）' : ''}：\n${breakdownText(output.breakdown)}`
        : '',
      output.rowCount > 0 ? `完整名单已存为 ${output.file?.name}，界面上有下载链接。前 ${Math.min(MODEL_ROWS, output.rowCount)} 家：` : '',
      output.rowCount > 0 ? modelTable(output.columns, output.rows) : '',
    ]
    return { type: 'text', value: lines.filter(Boolean).join('\n') }
  },
})
