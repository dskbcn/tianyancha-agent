---
description: Use before artifact_publish / artifact_edit — making HTML artifacts from query results: charts, dashboards, infographics, slide decks, reports. Data wiring, sandbox rules, ECharts, layout and per-kind guidance.
---

# 做 HTML 产物

产物是一个完整、自包含的 HTML 页面，在界面右侧的沙箱里运行，可以下载。形式不限：单图、仪表盘、信息图、演示文稿、报告、海报都行。

## 流程

1. **先有数据。** 用 `company_sql` / `company_find` 把要画的数字查出来；每个结果都存成了文件（工具返回里的 `.csv` 名）。
   一个图需要的口径（如"按月 × 含/不含个体户"）尽量用一条 SQL 查成一张表。
2. **一次写成。** `artifact_publish`：`data` 把结果文件映射成别名，页面里用 `window.DATA.<别名>` 读取。
3. **改用 edit。** 用户提修改时用 `artifact_edit`，一次请求的所有修改放进同一次调用。只有大改版才整页重写（传 `id`）。
4. **回复要短。** 说做了什么、用了哪些数据和口径；不要把 HTML 贴进聊天。

## 数据：只从 DATA 读

`window.DATA.<别名>` 的形状是 `{ columns: string[], rows: object[] }`，和查询结果一模一样。

```js
const { rows } = DATA.monthly            // [{ m: "2026-01", n: 38413, companies: 15210 }, …]
const months = rows.map(r => r.m)
const total = rows.reduce((s, r) => s + Number(r.n), 0)   // 合计、占比、排名都在页面里由 DATA 计算
```

- **`data` 必填**：页面上出现的每个业务数字都来自 `data` 引用的结果文件（查询工具返回里的"结果文件"）。
- **页面里不出现手写的业务数字**，也**不要写备用/默认数据（FALLBACK）**：标题里的"35,093 家"也要从 DATA 算出来再写进 DOM。
  DATA 缺失时页面显示"数据缺失"，而不是显示别的数字。这是正确性的底线。
- 数字字段可能是字符串（如 `"2020"`、`"22.4"`），计算前用 `Number()`。
- 口径说明（是否含个体工商户、数据覆盖到哪天、分数线）写在页面上，字号小、位置固定（页脚或图注）。
- 页脚写数据来源："企业工商登记库（天眼查同源）· 截至 YYYY-MM-DD"。

## 沙箱规则（不满足会被拒绝，按错误提示改）

- 以 `<!doctype html>` 开头，恰好一个 `<html>`、`<head>`、`<body>`。
- 脚本、样式全部内联。唯一的外部库：`<script src="lib:echarts"></script>`（ECharts 6，放在使用它的脚本之前）。
- 没有网络：不能用 CDN、网络字体、远程图片、fetch。图片只能是内嵌 `data:` 或内联 SVG。
- 不能用 `<iframe>`、`<form>`、`<object>`、`<embed>`、`<base>`、`meta refresh`、`javascript:` 链接。
- `https://` 的普通链接可以用（新标签页打开）。

## 样式

- 字体：`font-family: -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;` 数字用 `font-variant-numeric: tabular-nums`。
- 用 CSS 变量定义颜色，同时支持 `prefers-color-scheme: dark`。ECharts 的颜色也从这些变量取。
- 配色克制：一个主色 + 灰阶；分类色不超过 6 个；强调色只用在要读者注意的数字上。
- 页面要自适应宽度（预览面板和全屏都要好看）；ECharts 在 `resize` 事件里调用 `chart.resize()`。
- 大数字用千分位：`n.toLocaleString('zh-CN')`。

## ECharts 要点

```html
<script src="lib:echarts"></script>
<div id="trend" style="height:360px"></div>
<script>
  const chart = echarts.init(document.getElementById('trend'), null, { renderer: 'svg' })
  const rows = DATA.monthly.rows
  chart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 48, right: 16, top: 32, bottom: 32, containLabel: true },
    xAxis: { type: 'category', data: rows.map(r => r.m) },
    yAxis: { type: 'value' },
    series: [{ type: 'line', data: rows.map(r => Number(r.n)) }],   // 不要 smooth：曲线会越过真实值
  })
  addEventListener('resize', () => chart.resize())
</script>
```

- 趋势用折线，构成用堆叠柱或环形图（≤ 6 类，其余归"其他"），排名用横向条形图（从大到小），分布用柱状图。
- 区县、行业名称较长时用横向条形图，避免 x 轴标签挤在一起。
- `renderer: 'svg'` 打印和缩放更清晰。

## 各形式

- **chart**：一个核心图 + 标题（一句结论，如"8 月萧山新增最多"）+ 口径注。
- **dashboard**：顶部 3–5 个指标卡（数字从 DATA 算），下面 2–4 个图，网格布局。
- **infographic**：纵向长图，一个主题讲到底；大数字 + 简短说明 + 小图；适合导出分享。
- **slides**：16:9，每页一个观点，标题写结论；10–15 页以内。用下面的最小翻页框架：键盘 ←/→/空格、点击翻页、页码、`F` 全屏；
  每页 `<section class="slide">`；打印时每页一张（`@media print { .slide { page-break-after: always } }`）。
  图表在页面切换到可见时再 `resize()`。

```html
<style>
  html,body{margin:0;height:100%;background:#111}
  .deck{position:relative;width:100vw;height:100vh;display:grid;place-items:center}
  .slide{display:none;width:min(100vw,177.78vh);height:min(56.25vw,100vh);box-sizing:border-box;padding:5% 6%;background:var(--bg,#fff);color:var(--fg,#111)}
  .slide.active{display:flex;flex-direction:column}
  .pager{position:fixed;right:16px;bottom:12px;font:12px sans-serif;color:#888}
  @media print{html,body{background:#fff}.slide{display:flex!important;page-break-after:always;width:100%;height:100vh}.pager{display:none}}
</style>
<script>
  addEventListener('DOMContentLoaded', () => {
    const slides = [...document.querySelectorAll('.slide')]; let i = 0
    const pager = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'pager' }))
    const show = (n) => { i = Math.max(0, Math.min(slides.length - 1, n)); slides.forEach((s, k) => s.classList.toggle('active', k === i)); pager.textContent = `${i + 1} / ${slides.length}`; dispatchEvent(new Event('resize')) }
    addEventListener('keydown', (e) => { if (['ArrowRight', 'PageDown', ' '].includes(e.key)) show(i + 1); if (['ArrowLeft', 'PageUp'].includes(e.key)) show(i - 1); if (e.key === 'f') document.documentElement.requestFullscreen?.() })
    addEventListener('click', (e) => { if (!e.target.closest('a')) show(e.clientX > innerWidth / 3 ? i + 1 : i - 1) })
    show(0)
  })
</script>
```

- **report**：A4 宽度的长页面：结论摘要 → 分节（小标题 + 图 + 两三句解读）→ 口径与数据来源；`@media print` 适合导出 PDF。

## 不要

- 不要编造数据没有的东西（增长原因、政策背景、企业评价）；解读只基于 DATA 里的数字。
- 不要在一个页面里塞超过 6 个图；不要用 3D 图、雷达图做数量比较。
- 不要把整页 HTML 或大段代码贴进聊天。
