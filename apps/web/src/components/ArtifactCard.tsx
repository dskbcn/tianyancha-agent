import type { EveDynamicToolPart } from 'eve/react'
import { AlertTriangle, Download, FileCode2, LayoutDashboard, Loader2, PanelRightOpen, Presentation, ScrollText } from 'lucide-react'
import { isArtifactOutput, partialHtml, useArtifactPanel } from '../artifacts.ts'

const KIND_ICON: Record<string, typeof FileCode2> = {
  slides: Presentation,
  dashboard: LayoutDashboard,
  report: ScrollText,
}
const KIND_LABEL: Record<string, string> = {
  chart: '图表',
  dashboard: '仪表盘',
  infographic: '信息图',
  slides: '演示文稿',
  report: '报告',
  poster: '海报',
}

/** The chat-side face of artifact_publish / artifact_edit / artifact_read. */
export function ArtifactCard({ part }: { part: EveDynamicToolPart }) {
  const { open } = useArtifactPanel()
  const input = (part.input ?? {}) as { title?: string; kind?: string; id?: string; edits?: unknown[] }

  if (part.toolName === 'artifact_read') {
    return <p className="text-xs text-muted">读取产物源码{input.id ? ` · ${input.id}` : ''}</p>
  }

  const writing = part.state === 'input-streaming' || part.state === 'input-available'
  if (writing) {
    const chars = part.state === 'input-streaming' ? (partialHtml(part.inputText)?.length ?? 0) : null
    return (
      <button
        type="button"
        onClick={() => open({ mode: 'draft', callId: part.toolCallId })}
        className="flex w-full items-center gap-3 rounded-xl border border-accent/40 bg-accent-soft/40 px-3.5 py-3 text-left"
      >
        <Loader2 className="size-4 shrink-0 animate-spin text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {part.toolName === 'artifact_edit' ? `修改产物（${input.edits?.length ?? '…'} 处）` : (input.title ?? '正在生成产物')}
          </span>
          <span className="block text-xs text-muted">
            {part.toolName === 'artifact_edit'
              ? '应用修改中…'
              : chars !== null
                ? `正在编写 · ${chars.toLocaleString('zh-CN')} 字符`
                : '校验并保存中…'}
          </span>
        </span>
        {part.toolName === 'artifact_publish' && <PanelRightOpen className="size-4 shrink-0 text-muted" />}
      </button>
    )
  }

  const output = part.state === 'output-available' ? part.output : undefined
  if (!isArtifactOutput(output)) {
    const error =
      part.state === 'output-error'
        ? part.errorText
        : (output as { error?: string } | undefined)?.error ?? '产物未生成'
    return (
      <div className="flex gap-2.5 rounded-xl border border-danger/40 bg-danger-soft/50 px-3.5 py-2.5 text-xs text-danger">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        <span className="min-w-0 break-words">
          {input.title ? `「${input.title}」` : ''}
          {error}
        </span>
      </div>
    )
  }

  const Icon = KIND_ICON[output.artifactKind] ?? FileCode2
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3">
      <button
        type="button"
        onClick={() => open({ mode: 'artifact', id: output.id, version: output.version })}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Icon className="size-4.5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{output.title}</span>
          <span className="block text-xs text-muted">
            {KIND_LABEL[output.artifactKind] ?? output.artifactKind} · v{output.version} · {Math.max(1, Math.round(output.bytes / 1024))} KB
          </span>
        </span>
      </button>
      <a
        href={output.downloadUrl}
        download
        className="rounded-md p-1.5 text-muted hover:bg-sunken hover:text-fg"
        title="下载 HTML"
        aria-label="下载 HTML"
      >
        <Download className="size-4" />
      </a>
      <button
        type="button"
        onClick={() => open({ mode: 'artifact', id: output.id, version: output.version })}
        className="rounded-md border border-line px-2.5 py-1 text-xs hover:border-accent hover:text-accent"
      >
        打开
      </button>
    </div>
  )
}
