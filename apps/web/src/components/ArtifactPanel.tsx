import type { EveDynamicToolPart } from 'eve/react'
import { AlertTriangle, Download, ExternalLink, Loader2, Maximize2, Wrench, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { draftDocument, partialHtml, type ArtifactEntry } from '../artifacts.ts'

/**
 * Right-hand preview. A finished version loads from /artifacts/… into a sandboxed frame (the
 * route also sends a CSP sandbox header). A draft shows the page as it is being written, in a
 * frame that runs no scripts, refreshed at most every 1.2 s so it does not flicker.
 */
export function ArtifactPanel({
  artifact,
  version,
  draft,
  onVersion,
  onClose,
  onFix,
}: {
  artifact?: ArtifactEntry
  version?: number
  draft?: EveDynamicToolPart
  onVersion: (version: number) => void
  onClose: () => void
  /** Asks the agent to fix a runtime error the page reported; absent while a turn runs. */
  onFix?: (text: string) => void
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const current = artifact?.versions.find((v) => v.version === version) ?? artifact?.versions.at(-1)
  // The page's error reporter (packages/artifacts prepare) posts here; only trust our own frame.
  // Kept with the page it came from, so switching versions shows only that version's error.
  const [reported, setReported] = useState<{ url: string; message: string } | null>(null)
  const error = reported && reported.url === current?.url ? reported.message : null
  useEffect(() => {
    const listen = (event: MessageEvent) => {
      const url = frame.current?.getAttribute('src')
      if (!url || event.source !== frame.current?.contentWindow) return
      const data = event.data as { type?: unknown; message?: unknown }
      if (data?.type === 'artifact-error' && typeof data.message === 'string') {
        const message = data.message
        setReported((r) => (r?.url === url ? r : { url, message }))
      }
    }
    addEventListener('message', listen)
    return () => removeEventListener('message', listen)
  }, [])
  const draftHtml = useThrottled(
    draft?.state === 'input-streaming' ? partialHtml(draft.inputText) : null,
    1200,
  )
  const draftTitle = (draft?.input as { title?: string } | undefined)?.title

  return (
    <aside className="flex w-[min(52vw,56rem)] min-w-[24rem] shrink-0 flex-col border-l border-line bg-surface">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {draft ? (draftTitle ?? '正在生成产物') : current?.title}
          </p>
          <p className="text-[11px] text-faint">
            {draft
              ? '草稿预览 · 脚本和图表在完成后显示'
              : `${current?.artifactKind} · ${Math.max(1, Math.round((current?.bytes ?? 0) / 1024))} KB`}
          </p>
        </div>
        {!draft && artifact && artifact.versions.length > 1 && (
          <select
            value={current?.version}
            onChange={(e) => onVersion(Number(e.target.value))}
            className="rounded-md border border-line bg-surface px-2 py-1 text-xs"
            aria-label="版本"
          >
            {artifact.versions.map((v) => (
              <option key={v.version} value={v.version}>
                v{v.version}
              </option>
            ))}
          </select>
        )}
        {!draft && current && (
          <>
            <IconButton label="全屏" onClick={() => void frame.current?.requestFullscreen?.()}>
              <Maximize2 className="size-4" />
            </IconButton>
            <a
              href={current.url}
              target="_blank"
              rel="noreferrer"
              className={iconButton}
              title="新窗口打开"
              aria-label="新窗口打开"
            >
              <ExternalLink className="size-4" />
            </a>
            <a
              href={current.downloadUrl}
              download
              className={iconButton}
              title="下载 HTML"
              aria-label="下载 HTML"
            >
              <Download className="size-4" />
            </a>
          </>
        )}
        <IconButton label="关闭" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </header>
      {error && current && !draft && (
        <div className="flex items-center gap-2.5 border-b border-danger/30 bg-danger-soft px-4 py-2 text-xs text-danger">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate" title={error}>
            页面脚本出错：{error}
          </span>
          {onFix && (
            <button
              type="button"
              onClick={() =>
                onFix(
                  `产物「${current.title}」（id ${current.id}，v${current.version}）在浏览器里运行出错：${error}。请用 artifact_read 查看后用 artifact_edit 修复。`,
                )
              }
              className="flex shrink-0 items-center gap-1 rounded-md bg-danger px-2 py-1 font-medium text-white"
            >
              <Wrench className="size-3" />
              让助手修复
            </button>
          )}
        </div>
      )}
      <div className="relative flex-1 bg-bg">
        {draft ? (
          <>
            {draftHtml ? (
              <iframe
                title="产物草稿"
                sandbox=""
                srcDoc={draftDocument(draftHtml)}
                className="size-full border-0 bg-white"
              />
            ) : (
              <div className="flex size-full items-center justify-center gap-2 text-sm text-muted">
                <Loader2 className="size-4 animate-spin" />
                等待页面开始…
              </div>
            )}
            <span className="absolute right-3 bottom-3 flex items-center gap-1.5 rounded-full bg-surface/90 px-2.5 py-1 text-[11px] text-muted shadow">
              <Loader2 className="size-3 animate-spin text-accent" />
              {(draftHtml?.length ?? 0).toLocaleString('zh-CN')} 字符
            </span>
          </>
        ) : current ? (
          <iframe
            ref={frame}
            key={current.url}
            title={current.title}
            src={current.url}
            sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
            allow="fullscreen"
            allowFullScreen
            referrerPolicy="no-referrer"
            className="size-full border-0 bg-white"
          />
        ) : null}
      </div>
    </aside>
  )
}

const iconButton = 'rounded-md p-1.5 text-muted hover:bg-sunken hover:text-fg'

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button type="button" onClick={onClick} className={iconButton} title={label} aria-label={label}>
      {children}
    </button>
  )
}

/** The latest value, at most once per `ms`; the final value always lands. */
function useThrottled<T>(value: T, ms: number): T {
  const [shown, setShown] = useState(value)
  const last = useRef(0)
  useEffect(() => {
    const wait = Math.max(0, last.current + ms - Date.now())
    const timer = setTimeout(() => {
      last.current = Date.now()
      setShown(value)
    }, wait)
    return () => clearTimeout(timer)
  }, [value, ms])
  return shown
}
