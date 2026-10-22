import { BarChart3, Building2, ListChecks, TrendingDown } from 'lucide-react'

const EXAMPLES = [
  { icon: BarChart3, text: '杭州市 2026 年 8 月新成立了多少家企业？按区县列出前 5。' },
  { icon: ListChecks, text: '近一年杭州做人工智能的公司有哪些？给我完整名单。' },
  { icon: TrendingDown, text: '深圳 2020–2025 年各年份成立的企业，现在注销或吊销的比例分别是多少？' },
  { icon: Building2, text: '查一下统一社会信用代码 91330114MAKNH69N9Q 的公司。' },
]

export function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">企业数据分析</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
        基于企业工商库（天眼查同源）回答数量、趋势、分布、名单和单个企业的问题。完整结果可下载为 CSV。
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <Chip>杭州 · 2017-07 至 2026-09-30</Chip>
        <Chip>深圳 · 2020-01 至 2026-05-20</Chip>
        <Chip>约 47% 为个体工商户</Chip>
        <Chip>联系人信息不开放</Chip>
      </div>
      <div className="mt-8 grid gap-2.5 sm:grid-cols-2">
        {EXAMPLES.map(({ icon: Icon, text }) => (
          <button
            key={text}
            type="button"
            onClick={() => onPick(text)}
            className="group flex items-start gap-3 rounded-xl border border-line bg-surface p-3.5 text-left text-sm leading-relaxed transition hover:border-accent/50 hover:bg-accent-soft/40"
          >
            <Icon className="mt-0.5 size-4 shrink-0 text-muted group-hover:text-accent" />
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

function Chip({ children }: { children: string }) {
  return <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-muted">{children}</span>
}
