import { openConversationInputs, useEveAgent, type EveMessage } from 'eve/react'
import { Activity, AlertCircle, PanelRight, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArtifactPanelContext,
  collectArtifacts,
  draftParts,
  type ArtifactEntry,
  type PanelTarget,
} from '../artifacts.ts'
import type { EveDynamicToolPart } from 'eve/react'
import type { SavedChat } from '../chats.ts'
import { modelLabel, type ModelCatalog } from '../models.ts'
import { ArtifactPanel } from './ArtifactPanel.tsx'
import { Composer } from './Composer.tsx'
import { EmptyState } from './EmptyState.tsx'
import { EventsPanel } from './EventsPanel.tsx'
import { InputRequestCard, MessageView } from './MessageView.tsx'

/** One conversation. Remounted per chat (`key`), since useEveAgent reads its options once. */
export function Chat({
  chat,
  onUpdate,
  models,
}: {
  chat: SavedChat
  onUpdate: (patch: Partial<SavedChat>) => void
  models: ModelCatalog | null
}) {
  // When the server no longer has this chat's session (dev restart, redeploy), the next send
  // fails with 409 session_not_active. Start a new session that carries the conversation as text.
  const pending = useRef<string | null>(null)
  const restarting = useRef(false)
  const latest = useRef<{ messages: readonly EveMessage[]; model?: string }>({ messages: [] })
  const continueFresh = useRef<(text: string) => void>(() => {})
  const [notice, setNotice] = useState<string | null>(null)
  const [recovering, setRecovering] = useState(false)
  const agent = useEveAgent({
    initialEvents: chat.events ?? [],
    initialSession: chat.session,
    resume: chat.session !== undefined,
    onSessionChange: (session) => {
      if (session) onUpdate({ session })
    },
    onFinish: (snapshot) => onUpdate({ events: snapshot.events, session: snapshot.session }),
    onError: (error) => {
      const text = pending.current
      if (text && !restarting.current && isSessionEnded(error)) {
        restarting.current = true
        setRecovering(true)
        setTimeout(() => continueFresh.current(text), 0)
      }
    },
  })
  // Callbacks above run outside render; keep what they read current after each render.
  useEffect(() => {
    continueFresh.current = (text) => {
      const history = transcript(latest.current.messages)
      agent.reset()
      setNotice(
        `服务器上的会话已结束（通常是服务重启），已在新会话中继续，带入之前的 ${history.length} 条文字消息。查询结果和产物需要重新生成。`,
      )
      void agent
        .send(text, {
          clientContext: {
            ...(latest.current.model ? { model: latest.current.model } : {}),
            history,
          },
        })
        .finally(() => {
          restarting.current = false
          setRecovering(false)
        })
    }
  })
  const [showEvents, setShowEvents] = useState(false)
  const busy = agent.status === 'submitted' || agent.status === 'streaming'
  const messages = agent.data.messages
  const inputs = openConversationInputs(agent.data)
  const running = runningTool(messages)
  const stopped = !busy && lastTurnOutcome(agent.events) === 'turn.cancelled'

  // Artifacts. The panel follows the newest draft, or the newest version made since this chat
  // opened (keyed by its tool call, so a finished draft keeps its place), unless the user picked
  // or closed something since that draft or version appeared.
  const artifacts = useMemo(() => collectArtifacts(messages), [messages])
  const drafts = draftParts(messages)
  const [openedWith] = useState(() => new Set(artifactCallIds(collectArtifacts(messages))))
  const follow = autoTarget(drafts, artifacts, openedWith)
  const [choice, setChoice] = useState<{ key: string | null; target: PanelTarget | null } | null>(
    null,
  )
  const panel = resolveTarget(
    choice && choice.key === follow.key ? choice.target : follow.target,
    drafts,
    artifacts,
  )
  const setPanel = (target: PanelTarget | null) => setChoice({ key: follow.key, target })
  const panelDraft =
    panel?.mode === 'draft' ? drafts.find((d) => d.toolCallId === panel.callId) : undefined
  const panelArtifact = panel?.mode === 'artifact' ? artifacts.get(panel.id) : undefined

  const model = chat.model ?? models?.default
  const answeredBy = modelsByTurn(agent.events)
  useEffect(() => {
    latest.current = { messages, model }
  })
  const send = (text: string) => {
    if (messages.length === 0) onUpdate({ title: text.slice(0, 28) })
    pending.current = text
    // The agent's eve channel turns this into the turn's model (apps/agent/agent/channels/eve.ts).
    void agent.send(text, {
      ...(model ? { clientContext: { model } } : {}),
      ...(busy ? { turnPolicy: 'steer' as const } : {}),
    })
  }

  // Follow the stream while the reader is near the bottom; leave them alone if they scrolled up.
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  useEffect(() => {
    const el = scroller.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  })

  return (
    <ArtifactPanelContext.Provider value={{ open: setPanel }}>
      <div className="flex min-w-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-5">
            <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{chat.title}</h2>
            <StatusPill status={agent.status} running={running} />
            <button
              type="button"
              onClick={() => setShowEvents(!showEvents)}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs hover:bg-sunken ${showEvents ? 'bg-sunken text-fg' : 'text-muted'}`}
              title="查看 eve 原始事件流"
            >
              <PanelRight className="size-3.5" />
              事件
            </button>
          </header>

          <div
            ref={scroller}
            onScroll={(e) => {
              const el = e.currentTarget
              pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
            }}
            className="flex flex-1 flex-col overflow-y-auto"
          >
            {messages.length === 0 && agent.status !== 'resuming' ? (
              <EmptyState onPick={send} />
            ) : (
              <div className="mx-auto w-full max-w-3xl space-y-7 px-5 py-8">
                {messages.map((message, i) => (
                  <div key={message.id}>
                    <MessageView message={message} streaming={busy && i === messages.length - 1} />
                    {message.role === 'assistant' &&
                      message.metadata?.turnId &&
                      answeredBy.get(message.metadata.turnId) && (
                        <p className="mt-2 text-[11px] text-faint">
                          {modelLabel(models, answeredBy.get(message.metadata.turnId))}
                        </p>
                      )}
                  </div>
                ))}
                {agent.status === 'submitted' && messages.at(-1)?.role === 'user' && <Thinking />}
                {stopped && <p className="text-xs text-faint">已停止。可以修改问题后重新发送。</p>}
                {inputs.map((input) => (
                  <InputRequestCard
                    key={input.request.requestId}
                    input={input}
                    onAnswer={(answers) => void agent.respond(answers)}
                  />
                ))}
                {notice && (
                  <p className="border-t border-dashed border-line pt-3 text-center text-xs text-faint">
                    {notice}
                  </p>
                )}
                {agent.error && !recovering && !isSessionEnded(agent.error) && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    <div className="min-w-0 flex-1 break-words">{agent.error.message}</div>
                    <button
                      type="button"
                      onClick={() => void agent.resume()}
                      className="flex shrink-0 items-center gap-1 text-xs underline"
                    >
                      <RotateCcw className="size-3" />
                      重连
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mx-auto w-full max-w-3xl px-5 pt-2 pb-5">
            <Composer
              busy={busy}
              disabled={agent.status === 'resuming'}
              onSend={send}
              onStop={() => void agent.cancel()}
              autoFocus
              models={models}
              model={model}
              onModel={(id) => onUpdate({ model: id })}
            />
            <p className="mt-2 text-center text-[11px] text-faint">
              工商数据为天眼查同源，仅覆盖杭州、深圳的部分时间段；落地动态来自公众号文章（媒体报道）。数字以工具查询结果为准。
            </p>
          </div>
        </div>
        {(panelDraft || panelArtifact) && (
          <ArtifactPanel
            artifact={panelArtifact}
            version={panel?.mode === 'artifact' ? panel.version : undefined}
            draft={panelDraft}
            onVersion={(version) =>
              panelArtifact && setPanel({ mode: 'artifact', id: panelArtifact.id, version })
            }
            onClose={() => setPanel(null)}
            onFix={busy ? undefined : send}
          />
        )}
        {showEvents && (
          <EventsPanel
            events={agent.events}
            sessionId={agent.session?.sessionId}
            onClose={() => setShowEvents(false)}
          />
        )}
      </div>
    </ArtifactPanelContext.Provider>
  )
}

function StatusPill({ status, running }: { status: string; running: string | null }) {
  const [label, tone] =
    status === 'resuming'
      ? ['恢复会话中', 'text-warn']
      : status === 'error'
        ? ['出错', 'text-danger']
        : status === 'submitted' || status === 'streaming'
          ? [running ? '查询中' : '回答中', 'text-accent']
          : ['就绪', 'text-muted']
  return (
    <span className={`flex items-center gap-1.5 text-xs ${tone}`}>
      <Activity className={`size-3.5 ${tone === 'text-accent' ? 'animate-pulse' : ''}`} />
      {label}
    </span>
  )
}

function Thinking() {
  return (
    <div className="flex items-center gap-1.5 py-1" aria-label="思考中">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-1.5 animate-bounce rounded-full bg-faint"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  )
}

function runningTool(messages: readonly EveMessage[]): string | null {
  const last = messages.at(-1)
  if (!last || last.role !== 'assistant') return null
  const part = last.parts.findLast(
    (p) =>
      p.type === 'dynamic-tool' && (p.state === 'input-available' || p.state === 'input-streaming'),
  )
  return part && part.type === 'dynamic-tool' ? part.toolName : null
}

/** The type of the last turn-ending event, to tell a stopped turn from a finished one. */
function lastTurnOutcome(events: readonly { type: string }[]): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const type = events[i]!.type
    if (type === 'turn.started') return undefined
    if (type === 'turn.completed' || type === 'turn.cancelled' || type === 'turn.failed')
      return type
  }
  return undefined
}

/** turnId → the model that served its last step, from step.started events (eve reports `modelId`). */
function modelsByTurn(events: readonly { type: string; data?: unknown }[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const event of events) {
    if (event.type !== 'step.started') continue
    const data = event.data as
      | { turnId?: unknown; modelId?: unknown; model?: { id?: unknown } }
      | undefined
    const id =
      typeof data?.modelId === 'string'
        ? data.modelId
        : typeof data?.model?.id === 'string'
          ? data.model.id
          : undefined
    if (typeof data?.turnId === 'string' && id)
      out.set(data.turnId, id.replace(/^bailian[./:]/, ''))
  }
  return out
}

/**
 * The server will not run this session again: 409 session_not_active / session_stranded, or, from
 * `eve dev` without --resume, a dormant run, which fails as a bare 500 "Failed to send the session
 * message." (no code). A transient 500 matches too; the chat then continues from its transcript.
 */
function isSessionEnded(error: unknown): boolean {
  for (
    let e: unknown = error, depth = 0;
    e && depth < 4;
    e = (e as { cause?: unknown }).cause, depth++
  ) {
    const { status, body, code, message } = e as {
      status?: unknown
      body?: unknown
      code?: unknown
      message?: unknown
    }
    const text = [body, code, message].filter((v) => typeof v === 'string').join(' ')
    if (/session_not_active|session_stranded/.test(text)) return true
    if (status === 409 && /no longer active|stranded/i.test(text)) return true
    if (/Failed to send the session message/.test(text)) return true
  }
  return false
}

/**
 * The conversation as plain text for a new session's `history`: what each side said, plus one
 * line per query result and artifact so the model knows what was done. Failed sends are left out.
 */
function transcript(
  messages: readonly EveMessage[],
): { role: 'user' | 'assistant'; text: string }[] {
  const out: { role: 'user' | 'assistant'; text: string }[] = []
  for (const message of messages) {
    if (message.metadata?.optimistic || message.metadata?.status === 'failed') continue
    const lines: string[] = []
    for (const part of message.parts) {
      if (part.type === 'text' && part.text.trim()) lines.push(part.text.trim())
      if (part.type === 'dynamic-tool' && part.state === 'output-available') {
        const o = part.output as
          | { kind?: string; purpose?: string; title?: string; rowCount?: number }
          | undefined
        if (o?.kind === 'table') lines.push(`[已查询：${o.purpose}，${o.rowCount} 行]`)
        if (o?.kind === 'artifact')
          lines.push(`[已生成产物：${o.title}（在旧会话中，需要时重新生成）]`)
      }
    }
    if (lines.length && (message.role === 'user' || message.role === 'assistant')) {
      out.push({ role: message.role, text: lines.join('\n') })
    }
  }
  return out.slice(-40)
}

function artifactCallIds(artifacts: Map<string, ArtifactEntry>): string[] {
  return [...artifacts.values()].flatMap((a) => a.versions.map((v) => v.callId))
}

/** What the panel shows on its own: the newest draft, else the newest version made in this view. */
function autoTarget(
  drafts: EveDynamicToolPart[],
  artifacts: Map<string, ArtifactEntry>,
  openedWith: Set<string>,
): { key: string | null; target: PanelTarget | null } {
  const draft = drafts.at(-1)
  if (draft) return { key: draft.toolCallId, target: { mode: 'draft', callId: draft.toolCallId } }
  const fresh = [...artifacts.values()]
    .flatMap((a) => a.versions)
    .filter((v) => !openedWith.has(v.callId))
    .at(-1)
  return fresh
    ? { key: fresh.callId, target: { mode: 'artifact', id: fresh.id, version: fresh.version } }
    : { key: null, target: null }
}

/** A draft that finished is shown as the version it became; one that failed shows nothing. */
function resolveTarget(
  target: PanelTarget | null,
  drafts: EveDynamicToolPart[],
  artifacts: Map<string, ArtifactEntry>,
): PanelTarget | null {
  if (target?.mode !== 'draft' || drafts.some((d) => d.toolCallId === target.callId)) return target
  for (const a of artifacts.values()) {
    const v = a.versions.find((x) => x.callId === target.callId)
    if (v) return { mode: 'artifact', id: a.id, version: v.version }
  }
  return null
}
