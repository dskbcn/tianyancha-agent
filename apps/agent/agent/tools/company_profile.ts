import { CompanyDbError, lookupCompany } from '@tianyancha-agent/company-db'
import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { companyDb } from '#lib/db.ts'

export default defineTool({
  description:
    '查一家企业的工商信息（含法定代表人、电话、邮箱、地址）：按统一社会信用代码精确查，或按名称模糊查（最多返回 10 个候选供确认）。',
  inputSchema: z
    .object({
      code: z.string().optional().describe('统一社会信用代码（18 位）'),
      name: z.string().optional().describe('公司名称或其中的关键部分'),
    })
    .refine((input) => input.code || input.name, '需要 code 或 name'),
  async execute(input, ctx) {
    const { db } = companyDb()
    try {
      const result = await lookupCompany(db, input, { signal: ctx.abortSignal })
      return {
        kind: 'profile' as const,
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rowCount,
        ms: result.ms,
      }
    } catch (error) {
      if (error instanceof CompanyDbError) return { kind: 'error' as const, error: error.message }
      throw error
    }
  },
  label: {
    start: ({ code, name }) => `查询企业：${name ?? code}`,
    complete: (_input, output) =>
      'error' in output
        ? '查询企业（失败）'
        : output.rowCount === 1
          ? `找到：${output.rows[0]?.company_name}`
          : `${output.rowCount} 个候选`,
  },
  toModelOutput(output) {
    if (output.kind === 'error') return { type: 'text', value: `查询失败：${output.error}` }
    if (output.rowCount === 0) return { type: 'text', value: '没有找到匹配的企业。' }
    return { type: 'json', value: output.rows as unknown as never }
  },
})
