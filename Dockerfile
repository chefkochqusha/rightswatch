# Bekvor on our own server (see SELF_HOSTING.md). Three stages:
#   deps    – exact packages from package-lock.json
#   builder – Prisma client + standalone Next.js build; also used once per
#             deploy to sync the schema (`migrate` service in deploy/compose.yml)
#   runner  – only the standalone output, as an unprivileged user
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma
COPY prisma.config.ts ./
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm ci --ignore-scripts && npx prisma generate

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY --from=deps /app/src/generated ./src/generated
ENV NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
RUN npx next build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app \
 && mkdir -p /data/uploads && chown app:app /data/uploads && chmod 700 /data/uploads
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3000/robots.txt >/dev/null || exit 1
CMD ["node", "server.js"]
