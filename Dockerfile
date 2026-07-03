# SutazMail v2 — multi-tenant mail platform (Next.js 16 + Prisma 7 + Postgres).
# Full app image (not standalone) so the Prisma CLI is available at runtime for
# `migrate deploy` — same proven pattern as SutazStays. Built on the NAS.
FROM node:22-alpine AS deps
WORKDIR /app
# postinstall runs `prisma generate`, which needs the schema + config (copied first).
COPY package.json package-lock.json* prisma.config.ts ./
COPY prisma ./prisma
# There may be no lockfile yet — `npm ci` requires one, so fall back to `npm install`.
RUN npm ci || npm install

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Dummy URL so anything touching the Prisma client during `next build` doesn't throw
# (the real DATABASE_URL is injected at runtime).
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build /app ./
EXPOSE 3000
# Compose overrides CMD to run `prisma migrate deploy` + seed before `next start`.
CMD ["npm", "run", "start"]
