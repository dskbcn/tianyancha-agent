# tianyancha-agent

企业数据分析 agent: an [eve](https://eve.dev) agent that answers questions about companies in
杭州 and 深圳 from the 企业库查询 MCP server (天眼查同源工商数据), with a web chat UI.

- Plan: [`docs/plans/company-agent.md`](docs/plans/company-agent.md)
- Spikes: [`docs/spikes/`](docs/spikes)

## Workspace

| Package | What |
|---|---|
| [`apps/agent`](apps/agent) | eve agent: instructions, `company-analysis` skill, tools, eve + files channels |
| [`apps/web`](apps/web) | Web chat (Vite, React 19, Tailwind 4) on `useEveAgent` |
| [`packages/company-db`](packages/company-db) | MCP client, guards, CSV. No eve imports |
| [`packages/artifacts`](packages/artifacts) | HTML artifacts: validate (incl. script syntax), edits, sandboxed page with data and ECharts |

## Run it

Requirements: Node 24, pnpm 11.

```sh
cp .env.example .env.dev   # fill COMPANY_DB_API_KEY and ALIYUN_BAILIAN_API_KEY
pnpm install
pnpm dev                   # agent on :2000, web on http://localhost:5173
```

eve dev picks up changes to `apps/agent/agent/` tools, skills and instructions on the next turn.
Changes to channels (`/files`, `/artifacts` routes) or to `packages/*` need a restart of `pnpm dev`.

`pnpm dev:agent` / `pnpm dev:web` run one side; `pnpm --filter @tianyancha-agent/agent dev:tui`
opens eve's terminal UI instead. CSV results land in `output/<sessionId>/`.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm --filter @tianyancha-agent/agent exec eve info   # agent discovery: must say "0 errors"
```

Skill files are YAML front matter plus Markdown: quote a `description` that contains `: `, or
discovery fails and `pnpm dev` stops.
