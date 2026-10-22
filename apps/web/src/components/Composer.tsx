import { ArrowUp, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export function Composer({
  busy,
  disabled,
  onSend,
  onStop,
  autoFocus,
}: {
  busy: boolean
  disabled: boolean
  onSend: (text: string) => void
  onStop: () => void
  autoFocus?: boolean
}) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [text])

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  const submit = () => {
    const value = text.trim()
    if (!value || disabled) return
    onSend(value)
    setText('')
  }

  return (
    <div className="rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)] focus-within:border-accent/60">
      <textarea
        ref={ref}
        rows={1}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends; Shift+Enter is a newline. Never send while an IME is composing (拼音).
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
        placeholder={busy ? '补充说明会插入当前回答（Enter 发送）…' : '问一个关于杭州或深圳企业的问题…'}
        className="block w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-relaxed outline-none placeholder:text-faint disabled:opacity-60"
      />
      <div className="flex items-center justify-between px-3 pb-2.5">
        <span className="text-xs text-faint">
          {busy ? '正在回答 · 可以补充或纠正' : 'Enter 发送 · Shift+Enter 换行'}
        </span>
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
