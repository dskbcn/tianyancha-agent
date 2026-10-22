import { openConversationInputs, useEveAgent, type EveMessage } from 'eve/react'
import { Activity, AlertCircle, PanelRight, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArtifactPanelContext, collectArtifacts, draftParts, type PanelTarget } from '../artifacts.ts'
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
  const agent = useEveAgent({
    initialEvents: chat.events ?? [],
    initialSession: chat.session,
    resume: chat.session !== undefined,
    onSessionChange: (session) => {
      if (session) onUpdate({ session })
    },
    onFinish: (snapshot) => onUpdate({ events: snapshot.events, session: snapshot.session }),
  })
  const [showEvents, setShowEvents] = useState(false)
  const busy = agent.status === 'submitted' || agent.status === 'streaming'
  const messages = agent.data.messages
  const inputs = openConversationInputs(agent.data)
  const running = runningTool(messages)
  const stopped = !busy && lastTurnOutcome(agent.events) === 'turn.cancelled'

  // Artifacts: the panel follows a draft while it is written, then its finished version.
  const artifacts = useMemo(() => collectArtifacts(messages), [messages])
  const drafts = draftParts(messages)
  const [panel, setPanel] = useState<PanelTarget | null>(null)
  const seen = useRef(new Set<string>())
  useEffect(() => {
    for (const draft of drafts) {
      if (seen.current.has(draft.toolCallId)) continue
      seen.current.add(draft.toolCallId)
      setPanel({ mode: 'draft', callId: draft.toolCallId })
    }
    for (const entry of artifacts.values()) {
      for (const v of entry.versions) {
        const key = `${entry.id}@${v.version}`
        if (seen.current.has(key)) continue
        seen.current.add(key)
        // Saved chats re-render their history on load: open only versions made while watching.
        if (busy) setPanel({ mode: 'artifact', id: entry.id, version: v.version })
      }
    }
  })
  const panelDraft = panel?.mode === 'draft' ? drafts.find((d) => d.toolCallId === panel.callId) : undefined
  const panelArtifact = panel?.mode === 'artifact' ? artifacts.get(panel.id) : undefined
  // A draft that finished becomes its artifact; one that failed closes.
  useEffect(() => {
    if (panel?.mode !== 'draft' || panelDraft) return
    const done = [...artifacts.values()].find((a) => a.versions.some((v) => v.callId === panel.callId))
    setPanel(done ? { mode: 'artifact', id: done.id } : null)
  }, [panel, panelDraft, artifacts])

  const model = chat.model ?? models?.default
  const answeredBy = modelsByTurn(agent.events)
  const send = (text: string) => {
    if (messages.length === 0) onUpdate({ title: text.slice(0, 28) })
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
                  {message.role === 'assistant' && message.metadata?.turnId && answeredBy.get(message.metadata.turnId) && (
                    <p className="mt-2 text-[11px] text-faint">{modelLabel(models, answeredBy.get(message.metadata.turnId))}</p>
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
              {agent.error && (
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
            数据为天眼查同源工商数据，仅覆盖杭州、深圳的部分时间段；数字以工具查询结果为准。
          </p>
        </div>
      </div>
      {(panelDraft || panelArtifact) && (
        <ArtifactPanel
          artifact={panelArtifact}
          version={panel?.mode === 'artifact' ? panel.version : undefined}
          draft={panelDraft}
          onVersion={(version) => panelArtifact && setPanel({ mode: 'artifact', id: panelArtifact.id, version })}
          onClose={() => setPanel(null)}
          onFix={busy ? undefined : send}
        />
      )}
      {showEvents && (
        <EventsPanel events={agent.events} sessionId={agent.session?.sessionId} onClose={() => setShowEvents(false)} />
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
    (p) => p.type === 'dynamic-tool' && (p.state === 'input-available' || p.state === 'input-streaming'),
  )
  return part && part.type === 'dynamic-tool' ? part.toolName : null
}

/** The type of the last turn-ending event, to tell a stopped turn from a finished one. */
function lastTurnOutcome(events: readonly { type: string }[]): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const type = events[i]!.type
    if (type === 'turn.started') return undefined
    if (type === 'turn.completed' || type === 'turn.cancelled' || type === 'turn.failed') return type
  }
  return undefined
}

/** turnId → the model that served its last step, from step.started events (eve reports `modelId`). */
function modelsByTurn(events: readonly { type: string; data?: unknown }[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const event of events) {
    if (event.type !== 'step.started') continue
    const data = event.data as { turnId?: unknown; modelId?: unknown; model?: { id?: unknown } } | undefined
    const id = typeof data?.modelId === 'string' ? data.modelId : typeof data?.model?.id === 'string' ? data.model.id : undefined
    if (typeof data?.turnId === 'string' && id) out.set(data.turnId, id.replace(/^bailian[./:]/, ''))
  }
  return out
}
