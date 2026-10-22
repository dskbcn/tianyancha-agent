import { validate } from '@tianyancha-agent/artifacts'
import { defineTool } from 'eve/tools'
import { z } from 'zod'
import { artifactUrls, loadData, missingData, newArtifactId, readMeta, saveVersion } from '#lib/artifacts.ts'

export default defineTool({
  description:
    '发布一个完整、自包含的 HTML 页面作为产物（图表、仪表盘、信息图、演示文稿、报告等任何形式），在用户界面右侧预览，可下载。' +
    '不传 id 是新建；传 id 是整页重写该产物，生成新版本。局部修改用 artifact_edit。' +
    '页面里的数字必须来自 data 引用的查询结果（页面中读 window.DATA.<别名>），不要把数据手写进 HTML。' +
    '图表库写 <script src="lib:echarts"></script>。写之前先加载 artifact-design 技能。',
  inputSchema: z.object({
    id: z.string().optional().describe('要整页重写的产物 id；新建时不传'),
    title: z.string().describe('产物标题，如"杭州 2026 年新设企业月度趋势"'),
    kind: z.string().describe('形式：chart / dashboard / infographic / slides / report / poster / other'),
    data: z
      .record(z.string(), z.string())
      .default({})
      .describe('别名 → 本会话查询结果文件名（工具返回的 .csv 名），如 {"monthly":"杭州_2026_年月度新增-a1b2c3.csv"}'),
    html: z.string().describe('完整 HTML：<!doctype html><html><head>…</head><body>…</body></html>，脚本和样式内联'),
  }),
  async execute({ id, title, kind, data, html }, ctx) {
    const started = performance.now()
    const checked = validate(html)
    if (!checked.ok) return { kind: 'error' as const, title, error: checked.error }
    const missing = await missingData(ctx.session.id, checked.html, data)
    if (missing) return { kind: 'error' as const, title, error: missing }
    try {
      await loadData(ctx.session.id, data)
    } catch (error) {
      return { kind: 'error' as const, title, error: (error as Error).message }
    }
    const existing = id ? await readMeta(ctx.session.id, id) : null
    if (id && !existing) return { kind: 'error' as const, title, error: `没有 id 为 ${id} 的产物；新建时不要传 id。` }
    const meta = await saveVersion(
      ctx.session.id,
      { id: existing?.id ?? newArtifactId(), title, kind, versions: existing?.versions },
      checked.html,
      data,
    )
    const version = meta.versions.at(-1)!.version
    return {
      kind: 'artifact' as const,
      id: meta.id,
      title,
      artifactKind: kind,
      version,
      bytes: checked.bytes,
      data: Object.keys(data),
      ms: Math.round(performance.now() - started),
      ...artifactUrls(ctx.session.id, meta.id, version),
    }
  },
  label: {
    start: ({ title }) => `生成产物：${title ?? ''}`,
    complete: (_input, output) =>
      output.kind === 'error' ? `生成产物失败` : `${output.title}（v${output.version}）`,
  },
  toModelOutput(output) {
    if (output.kind === 'error') return { type: 'text', value: `发布失败，修正后重试：${output.error}` }
    return {
      type: 'text',
      value: `已发布产物 ${output.id}「${output.title}」v${output.version}（${Math.round(output.bytes / 1024)} KB），用户在右侧面板看到预览，可下载 HTML。后续修改用 artifact_edit，id 为 ${output.id}。`,
    }
  },
})
