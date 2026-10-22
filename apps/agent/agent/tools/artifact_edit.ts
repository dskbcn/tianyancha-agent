import { applyEdits, validate } from '@tianyancha-agent/artifacts'
import { defineTool } from 'eve/tools'
import { z } from 'zod'
import {
  artifactUrls,
  loadData,
  missingData,
  readMeta,
  readVersion,
  saveVersion,
} from '#lib/artifacts.ts'

export default defineTool({
  description:
    '对已有产物做局部修改（改标题、换图表类型、改配色、加一页等），不必重写整页。一次请求的所有修改放进同一次调用：' +
    '按顺序应用，生成一个新版本。每个 old_string 必须在当前页面里恰好出现一次。需要换数据时传 data（会与原有引用合并）。',
  inputSchema: z.object({
    id: z.string().describe('产物 id'),
    edits: z
      .array(z.object({ old_string: z.string(), new_string: z.string() }))
      .min(1)
      .max(30)
      .describe('精确替换，按顺序应用'),
    data: z
      .record(z.string(), z.string())
      .optional()
      .describe('新增或替换的数据引用：别名 → 查询结果文件名'),
  }),
  async execute({ id, edits, data }, ctx) {
    const started = performance.now()
    const meta = await readMeta(ctx.session.id, id)
    const latest = meta?.versions.at(-1)
    const current = meta && latest ? await readVersion(ctx.session.id, id, latest.version) : null
    if (!meta || !latest || current === null)
      return { kind: 'error' as const, title: id, error: `没有 id 为 ${id} 的产物。` }

    const applied = applyEdits(current, edits)
    if (!applied.ok) return { kind: 'error' as const, title: meta.title, error: applied.error }
    const checked = validate(applied.html)
    if (!checked.ok) return { kind: 'error' as const, title: meta.title, error: checked.error }
    const refs = { ...latest.data, ...data }
    const missing = await missingData(ctx.session.id, checked.html, refs)
    if (missing) return { kind: 'error' as const, title: meta.title, error: missing }
    try {
      await loadData(ctx.session.id, refs)
    } catch (error) {
      return { kind: 'error' as const, title: meta.title, error: (error as Error).message }
    }
    const next = await saveVersion(ctx.session.id, meta, checked.html, refs)
    const version = next.versions.at(-1)!.version
    return {
      kind: 'artifact' as const,
      id,
      title: meta.title,
      artifactKind: meta.kind,
      version,
      bytes: checked.bytes,
      data: Object.keys(refs),
      edits: edits.length,
      ms: Math.round(performance.now() - started),
      ...artifactUrls(ctx.session.id, id, version),
    }
  },
  label: {
    start: ({ edits }) => `修改产物（${edits?.length ?? 0} 处）`,
    complete: (_input, output) =>
      output.kind === 'error' ? '修改产物失败' : `${output.title}（v${output.version}）`,
  },
  toModelOutput(output) {
    if (output.kind === 'error')
      return { type: 'text', value: `修改失败，页面未变：${output.error}` }
    return {
      type: 'text',
      value: `已修改产物 ${output.id}，现在是 v${output.version}（${Math.round(output.bytes / 1024)} KB）。`,
    }
  },
})
