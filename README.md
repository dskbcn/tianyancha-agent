# tianyancha-agent

企业数据分析 agent: an [eve](https://eve.dev) agent that answers questions about companies in
杭州 and 深圳 from the 企业库查询 MCP server (天眼查同源工商数据), with a web chat UI.

- Plan: [`docs/plans/company-agent.md`](docs/plans/company-agent.md)
- Spikes: [`docs/spikes/`](docs/spikes)

## Workspace

| Package                                      | What                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [`apps/agent`](apps/agent)                   | eve agent: instructions, `company-analysis` skill, tools, eve + files channels              |
| [`apps/web`](apps/web)                       | Web chat (Vite, React 19, Tailwind 4) on `useEveAgent`                                      |
| [`packages/company-db`](packages/company-db) | MCP client, guards, CSV. No eve imports                                                     |
| [`packages/artifacts`](packages/artifacts)   | HTML artifacts: validate (incl. script syntax), edits, sandboxed page with data and ECharts |

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

## Deploy (beta)

One container on one port: the agent serves the API and the web UI's build, with no proxy in
front. On the server, from a checkout of this repo, with Docker:

```sh
cp .env.example .env        # fill the two API keys and AGENT_USERS (one login per tester)
docker compose up -d --build
curl http://localhost:8080/eve/v1/health
```

Testers open `http://<server-ip>:8080/` and sign in with their login (the browser asks). Each
login sees only its own chats, results and artifacts. `AGENT_PORT` in `.env` changes the port.

- **Logins:** `AGENT_USERS=alice:pw1,bob:pw2`. Change the list and `docker compose up -d` (no
  rebuild). A removed login's chats stay on disk but nobody can open them.
- **Data:** two volumes, `workflow-data` (sessions: without it every chat's session ends on
  redeploy) and `output` (CSVs, artifacts, `chats.json`). `docker compose down -v` deletes them.
- **Update:** `git pull && docker compose up -d --build`. Running chats continue after the restart.
- **Plain HTTP:** passwords cross the network unencrypted, so keep it on the internal network.
  For a domain with TLS, put Dokploy (Traefik) in front of the same container on port 3000.

## Checks

```sh
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm check:agent
```

CI (`.github/workflows/ci.yml`) runs the same. Conventions for people and agents: [`AGENTS.md`](AGENTS.md).

Skill files are YAML front matter plus Markdown: quote a `description` that contains `: `, or
discovery fails and `pnpm dev` stops.
