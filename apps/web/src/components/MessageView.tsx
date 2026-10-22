import type { ConversationInput, EveMessage, EveMessagePart } from 'eve/react'
import { Brain, ChevronRight, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { Markdown } from './Markdown.tsx'
import { ToolCard } from './ToolCard.tsx'

export interface InputAnswer {
  requestId: string
  optionId?: string
  text?: string
}

export function MessageView({ message, streaming }: { message: EveMessage; streaming: boolean }) {
  if (message.role === 'user') {
    const text = message.parts.map((p) => (p.type === 'text' ? p.text : '')).join('')
    return (
      <div className="flex justify-end">
        <div
          className={`max-w-[85%] rounded-2xl rounded-br-md bg-user px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-user-fg ${message.metadata?.optimistic ? 'opacity-70' : ''}`}
        >
          {text}
        </div>
      </div>
    )
  }

  const lastText = message.parts.reduce((last, p, i) => (p.type === 'text' ? i : last), -1)
  return (
    <div className="space-y-3">
      {message.parts.map((part, i) => (
        <Part key={partKey(part, i)} part={part} caret={streaming && i === lastText} />
      ))}
    </div>
  )
}

function Part({ part, caret }: { part: EveMessagePart; caret: boolean }) {
  switch (part.type) {
    case 'text':
      return part.text ? <Markdown text={part.text} caret={caret} /> : null
    case 'reasoning':
      return part.text ? <Reasoning text={part.text} live={part.state === 'streaming'} /> : null
    case 'dynamic-tool':
      return <ToolCard part={part} />
    case 'authorization':
      return (
        <div className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
          <KeyRound className="size-4 text-muted" />
          {part.state === 'required' ? `需要授权：${part.displayName}` : `${part.displayName}：${part.outcome}`}
          {part.state === 'required' && part.authorization?.url && (
            <a className="ml-auto text-accent underline" href={part.authorization.url} target="_blank" rel="noreferrer">
              去授权
            </a>
          )}
        </div>
      )
    default:
      return null
  }
}

function Reasoning({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="text-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 text-muted hover:text-fg"
      >
        <Brain className={`size-3.5 ${live ? 'animate-pulse text-accent' : ''}`} />
        {live ? '思考中…' : '思考过程'}
        <ChevronRight className={`size-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="mt-2 border-l-2 border-line pl-3 text-[13px] leading-relaxed whitespace-pre-wrap text-muted">
          {text}
        </div>
      )}
    </div>
  )
}

/** Approvals and questions (HITL). The agent has none today; the harness renders them anyway. */
export function InputRequestCard({
  input,
  onAnswer,
}: {
  input: ConversationInput
  onAnswer: (answers: InputAnswer[]) => void
}) {
  const { request, response } = input
  const [text, setText] = useState('')
  if (response) {
    return <p className="text-xs text-muted">已回复：{response.text ?? response.optionId}</p>
  }
  return (
    <div className="space-y-2.5 rounded-xl border border-warn/40 bg-warn-soft/50 p-3.5">
      <p className="text-sm">{request.prompt}</p>
      <div className="flex flex-wrap gap-2">
        {request.options?.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onAnswer([{ requestId: request.requestId, optionId: option.id }])}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90"
          >
            {option.label}
          </button>
        ))}
      </div>
      {(request.allowFreeform || !request.options?.length) && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim()) onAnswer([{ requestId: request.requestId, text: text.trim() }])
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
            placeholder="输入回答…"
          />
          <button type="submit" className="rounded-lg bg-accent px-3 text-sm text-accent-fg">
            回复
          </button>
        </form>
      )}
    </div>
  )
}

function partKey(part: EveMessagePart, index: number): string {
  switch (part.type) {
    case 'dynamic-tool':
      return part.toolCallId
    case 'text':
    case 'reasoning':
      return `${part.type}:${part.id ?? index}`
    default:
      return `${part.type}:${index}`
  }
}
