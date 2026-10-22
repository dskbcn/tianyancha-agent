# tianyancha-agent: 企业数据分析 agent plan

Status: plan settled 2026-10-22 (open questions 1–4 answered); spikes 0.1–0.4 done
(`docs/spikes/`); a working preview (agent + web) exists on `feat/0.4-web-preview`. Started 2026-10-22. Data source facts below were measured
against the live MCP server on 2026-10-22.

References: `~/Dev/weixin-article-agent` (eve agent shape: authored tools, skills, channels,
auth, Docker + Caddy) and `~/Dev/face-platform` (monorepo conventions: pnpm
catalog, exact versions, framework-free core package, plan-driven phases, AGENTS.md).

## What we're building

An [eve](https://eve.dev) agent that answers business questions about companies (企业工商数据)
in Chinese, through a web chat UI and over MCP: counts, trends, distributions, rankings, lists of companies doing a kind of
business, and single-company profiles. It reads from the 企业库查询 MCP server (天眼查同源数据)
and writes its results as CSV and Markdown reports.

Typical questions:

- 杭州今年 8 月新增了多少家企业？按区县分。
- 近一年杭州涉及人工智能的公司有哪些？导出名单。
- 2023 年成立的深圳企业，到现在注销了多少比例？按行业门类看。
- 余杭区注册资本 5000 万以上的制造业企业有哪些？
- 查一下「某某科技有限公司」的工商信息。

### Goals

1. Correct numbers. Every figure in an answer comes from a query in the same session, and the
   answer says which data it covers (see "Coverage").
2. Lists of any length without filling the model's context: full results go to disk, the
   model sees a summary and a preview (the weixin agent's rule).
3. The same pipeline usable without the agent, from a CLI, for spikes and bulk exports.

### Non-goals

- Writing to the data source. The server is read-only, and so are we.
- Data outside the two tables the server exposes (no shareholders, judicial risk, IP, etc.).
- A population census. The dataset is a subset (see "Coverage"), and the agent says so.

## Data source

MCP server `企业库查询` v4.1.3, Streamable HTTP at `COMPANY_DB_MCP_URL`, auth header
`X-API-Key`. No prompts or resources, 8 tools:

| Tool | Use |
|---|---|
| `get_schema` | Data dictionary of both tables (call once, cache) |
| `list_tables`, `describe_table` | Subsets of `get_schema`; not needed |
| `query` | One `SELECT` (CTE, JOIN, GROUP BY, window functions); table/column whitelist |
| `query_table` | Parameterised filters; **returns every row when `limit` is omitted** |
| `find_companies` | Full list for a kind of business: keyword candidates + semantic score, paged, tens of seconds |
| `semantic_search` | Top-k `company_id` + score over business-scope vectors; needs a join for names |
| `vector_search_info` | Vector index status |

Tables:

- `tyc_advanced_search_companies`: 37 columns. Name, status, legal representative, size,
  capital, dates, province/city/district, enterprise type, 国标行业 (门类/大类/中类), the four
  codes (USCC, taxpayer, registration, organization), insured headcount, phones, emails,
  addresses, website, business scope, 天眼评分.
- `tyc_business_scope_embeddings`: `company_id` (= `tyc_advanced_search_companies.id`),
  1024-d vector, `created_at`. 5,619,655 rows.

### Coverage (measured)

| City | Rows | `established_date` covered | Last update |
|---|---|---|---|
| 杭州市 | 2,954,006 | 2017-07-19 → 2026-09-30 | 2026-10-21 |
| 深圳市 | 2,665,649 | 2020-01 → 2026-05-20 | 2026-06-24 |

深圳 stopped updating in June, so a 杭州 vs 深圳 comparison uses the common window only.
Coverage is read at runtime, not hard-coded (spike 0.2, finding 3).

Status mix: 存续 4.14M, 注销 1.40M, 吊销 51k, other values under 25k each. 47% of rows are
个体工商户. So "how many companies are in 杭州" cannot be answered from this data. "How many
were registered in 杭州 since 2017-07, and how many of them are 个体工商户" can.

### Pitfalls the tools must handle

- `query` returns at most 2,000 rows and reports `truncated: false` when it cut them. More rows
  need paging (spike 0.1).
- A query with neither SQL `LIMIT` nor the `limit` argument failed after ~8 s with an HTTP/2
  `INTERNAL_ERROR`, and **the MCP session was dead afterwards**. Every call sends `limit`, and
  the client reconnects once on a lost session.
- Every scan over the table takes 13–17 s; `find_companies` takes 40–55 s. The server has a
  statement timeout: 15 concurrent scans hit it, and so does `ORDER BY id LIMIT n` with a
  selective filter, alone (spike 0.3). At most 3 concurrent calls per process.
- `<>` and `NOT IN` drop NULL rows silently (e.g. 2 rows with no `enterprise_type`).
- Dates are TEXT but uniformly `YYYY-MM-DD`, so string comparison is correct. `date_trunc`
  shifts results by the server's time zone; group by `LEFT(established_date, 7)` instead.
- `registered_capital` is 31% empty and 99.8% `万人民币` otherwise, with 15 other units.
  Capital analysis covers RMB values and says so. `paid_in_capital` is 93% empty.
- Filter by `city`, not `province` (杭州 has both `浙江省` and `浙江`). `enterprise_type` has
  full- and half-width bracket variants of the same type.
- The join key is `company_id` on one table and `id` on the other.
- Contact columns (`valid_mobile_phone`, `more_phones`, `email`, `other_email`) and
  `legal_representative` are returned like any other column (see "Personal data" below).

## Decisions (proposed)

| Decision | Choice | Why |
|---|---|---|
| Framework | eve, current release pinned exactly (0.82.0 today; weixin is on 0.38) | Same stack as the weixin agent: durable runs, skills, HTTP + MCP channels |
| How the agent reaches the data | **Authored tools** over an MCP client in `packages/company-db`, not an eve `defineMcpClientConnection` | eve MCP connections have no `toModelOutput` and cannot force `limit`; one `query_table` call without a limit can return millions of rows into context |
| MCP client | `@modelcontextprotocol/sdk` Streamable HTTP client with `X-API-Key`, one per process, reconnect once on session loss | The server kills the session on some errors |
| Results | Full result → `OUTPUT_DIR/<session>/<n>-<slug>.csv` (UTF-8 BOM so Excel opens it); the model sees columns, row count, a 20-row preview, the path, warnings | weixin's rule: the filesystem holds data, the context holds summaries |
| Row caps | `query`: the `limit` argument on every call (page = 2,000, the server's cap); keyset/`OFFSET` paging up to `QUERY_ROW_CAP` (default 10,000) in total. `find_companies`: one call with `limit = FIND_ROW_CAP` (default 5,000), paging only if `next_offset` is set. At most `COMPANY_DB_CONCURRENCY` (3) calls in flight | The server cannot take unbounded reads, hides its own truncation (spike 0.1), and times out under load (spike 0.3) |
| Model | Alibaba Cloud Bailian (百炼 / DashScope) OpenAI-compatible API through `@ai-sdk/openai-compatible`. The user picks the model per message in the web UI from an allowlist (`apps/agent/agent/lib/models.ts`, `ALIYUN_BAILIAN_MODELS`): DeepSeek V4.1 Flash (default) and V4 Pro (both 15/15 in spike 0.3), Qwen 3.8 Max, Qwen 3.7 Plus, Kimi K3, GLM 5.3 (tool calling smoke-tested, not evaluated). The choice travels as `clientContext.model`, the eve channel moves it onto the turn's auth, and a `step.started` resolver returns the model (eve accepts a live `LanguageModel` only there). Output capped at 65,536 tokens; Bailian's default is 8,192 | Owner's choice, revised 2026-10-22 to per-message selection |
| Personal data | No restriction: legal representative, phones, emails and addresses are returned, shown and exported like any other column. Revised 2026-10-22; until then they were stripped unless `EXPOSE_CONTACTS=true` | Owner's decision: public business-registration data, internal company tool |
| Web UI | `apps/web`: static Vite app (React 19, Tailwind 4) on `useEveAgent` from `eve/react`, same origin through a proxy (Vite in dev, Caddy in production); downloads via an eve custom channel `GET /files/:session/:name` behind the chat's auth; Chinese UI. Not eve's Vercel-first `channel/web` installer (spike 0.4) | Owner's choice: non-technical users from v1 |
| Sandbox | `justbash()`, built-in bash/file tools disabled | Aggregation runs server-side in SQL; no Docker needed. Revisit if we add Python post-processing |
| Repo layout | pnpm workspace: `apps/agent` (eve), `packages/company-db` (framework-free client, guards, result writing) | face-platform pattern; the CLI and tests use the package without eve |
| Tooling | face-platform's: pnpm 11 catalog, `saveExact`, oxfmt, ESLint, Vitest, Node 24, Conventional Commits | One set of habits across repos |
| Secrets | `COMPANY_DB_API_KEY` from env only, never a tool input, never committed | weixin rule: a leaked transcript cannot leak a key |

## Architecture

```
apps/web (browser) · eve dev TUI · MCP channel (Claude Code, Cursor)
        │  eve stream protocol · basic auth (shared route policy, as weixin)
        ▼
apps/agent (eve)
  instructions.md            always on: identity, coverage caveat, number rules
  skills/company-analysis    on demand: schema digest, pitfalls, SQL cookbook
  tools/company_*  ──────────▶ packages/company-db ── Streamable HTTP, X-API-Key ──▶ 企业库查询 MCP
  model: Bailian OpenAI-compatible API
  tools/read_output, write_report      client · guards · CSV/report writer
        │
        ▼
  OUTPUT_DIR/<session>/*.csv, *.md      full results; the model gets summaries,
                                        the web UI gets previews and download links
```

`toModelOutput` shapes only what the model sees. Channels receive the full tool output, so the
web UI can render a result's preview table and a download link from the same tool call.

## Agent tools

| Tool | Wraps | Model sees |
|---|---|---|
| `company_schema` | `get_schema` (cached) + our notes | Compact dictionary: column, type, comment; coverage; pitfalls |
| `company_sql` | `query` | Columns, row count, `truncated` (ours, not the server's), 20-row preview, CSV path, warnings (non-ISO date literal, `date_trunc`, `province` filter) |
| `company_find` | `find_companies` | `keyword_hits`, `semantic_only`, `score_distribution`, top 20, CSV path |
| `company_profile` | `query_table` by USCC or name (`ilike`, ≤ 10 candidates) | One company's record, or the candidate list to choose from |
| `company_similar` (phase 2) | `semantic_search` + join | Top-k companies like a description |
| `read_output` | local files | Paged slice of a saved CSV/Markdown (`offset`/`limit`), confined to `OUTPUT_DIR` |
| `write_report` | local files | Path of a Markdown report: question, findings, tables, the SQL used, coverage, as-of time |

`query_table` is not exposed for listing: `company_sql` covers it with a guaranteed limit.

## Rules (become AGENTS.md)

- Every remote call goes through `packages/company-db`. Tools never speak MCP themselves.
- Every query carries a `LIMIT`; no code path sends an unbounded read.
- Tool results stay under ~2k tokens. Anything larger goes to disk and is read back in slices.
- Numbers in answers come from a tool result in this session, never from memory or estimates.
  Each answer names the coverage window when it counts or compares, and the 个体工商户 share
  when it counts companies.
- `packages/company-db` imports no `eve`, `ai` or framework code (ESLint enforces it).
- Credentials come from the environment only.

## Phases

### Phase 0: spikes (results in `docs/spikes/0.x-*.md`)

- **0.1 Client.** Done: `docs/spikes/0.1-mcp-client.md`. SDK client with `X-API-Key`: session reuse, reconnect after the server drops
  a session, timeouts (`find_companies` takes tens of seconds), the server's row cap and payload
  size for `query`, behaviour under 2–4 concurrent calls.
- **0.2 SQL surface.** Done: `docs/spikes/0.2-sql-surface.md`. Which functions the whitelist allows (`regexp_replace`, `date_trunc`,
  `CASE`, `FILTER`, window functions); a capital parse expression covering every unit and
  currency present; `established_date` formats; freshness per city (latest date per city,
  since 深圳 2026 looks low next to 杭州).
- **0.3 Model.** Done: `docs/spikes/0.3-model.md`. 20 golden questions with known answers, run on two or three Bailian models
  with bare tools. Measure correct-SQL rate, latency and cost; pick the default. If it is poor, add structured tools (e.g.
  `company_stats` with `group_by` / `filters` / `period` parameters) instead of free SQL.
- **0.4 Web plumbing.** Done: `docs/spikes/0.4-web-plumbing.md`, with a working preview. How `eve/react` connects from a static app (base path, auth on the
  stream, CORS when served from another origin), and how to serve result downloads from
  `OUTPUT_DIR` behind the same auth (an eve route if eve has one, otherwise Caddy
  `file_server` with the same basic auth).

### Phase 1: an agent that answers

- **1.1 Workspace.** Root `package.json`, `pnpm-workspace.yaml` (catalog, `saveExact`),
  `tsconfig.base.json`, oxfmt, ESLint (core-purity rule), Vitest, `.nvmrc`, `.gitignore`,
  `.env.example`, `AGENTS.md` + `CLAUDE.md`, README, CI (format, lint, typecheck, test).
- **1.2 `packages/company-db`.** Client, `schema()`, `sql()`, `find()`, `profile()`, LIMIT
  injection, date-cast lint, CSV writer. Unit tests against an in-process fake MCP server
  (SDK `McpServer` over `InMemoryTransport`), including the dropped-session case.
- **1.3 `apps/agent`.** `agent.ts` (model, compaction), `instructions.md`, the tools above,
  skill `company-analysis`, `justbash` sandbox, built-ins disabled. `pnpm dev` answers the five
  typical questions.
- **1.4 CLI.** `pnpm cdb sql "<SELECT …>"`, `pnpm cdb find --desc … --kw …` → CSV.
- **1.5 `apps/web`.** Chat on `useEveAgent`: streamed answer, tool-call progress (queries can
  take tens of seconds), result tables from tool previews, CSV download links, sign-in through
  the route's basic auth. Served by Caddy next to the agent; in dev Vite proxies `/eve`.

### Phase 2: analysis quality

- **2.1 Cookbook** in the skill: new registrations by month / district / industry; cohort
  survival (注销/吊销 rate by establishment year); capital buckets; top-N; year-on-year;
  杭州 vs 深圳 restricted to their overlapping window (2020 →).
- **2.2 Reports and exports.** `write_report` with front matter (question, SQL, as-of,
  coverage); `export_xlsx` (one sheet per result).
- **2.3 Evals.** The 0.3 golden set (in `docs/spikes/0.3-model.md`, plus the missing kinds listed there) as eve evals with expected numbers computed by direct SQL.
  Run on demand and before releases (needs the model endpoint, so not in CI).
- **2.4 `company_similar`**, and charts in reports if users ask for them.

### Phase 3: ship

- **3.1 Channels.** eve HTTP channel + MCP channel with one basic-auth route policy (weixin's
  `lib/auth.ts`).
- **3.2 Image.** `apps/agent/Dockerfile` built from the repo root (the web build copied in for
  Caddy to serve), compose + Caddy, volumes for `.eve` workflow state and `OUTPUT_DIR`.
- **3.3 Release.** Tag `v<version>` → build, smoke-check `/eve/v1/health`, push to
  `registry.cn-hangzhou.aliyuncs.com/dskb/tianyancha-agent` (as face-platform).

### Phase 4 (optional): richer UI

Charts rendered in the web UI, saved sessions list, report viewer.

## Environment

Local values live in `.env.dev` (git-ignored, like every `.env*` except `.env.example`).

```env
COMPANY_DB_MCP_URL=https://h5.dskb.cn/zh/company/mcp/
COMPANY_DB_API_KEY=                 # never commit
QUERY_ROW_CAP=10000
COMPANY_DB_CONCURRENCY=3
FIND_ROW_CAP=5000
OUTPUT_DIR=./output
ALIYUN_BAILIAN_API_HOST=https://dashscope.aliyuncs.com   # the client appends /compatible-mode/v1
ALIYUN_BAILIAN_API_KEY=             # never commit
ALIYUN_BAILIAN_MODEL=deepseek-v4.1-flash-1017
ALIYUN_BAILIAN_CONTEXT_WINDOW=      # the model's window; baked at eve build
AGENT_USER=
AGENT_PASSWORD=
```

## Answered questions (2026-10-22)

1. **Personal data:** first hidden by default; revised the same day to no restriction (public
   registration data, internal tool).
2. **Model:** Alibaba Cloud Bailian through its OpenAI-compatible API (`@ai-sdk/openai-compatible`).
3. **Interface:** web UI from phase 1 (item 1.5), plus the TUI and MCP channel.
4. **Outputs:** CSV + Markdown in v1; xlsx in 2.2, charts in 2.4 / phase 4.
