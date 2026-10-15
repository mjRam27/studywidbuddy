# Build context: repository root (the API compiles packages/shared into its output).
#   docker build -f apps/api/Dockerfile -t studywidbuddy-api .

FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /repo
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api/package.json apps/api/package-lock.json apps/api/
RUN cd apps/api && npm ci
COPY apps/api apps/api
RUN cd apps/api && npm run build && npm prune --omit=dev

FROM node:22-alpine
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /app/apps/api
COPY --from=build --chown=node:node /repo/apps/api/package.json ./
COPY --from=build --chown=node:node /repo/apps/api/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/apps/api/prisma ./prisma
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
USER node
EXPOSE 3000
# Apply pending migrations, then start. Migrations are forward-only and idempotent.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/apps/api/src/main.js"]
