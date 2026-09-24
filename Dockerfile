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
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs \
    && chown -R nextjs:nodejs /app
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY --from=build --chown=nextjs:nodejs /app/node_modules/ ./node_modules
COPY --from=build --chown=nextjs:nodejs /app/packages/ ./packages
COPY --from=build --chown=nextjs:nodejs /app/apps/ ./apps
USER nextjs
WORKDIR /app/apps/api
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
