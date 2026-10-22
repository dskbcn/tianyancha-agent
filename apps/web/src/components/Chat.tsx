import { openConversationInputs, useEveAgent, type EveMessage } from 'eve/react'
import { Activity, AlertCircle, PanelRight, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { SavedChat } from '../chats.ts'
import { Composer } from './Composer.tsx'
import { EmptyState } from './EmptyState.tsx'
import { EventsPanel } from './EventsPanel.tsx'
import { InputRequestCard, MessageView } from './MessageView.tsx'

/** One conversation. Remounted per chat (`key`), since useEveAgent reads its options once. */
export function Chat({
  chat,
  onUpdate,
}: {
  chat: SavedChat
  onUpdate: (patch: Partial<SavedChat>) => void
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

  const send = (text: string) => {
    if (messages.length === 0) onUpdate({ title: text.slice(0, 28) })
    void agent.send(text, busy ? { turnPolicy: 'steer' } : undefined)
  }

  // Follow the stream while the reader is near the bottom; leave them alone if they scrolled up.
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  useEffect(() => {
    const el = scroller.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  })

  return (
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
                <MessageView
                  key={message.id}
                  message={message}
                  streaming={busy && i === messages.length - 1}
                />
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
          />
          <p className="mt-2 text-center text-[11px] text-faint">
            数据为天眼查同源工商数据，仅覆盖杭州、深圳的部分时间段；数字以工具查询结果为准。
          </p>
        </div>
      </div>
      {showEvents && (
        <EventsPanel events={agent.events} sessionId={agent.session?.sessionId} onClose={() => setShowEvents(false)} />
      )}
    </div>
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
