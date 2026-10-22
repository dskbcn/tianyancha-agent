import { ArrowUp, ChevronDown, Cpu, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ModelCatalog } from '../models.ts'

export function Composer({
  busy,
  disabled,
  onSend,
  onStop,
  autoFocus,
  models,
  model,
  onModel,
}: {
  busy: boolean
  disabled: boolean
  onSend: (text: string) => void
  onStop: () => void
  autoFocus?: boolean
  models: ModelCatalog | null
  model: string | undefined
  onModel: (id: string) => void
}) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  // True from compositionstart until just after compositionend. Safari (and some macOS IMEs in
  // Chrome) fire compositionend *before* the keydown of the Enter that commits the text, with
  // isComposing already false, so the flag is cleared a tick later to swallow that Enter.
  const composing = useRef(false)

  const resize = (el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  const submit = () => {
    const value = text.trim()
    if (!value || disabled) return
    onSend(value)
    setText('')
    requestAnimationFrame(() => resize(ref.current))
  }

  return (
    <div className="rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)] focus-within:border-accent/60">
      <textarea
        ref={ref}
        rows={1}
        value={text}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value)
          resize(e.target)
        }}
        onCompositionStart={() => {
          composing.current = true
        }}
        onCompositionEnd={() => {
          setTimeout(() => {
            composing.current = false
          }, 0)
        }}
        onKeyDown={(e) => {
          // Enter sends; Shift+Enter is a newline. An Enter that commits IME text (拼音 input
          // typing English, then Enter to keep the letters) must never send.
          if (e.key !== 'Enter' || e.shiftKey) return
          if (composing.current || e.nativeEvent.isComposing || e.keyCode === 229) return
          e.preventDefault()
          submit()
        }}
        placeholder={
          busy ? '补充说明会插入当前回答（Enter 发送）…' : '问一个关于杭州或深圳企业的问题…'
        }
        className="block w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-relaxed outline-none placeholder:text-faint disabled:opacity-60"
      />
      <div className="flex items-center justify-between px-3 pb-2.5">
        <div className="flex min-w-0 items-center gap-3">
          {models && models.models.length > 1 && (
            <label
              className="relative flex shrink-0 items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs text-muted hover:border-accent/50 hover:text-fg"
              title="选择模型：下一条消息起生效"
            >
              <Cpu className="size-3.5" />
              <span className="max-w-[10rem] truncate">
                {models.models.find((m) => m.id === model)?.label ?? model}
              </span>
              <ChevronDown className="size-3" />
              <select
                value={model}
                onChange={(e) => onModel(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label="模型"
              >
                {models.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                    {m.note ? ` · ${m.note}` : ''}
                    {m.evaluated ? '' : ' · 未评测'}
                  </option>
                ))}
              </select>
            </label>
          )}
          <span className="truncate text-xs text-faint">
            {busy ? '正在回答 · 可以补充或纠正' : 'Enter 发送 · Shift+Enter 换行'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {busy && (
            <button
              type="button"
              onClick={onStop}
              className="flex size-8 items-center justify-center rounded-full border border-line text-fg hover:bg-sunken"
              aria-label="停止"
              title="停止"
            >
              <Square className="size-3.5 fill-current" />
            </button>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={disabled || !text.trim()}
            className="flex size-8 items-center justify-center rounded-full bg-accent text-accent-fg transition disabled:opacity-30"
            aria-label="发送"
            title="发送"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
