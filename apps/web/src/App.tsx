import { MessageSquarePlus, Trash2 } from 'lucide-react'
import { useChats } from './chats.ts'
import { Chat } from './components/Chat.tsx'
import { relativeTime } from './format.ts'
import { modelLabel, useModels } from './models.ts'

export function App() {
  const { chats, active, select, create, update, remove } = useChats()
  const models = useModels()

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-sunken/50 md:flex">
        <div className="flex h-14 items-center gap-2.5 px-4">
          <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-accent-fg">
            <svg viewBox="0 0 32 32" className="size-4" aria-hidden>
              <path
                d="M9 22V14M16 22V9M23 22v-5"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="text-sm font-semibold">企业数据分析</span>
        </div>
        <div className="px-3">
          <button
            type="button"
            onClick={create}
            className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm hover:border-accent/50"
          >
            <MessageSquarePlus className="size-4 text-muted" />
            新对话
          </button>
        </div>
        <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-2">
          <p className="px-2 pb-1 text-[11px] font-medium tracking-wide text-faint">最近</p>
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={`group flex items-center rounded-lg ${chat.id === active.id ? 'bg-surface shadow-[0_0_0_1px_var(--c-border)]' : 'hover:bg-surface/70'}`}
            >
              <button
                type="button"
                onClick={() => select(chat.id)}
                className="min-w-0 flex-1 px-2.5 py-2 text-left"
              >
                <span className="block truncate text-[13px]">{chat.title}</span>
                <span className="block text-[11px] text-faint">{relativeTime(chat.updatedAt)}</span>
              </button>
              {chat.session && (
                <button
                  type="button"
                  onClick={() => remove(chat.id)}
                  className="mr-1.5 rounded-md p-1 text-faint opacity-0 group-hover:opacity-100 hover:text-danger"
                  aria-label="删除对话"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </nav>
        <div className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-faint">
          默认模型 {modelLabel(models, models?.default) ?? '…'} · 数据源 企业库查询 MCP
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 bg-bg">
        <Chat
          key={active.id}
          chat={active}
          models={models}
          onUpdate={(patch) => update(active.id, patch)}
        />
      </main>
    </div>
  )
}
