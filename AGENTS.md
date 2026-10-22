# AGENTS.md

Guidance for AI agents (Claude Code, Codex, Cursor) and people working in this repo.

## What this is

企业数据分析 agent: an [eve](https://eve.dev) agent that answers questions about companies in
杭州 and 深圳 from the 企业库查询 MCP server (天眼查同源工商数据), and turns results into HTML
artifacts, with a web chat UI. The plan, with decisions already made, is
`docs/plans/company-agent.md`; measured facts about the data and the models are in
`docs/spikes/`. Read the plan before changing architecture, and update it when a decision changes.

## Layout

```
apps/agent/            eve agent: agent.ts, instructions.md, skills/, tools/, channels/, lib/
apps/web/              Web chat (Vite, React 19, Tailwind 4) on useEveAgent
packages/company-db/   MCP client for the data source: guards, CSV. No eve, AI SDK or React
packages/artifacts/    HTML artifacts: validate, edit, prepare for the sandbox. Same rule
docs/plans/, docs/spikes/
```

## Rules

- **Every data call goes through `packages/company-db`.** Tools never speak MCP themselves.
  Every `query` call sends `limit` (an unbounded query can kill the server session); at most
  `COMPANY_DB_CONCURRENCY` (3) calls run at once (more trips the server's statement timeout).
- **Numbers come from tool results.** In answers, and in artifacts: a page reads query results as
  `window.DATA` through its `data` references; a page that reads `DATA` without them is refused.
  Never add fallback data to a page or a prompt.
- **Full results go to disk, summaries to the model.** Tools write CSV (+ JSON for artifacts) to
  `OUTPUT_DIR/<sessionId>/` and use `toModelOutput` to keep the model's view small. The UI gets
  the full tool output.
- **Model-written HTML runs sandboxed.** `/artifacts` serves pages with a CSP `sandbox` header and
  no network; `packages/artifacts` rejects external resources and scripts that do not compile.
  Libraries are served from our side (`<script src="lib:echarts">`), never a CDN.
- **`packages/*` stay framework-free.** oxlint enforces it (`.oxlintrc.json`). Apps adapt
  packages, never the other way round.
- **One auth policy.** Every channel and route calls `routePolicy()` from
  `apps/agent/agent/lib/auth.ts` (`routeAuth` for custom routes).
- **Models are an allowlist.** `apps/agent/agent/lib/models.ts`; the eve channel accepts a model
  from `clientContext.model` only if listed. Bailian needs `maxOutputTokens` set (its default is
  8,192, too short for artifacts).
- **Credentials come from the environment** (`.env.dev` locally, git-ignored). Never in tool
  input, prompts, code or commits.

## eve specifics

- Read the installed docs, `node_modules/eve/docs/` (resolve the package from `apps/agent`).
  eve moves fast; docs from memory or the web may describe another version.
- Tool files: declare `label` and `toModelOutput` **after** `execute`, or TypeScript types
  `output` as `unknown`.
- Skill files are YAML front matter + Markdown: quote `description` (a `: ` inside breaks
  discovery and stops `pnpm dev`). `pnpm check:agent` catches it.
- `eve dev` picks up tools, skills and instructions on the next turn. Channels and `packages/*`
  need a restart. Sessions from before a restart are dormant (409 `session_not_active`); the web
  UI continues them in a new session with the transcript as `history`.
- A dynamic model may return a live `LanguageModel` only from `step.started` (session and turn
  selections must be AI Gateway id strings), which is why `agent.ts` resolves there.

## Commands

Run from the repo root.

| Command                             | What                                                                 |
| ----------------------------------- | -------------------------------------------------------------------- |
| `pnpm dev`                          | Agent on :2000 and web on <http://localhost:5173> (needs `.env.dev`) |
| `pnpm format` / `pnpm format:check` | oxfmt                                                                |
| `pnpm lint`                         | oxlint, zero warnings                                                |
| `pnpm typecheck`                    | `tsc --noEmit` in every package                                      |
| `pnpm test`                         | Vitest in every package                                              |
| `pnpm check:agent`                  | eve discovery: fails on a broken skill, tool or channel file         |

Before saying a change is done: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test &&
pnpm check:agent`. For agent or UI behaviour, also run it: `pnpm dev`, then a real question in
the browser. Agent behaviour is not covered by unit tests yet (evals: plan item 2.3).

## Workflow

- One branch per plan item (`feat/<item>-<slug>`, e.g. `feat/1.6-server-chats`).
- Conventional Commits, scoped by package: `agent`, `web`, `company-db`, `artifacts`; `deps` for
  dependency bumps; none for whole-repo changes (`ci`, plan `docs`).
- Unit tests sit next to the code (`*.test.ts`).

## Dependencies

- Exact versions (`saveExact`). Versions used by more than one package live in the `catalog` in
  `pnpm-workspace.yaml`; packages reference them as `"catalog:"`.
- TypeScript 7 (as eve's scaffold). typescript-eslint does not support it yet, hence oxlint.
- pnpm 11 runs dependency build scripts only for packages under `allowBuilds`.
