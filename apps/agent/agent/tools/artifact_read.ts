import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { readMeta, readVersion } from '#lib/artifacts.ts'

export default defineTool({
  description:
    '读取产物当前的 HTML 源码（不含注入的数据和库），用于在 artifact_edit 前确认要替换的原文。只在不确定当前内容时使用。',
  inputSchema: z.object({
    id: z.string().describe('产物 id'),
    offset: z.number().int().min(0).default(0).describe('从第几个字符开始'),
    limit: z.number().int().min(1).max(100_000).default(40_000).describe('返回多少字符'),
  }),
  async execute({ id, offset, limit }, ctx) {
    const meta = await readMeta(ctx.session.id, id)
    const latest = meta?.versions.at(-1)
    const html = meta && latest ? await readVersion(ctx.session.id, id, latest.version) : null
    if (!meta || !latest || html === null) return { error: `没有 id 为 ${id} 的产物。` }
    return {
      id,
      title: meta.title,
      version: latest.version,
      data: latest.data,
      totalChars: html.length,
      offset,
      truncated: offset + limit < html.length,
      html: html.slice(offset, offset + limit),
    }
  },
  label: { start: () => '读取产物源码' },
})
