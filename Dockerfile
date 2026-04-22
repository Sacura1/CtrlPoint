FROM node:20-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# ── Build client ──────────────────────────────────────────────────────────────
FROM base AS client-builder
COPY client/package*.json ./client/
RUN cd client && npm ci
COPY client ./client
RUN cd client && npm run build

# ── Build server ──────────────────────────────────────────────────────────────
FROM base AS server-builder
COPY server/package*.json ./server/
RUN cd server && npm ci
COPY server ./server
RUN cd server && npx prisma generate && npm run build

# ── Production image ──────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production

COPY --from=server-builder /app/server/node_modules ./server/node_modules
COPY --from=server-builder /app/server/dist ./server/dist
COPY --from=server-builder /app/server/prisma ./server/prisma
COPY --from=server-builder /app/server/package.json ./server/package.json
COPY --from=client-builder /app/client/dist ./client/dist

WORKDIR /app/server

# Create data directory for SQLite
RUN mkdir -p /app/data

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
