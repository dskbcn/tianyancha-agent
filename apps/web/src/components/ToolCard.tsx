import type { EveDynamicToolPart } from 'eve/react'
import {
  AlertTriangle,
  BookOpen,
  Building2,
  Check,
  ChevronRight,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Newspaper,
  Search,
  Wrench,
  X,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { ARTIFACT_TOOLS } from '../artifacts.ts'
import { cellText, COLUMN_LABELS, seconds } from '../format.ts'
import { ArtifactCard } from './ArtifactCard.tsx'
import { DataTable } from './DataTable.tsx'

/** What the agent's tools return (apps/agent/agent/tools); the UI gets the full output. */
interface TableOutput {
  kind: 'table'
  purpose: string
  sql?: string
  keywords?: string[]
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  truncated: boolean
  warnings: string[]
  ms: number
  file: { name: string; url: string; rows: number } | null
  keywordHits?: number
  semanticOnly?: number
  scoreDistribution?: Record<string, number>
}
interface ProfileOutput {
  kind: 'profile'
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  ms: number
}
interface ErrorOutput {
  kind: 'error'
  purpose?: string
  sql?: string
  error: string
}
interface ArticleRow {
  article_id: number
  title: string
  publish_date: string
  url: string
  company_name: string | null
  district: string | null
  settle_type: string | null
  read_count: number | null
  snippet: string
  score: number | null
}
interface ArticlesOutput {
  kind: 'articles'
  query: string
  rows: ArticleRow[]
  ms: number
  file: { name: string; url: string; rows: number } | null
}
interface ArticleOutput extends Omit<ArticleRow, 'snippet' | 'score'> {
  kind: 'article'
  account_name: string
  origin_city: string | null
  content_text: string
  total_chars: number
  offset: number
  next_offset: number | null
}
type ToolOutput = TableOutput | ProfileOutput | ArticlesOutput | ArticleOutput | ErrorOutput

const ICONS: Record<string, typeof Database> = {
  company_sql: Database,
  company_find: Search,
  company_profile: Building2,
  article_search: Newspaper,
  article_read: FileText,
}

export function ToolCard({ part }: { part: EveDynamicToolPart }) {
  const label = part.toolMetadata?.eve?.label ?? part.toolName
  const running = part.state === 'input-streaming' || part.state === 'input-available'
  const output =
    part.state === 'output-available' && !part.partial ? (part.output as ToolOutput) : undefined
  const failed = part.state === 'output-error' || output?.kind === 'error'
  const elapsed = useElapsed(running)
  // Collapsed by default: the answer is the main read. Errors open so the message is visible.
  const [open, setOpen] = useState<boolean | undefined>(undefined)
  const isOpen = open ?? failed

  if (ARTIFACT_TOOLS.has(part.toolName)) return <ArtifactCard part={part} />

  if (part.toolName === 'eve__skill') {
    const name = (part.toolMetadata?.eve as { name?: string } | undefined)?.name
    return (
      <div className="flex items-center gap-2 text-xs text-muted">
        <BookOpen className="size-3.5" />
        {running ? '加载技能' : '已加载技能'} <span className="font-mono">{name ?? 'skill'}</span>
      </div>
    )
  }

  const Icon = ICONS[part.toolName] ?? Wrench
  const input = (part.input ?? {}) as {
    sql?: string
    purpose?: string
    keywords?: string[]
    description?: string
  }
  const sql = input.sql ?? (output && 'sql' in output ? output.sql : undefined)

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-surface ${failed ? 'border-danger/40' : 'border-line'}`}
    >
      <button
        type="button"
        onClick={() => setOpen(!isOpen)}
        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-sunken/60"
      >
        <span
          className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${failed ? 'bg-danger-soft text-danger' : running ? 'bg-accent-soft text-accent' : 'bg-sunken text-muted'}`}
        >
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted tabular-nums">
          {running ? (
            <>
              <Loader2 className="size-3.5 animate-spin text-accent" />
              {seconds(elapsed)}
            </>
          ) : failed ? (
            <X className="size-4 text-danger" />
          ) : output ? (
            <Check className="size-4 text-ok" />
          ) : null}
          <ChevronRight className={`size-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
        </span>
      </button>

      {isOpen && (
        <div className="space-y-3 border-t border-line px-3.5 py-3">
          {input.keywords && (
            <div className="flex flex-wrap gap-1.5">
              {input.keywords.map((k) => (
                <span key={k} className="rounded-md bg-sunken px-2 py-0.5 text-xs text-muted">
                  {k}
                </span>
              ))}
            </div>
          )}
          {sql && <SqlBlock sql={sql} />}
          {running && (
            <p className="text-xs text-muted">
              {part.toolName === 'company_find'
                ? '正在按关键词圈选候选并计算语义相似度，通常需要 40–60 秒。'
                : '正在查询企业库，全表扫描通常需要 15 秒左右。'}
            </p>
          )}
          {part.state === 'output-error' && <ErrorBox text={part.errorText} />}
          {output?.kind === 'error' && <ErrorBox text={output.error} />}
          {output?.kind === 'table' && <TableResult output={output} />}
          {output?.kind === 'profile' && <ProfileResult output={output} />}
          {output?.kind === 'articles' && <ArticleList output={output} />}
          {output?.kind === 'article' && <ArticleView output={output} />}
        </div>
      )}
    </div>
  )
}

function TableResult({ output }: { output: TableOutput }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span>
          <b className="font-semibold text-fg tabular-nums">
            {output.rowCount.toLocaleString('zh-CN')}
          </b>{' '}
          行
        </span>
        <span>用时 {seconds(output.ms)}</span>
        {output.keywordHits !== undefined && (
          <span>
            关键词候选 {output.keywordHits.toLocaleString('zh-CN')} · 语义补充{' '}
            {output.semanticOnly?.toLocaleString('zh-CN')}
          </span>
        )}
        {output.truncated && <Badge tone="warn">已达上限，结果可能不完整</Badge>}
        {output.rows.length < output.rowCount && <span>预览前 {output.rows.length} 行</span>}
        {output.file && (
          <a
            href={output.file.url}
            download
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 font-medium text-fg hover:border-accent hover:text-accent"
          >
            <Download className="size-3.5" />
            下载 CSV
          </a>
        )}
      </div>
      {output.scoreDistribution && <ScoreBars distribution={output.scoreDistribution} />}
      {output.warnings.map((w) => (
        <div key={w} className="flex gap-2 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {w}
        </div>
      ))}
      {output.rowCount > 0 ? (
        <DataTable columns={output.columns} rows={output.rows} />
      ) : (
        <p className="text-sm text-muted">无结果。</p>
      )}
    </>
  )
}

function ArticleList({ output }: { output: ArticlesOutput }) {
  if (output.rows.length === 0) return <p className="text-sm text-muted">没有找到相关文章。</p>
  return (
    <>
      <div className="flex items-center gap-4 text-xs text-muted">
        <span>
          <b className="font-semibold text-fg">{output.rows.length}</b> 篇 · 按相关度
        </span>
        <span>用时 {seconds(output.ms)}</span>
        {output.file && (
          <a
            href={output.file.url}
            download
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 font-medium text-fg hover:border-accent hover:text-accent"
          >
            <Download className="size-3.5" />
            下载 CSV
          </a>
        )}
      </div>
      <ol className="divide-y divide-line overflow-hidden rounded-lg border border-line">
        {output.rows.map((row) => (
          <li key={row.article_id} className="space-y-1 px-3 py-2.5">
            <a
              href={row.url}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex items-start gap-1.5 text-sm font-medium hover:text-accent"
            >
              {row.title}
              <ExternalLink className="mt-0.5 size-3 shrink-0 text-faint group-hover:text-accent" />
            </a>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span className="tabular-nums">{row.publish_date}</span>
              {row.settle_type && (
                <span className="rounded bg-accent-soft px-1.5 text-accent">{row.settle_type}</span>
              )}
              {row.district && <span>{row.district}</span>}
              {row.company_name && <span className="truncate">· {row.company_name}</span>}
            </div>
            {row.snippet && (
              <p className="line-clamp-2 text-xs leading-relaxed text-muted">{row.snippet}</p>
            )}
          </li>
        ))}
      </ol>
    </>
  )
}

function ArticleView({ output }: { output: ArticleOutput }) {
  return (
    <div className="space-y-2">
      <a
        href={output.url}
        target="_blank"
        rel="noreferrer"
        className="group inline-flex items-start gap-1.5 text-sm font-medium hover:text-accent"
      >
        {output.title}
        <ExternalLink className="mt-0.5 size-3 shrink-0 text-faint group-hover:text-accent" />
      </a>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        <span>{output.account_name}</span>
        <span className="tabular-nums">{output.publish_date}</span>
        {output.settle_type && <span>{output.settle_type}</span>}
        {output.company_name && <span>{output.company_name}</span>}
        <span>
          {output.total_chars.toLocaleString('zh-CN')} 字
          {output.next_offset !== null
            ? ` · 已读到 ${output.offset + output.content_text.length}`
            : ''}
        </span>
      </div>
      <p className="max-h-48 overflow-auto rounded-lg bg-sunken px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-fg/80">
        {output.content_text.slice(0, 1200)}
        {output.content_text.length > 1200 ? '…' : ''}
      </p>
    </div>
  )
}

function ProfileResult({ output }: { output: ProfileOutput }) {
  if (output.rowCount === 0) return <p className="text-sm text-muted">没有找到匹配的企业。</p>
  if (output.rowCount > 1)
    return <DataTable columns={output.columns.slice(0, 8)} rows={output.rows} />
  const row = output.rows[0]!
  return (
    <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1.5 text-sm">
      {output.columns
        .filter((c) => c !== 'id')
        .map((c) => (
          <Field key={c} label={COLUMN_LABELS[c] ?? c}>
            {cellText(row[c], c)}
          </Field>
        ))}
    </dl>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  )
}

function ScoreBars({ distribution }: { distribution: Record<string, number> }) {
  const entries = Object.entries(distribution)
  const max = Math.max(1, ...entries.map(([, n]) => n))
  return (
    <div className="rounded-lg bg-sunken/70 px-3 py-2.5">
      <p className="mb-2 text-xs text-muted">相似度分布（累计，用来决定截断位置）</p>
      <div className="space-y-1">
        {entries.map(([bucket, n]) => (
          <div key={bucket} className="flex items-center gap-2 text-xs tabular-nums">
            <span className="w-12 shrink-0 text-muted">{bucket}</span>
            <span
              className="h-2 rounded-full bg-accent/70"
              style={{ width: `${(n / max) * 70}%` }}
            />
            <span>{n.toLocaleString('zh-CN')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SqlBlock({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="group relative">
      <pre className="max-h-56 overflow-auto rounded-lg bg-sunken px-3 py-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap text-fg/90">
        {sql}
      </pre>
      <button
        type="button"
        onClick={() => {
          if (copyText(sql)) {
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          }
        }}
        className="absolute top-1.5 right-1.5 rounded-md border border-line bg-surface p-1 text-muted opacity-0 transition group-hover:opacity-100 hover:text-fg"
        aria-label="复制 SQL"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  )
}

/**
 * Copies text. `navigator.clipboard` exists only on HTTPS and localhost, and the beta is served
 * over plain HTTP, so this selects a hidden textarea and uses the older copy command.
 */
function copyText(text: string): boolean {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.append(area)
  area.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}

function ErrorBox({ text }: { text?: string }) {
  return (
    <pre className="overflow-auto rounded-lg bg-danger-soft px-3 py-2 font-mono text-xs whitespace-pre-wrap text-danger">
      {text ?? '工具执行失败'}
    </pre>
  )
}

function Badge({ tone, children }: { tone: 'warn'; children: ReactNode }) {
  return (
    <span className={`rounded-md px-1.5 py-0.5 ${tone === 'warn' ? 'bg-warn-soft text-warn' : ''}`}>
      {children}
    </span>
  )
}

/** Milliseconds since this card mounted, ticking while `running`; parts carry no timestamps. */
function useElapsed(running: boolean): number {
  const [mountedAt] = useState(() => Date.now())
  const [now, setNow] = useState(mountedAt)
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(timer)
  }, [running])
  return running ? Math.max(0, now - mountedAt) : 0
}
