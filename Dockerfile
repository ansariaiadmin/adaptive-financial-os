FROM node:20-alpine AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/ packages/
COPY apps/ apps/

RUN pnpm install --frozen-lockfile=false

RUN pnpm --filter @adaptive-financial-os/accounting-core build
RUN pnpm --filter @adaptive-financial-os/api build
RUN pnpm --filter @adaptive-financial-os/outbox-relay build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY --from=build /app/node_modules/ ./node_modules
COPY --from=build /app/packages/ ./packages
COPY --from=build /app/apps/ ./apps

WORKDIR /app/apps/api
EXPOSE 3000

CMD ["node", "dist/main.js"]
