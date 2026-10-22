import { CompanyDbError, runSql } from '@tianyancha-agent/company-db'
import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { companyDb, MODEL_ROWS, modelTable, saveCsv, UI_PREVIEW_ROWS } from '#lib/db.ts'

export default defineTool({
  description:
    '对企业库执行一条只读 SELECT（PostgreSQL），用于计数、分组汇总、排名和按条件取名单。' +
    '每次全表扫描约 15 秒，能用一条 SQL（COUNT(*) FILTER / GROUP BY）算完就不要拆成多条。' +
    '最多返回 2000 行；完整结果另存为 CSV 供用户下载。' +
    '不要用它按业务圈企业（LIKE 经营范围或公司名，如"人工智能""新能源"）：那类问题用 company_find。',
  inputSchema: z.object({
    purpose: z.string().describe('一句话说明这条查询要算什么，会显示给用户，例如"杭州 2026 年 8 月按区县的新增数"'),
    sql: z.string().describe('单条 SELECT 语句'),
  }),
  async execute({ purpose, sql }, ctx) {
    const { db, config } = companyDb()
    try {
      const result = await runSql(db, sql, { signal: ctx.abortSignal })
      const file =
        result.rowCount > 0
          ? await saveCsv(ctx.session.id, ctx.callId, purpose, result.columns, result.rows)
          : null
      return {
        kind: 'table' as const,
        purpose,
        sql,
        columns: result.columns,
        rows: result.rows.slice(0, UI_PREVIEW_ROWS),
        rowCount: result.rowCount,
        truncated: result.truncated,
        warnings: result.warnings,
        ms: result.ms,
        file,
      }
    } catch (error) {
      // Server validation and SQL errors are actionable: hand them to the model to fix and retry.
      if (error instanceof CompanyDbError) return { kind: 'error' as const, purpose, sql, error: error.message }
      throw error
    }
  },
  label: {
    start: ({ purpose }) => purpose,
    complete: ({ purpose }, output) =>
      'error' in output ? `${purpose}（失败）` : `${purpose}：${output.rowCount} 行，${(output.ms / 1000).toFixed(1)} 秒`,
  },
  toModelOutput(output) {
    if (output.kind === 'error') return { type: 'text', value: `查询失败：${output.error}` }
    const lines = [
      `${output.rowCount} 行${output.truncated ? '（达到 2000 行上限，可能被截断）' : ''}，用时 ${output.ms} ms。`,
      output.file ? `结果文件：${output.file.name}（做产物时在 data 里引用它）` : '',
      output.rowCount > MODEL_ROWS ? `下面是前 ${MODEL_ROWS} 行；完整结果在结果文件里，界面上有下载链接。` : '',
      output.rowCount > 0 ? modelTable(output.columns, output.rows) : '无结果。',
      ...output.warnings.map((w) => `注意：${w}`),
    ]
    return { type: 'text', value: lines.filter(Boolean).join('\n') }
  },
})
