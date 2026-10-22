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
front. Build the image on your machine and push it to the Aliyun registry (log in first with
`docker login registry.cn-hangzhou.aliyuncs.com`); `--platform` matters on an Apple Silicon Mac:

```sh
docker buildx build --platform linux/amd64 --push \
  -t registry.cn-hangzhou.aliyuncs.com/dskb/tianyancha-agent:beta.1 .
```

`docker-compose.yml` is a Docker Swarm stack (Dokploy "Stack"). On the server, create the data
directories once, owned by the image's user (uid 1000); a bind mount fails on a missing one:

```sh
mkdir -p /ssd_srv/apps/tianyancha-agent/{eve,output}
chown -R 1000:1000 /ssd_srv/apps/tianyancha-agent
```

In Dokploy: a Compose service of type Stack from this repo, the `.env` contents in its
Environment tab (the two API keys, `AGENT_USERS`), and the Aliyun registry under Registry so
nodes can pull. By hand, next to `docker-compose.yml` and a `.env`, logged in to the registry:

```sh
docker stack deploy --with-registry-auth -c docker-compose.yml tianyancha-agent
curl http://localhost:22030/eve/v1/health
```

Testers open `http://<server-ip>:22030/` and sign in with their login (the browser asks). Each
login sees only its own chats, results and artifacts.

- **Logins:** `AGENT_USERS=alice:pw1,13800138000:pw2` (`name:password`, comma-separated; a
  password may contain `:` but not `,`). Change the list and redeploy. A removed login's chats
  stay on disk but nobody can open them.
- **Data:** `/ssd_srv/apps/tianyancha-agent/eve` (sessions: without it every chat's session ends
  on redeploy) and `.../output` (CSVs, artifacts, `chats.json`). Back up that directory.
- **Update:** push a new tag (`beta.2`), set `AGENT_TAG=beta.2`, redeploy. Swarm stops the old
  task before starting the new one (one process owns the state) and rolls back if it fails.
  Running chats continue after the restart.
- **Variables in the file** (`AGENT_TAG`, `AGENT_PORT`, `DATA_DIR`) are read from the shell or
  Dokploy's environment when the stack is deployed; `docker stack deploy` does not read `.env`
  for them. Unset, they default to `beta.1`, `22030` and `/ssd_srv/apps/tianyancha-agent`.
- **One replica, one node:** the state is files on that host's disk, so the stack runs one task
  pinned to a manager node. On a multi-node swarm, pin it to the data's host instead.
- **Plain HTTP:** passwords cross the network unencrypted, so keep it on the internal network.
  For a domain with TLS, route Dokploy's Traefik to the service on port 3000.

## Checks

```sh
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm check:agent
```

CI (`.github/workflows/ci.yml`) runs the same. Conventions for people and agents: [`AGENTS.md`](AGENTS.md).

Skill files are YAML front matter plus Markdown: quote a `description` that contains `: `, or
discovery fails and `pnpm dev` stops.
