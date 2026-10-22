import type { MessageStreamEvent } from 'eve/client'
import { X } from 'lucide-react'
import { useState } from 'react'

/** Raw eve stream events for this session: the harness view for debugging the agent. */
export function EventsPanel({
  events,
  sessionId,
  onClose,
}: {
  events: readonly MessageStreamEvent[]
  sessionId?: string
  onClose: () => void
}) {
  const [selected, setSelected] = useState<number | null>(null)
  const [filter, setFilter] = useState('')
  const shown = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => !filter || event.type.includes(filter))

  return (
    <aside className="flex w-[26rem] shrink-0 flex-col border-l border-line bg-surface">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">事件流</p>
          <p className="truncate font-mono text-[11px] text-faint">{sessionId ?? '尚未创建会话'}</p>
        </div>
        <span className="text-xs text-muted tabular-nums">{events.length}</span>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-sunken" aria-label="关闭">
          <X className="size-4" />
        </button>
      </header>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="按类型过滤，如 action"
        className="border-b border-line bg-transparent px-4 py-2 font-mono text-xs outline-none placeholder:text-faint"
      />
      <ol className="flex-1 overflow-auto font-mono text-xs">
        {shown.map(({ event, index }) => (
          <li key={index} className="border-b border-line/60">
            <button
              type="button"
              onClick={() => setSelected(selected === index ? null : index)}
              className={`flex w-full gap-2 px-4 py-1.5 text-left hover:bg-sunken ${selected === index ? 'bg-sunken' : ''}`}
            >
              <span className="w-8 shrink-0 text-right text-faint">{index}</span>
              <span className={typeColor(event.type)}>{event.type}</span>
            </button>
            {selected === index && (
              <pre className="max-h-80 overflow-auto bg-bg px-4 py-2 text-[11px] leading-relaxed whitespace-pre-wrap">
                {JSON.stringify(event, null, 2)}
              </pre>
            )}
          </li>
        ))}
      </ol>
    </aside>
  )
}

function typeColor(type: string): string {
  if (type.includes('failed') || type.includes('error')) return 'text-danger'
  if (type.startsWith('action')) return 'text-accent'
  if (type.startsWith('turn') || type.startsWith('session')) return 'text-warn'
  return 'text-fg'
}
