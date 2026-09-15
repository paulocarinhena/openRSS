# syntax=docker/dockerfile:1

ARG NODE_IMAGE=node:22.20.0-bookworm-slim
FROM ${NODE_IMAGE} AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ── Dependências (inclui geração dos clients Prisma no postinstall) ──
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
COPY src/lib/env.ts ./src/lib/env.ts
RUN npm ci --no-audit --no-fund

# ── Build ──
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/generated ./src/generated
COPY . .
ENV DISABLE_SCHEDULER=true
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

# ── Runtime ──
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_PROVIDER=sqlite \
    DATABASE_URL=file:/data/openrss.db

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data && chown node:node /data

COPY --from=builder --chown=node:node /app/package.json /app/next.config.ts /app/prisma.config.ts ./
COPY --from=builder --chown=node:node /app/src/lib/env.ts ./src/lib/env.ts
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --chown=node:node docker-entrypoint.sh ./

USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
