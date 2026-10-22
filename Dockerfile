# syntax=docker/dockerfile:1
# One image, one port: the agent (eve build) serves the API and the web UI build (WEB_DIR).
# Build from the repo root: docker compose build, or docker build -t tianyancha-agent .

# ---- build ----------------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable

# Dependencies first, against the lockfile, so source edits keep this layer. The agent's
# postinstall vendors ECharts into agent/lib/vendor, so its script comes along.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/agent/package.json apps/agent/
COPY apps/agent/scripts apps/agent/scripts
COPY apps/web/package.json apps/web/
COPY packages/company-db/package.json packages/company-db/
COPY packages/artifacts/package.json packages/artifacts/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages packages
COPY apps apps

# The model's context window is baked in at eve build (lib/models.ts).
ARG ALIYUN_BAILIAN_CONTEXT_WINDOW=129024
ENV ALIYUN_BAILIAN_CONTEXT_WINDOW=${ALIYUN_BAILIAN_CONTEXT_WINDOW}
RUN pnpm --filter @tianyancha-agent/web build && pnpm --filter @tianyancha-agent/agent build

# ---- run ------------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app
# Time zone data, so TZ (docker-compose.yml: Asia/Shanghai) applies to shell tools too.
RUN apk add --no-cache tzdata
ENV NODE_ENV=production \
    PORT=3000 \
    WEB_DIR=/app/web \
    OUTPUT_DIR=/app/output

# `eve build` emits a self-contained Nitro server; no node_modules at runtime.
COPY --from=builder /app/apps/agent/.output ./.output
COPY --from=builder /app/apps/web/dist ./web

# Workflow state (.eve/.workflow-data: sessions, so chats survive a redeploy) and results
# (CSV, artifacts, chats.json) are volumes; create them owned by the non-root user.
RUN mkdir -p /app/.eve /app/output && chown -R node:node /app/.eve /app/output
USER node
EXPOSE 3000

# The health route is public by design, so it works as a container probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/eve/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
