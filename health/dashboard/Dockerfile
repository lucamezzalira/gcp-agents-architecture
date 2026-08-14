FROM node:24-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY services/notification/package.json services/notification/package.json
COPY services/checkout/package.json services/checkout/package.json
COPY services/inventory/package.json services/inventory/package.json
COPY services/audit/package.json services/audit/package.json
COPY health/scoring/package.json health/scoring/package.json
COPY health/dashboard/package.json health/dashboard/package.json
COPY health/mcp-server/package.json health/mcp-server/package.json
COPY analysis/package.json analysis/package.json
COPY packages/observability/package.json packages/observability/package.json
RUN pnpm install --frozen-lockfile
COPY health/dashboard ./health/dashboard
RUN pnpm --filter @health/dashboard build

FROM node:24-bookworm-slim
WORKDIR /repo
COPY --from=build /repo /repo
ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080
WORKDIR /repo/health/dashboard
CMD ["node", "dist/server/entry.mjs"]
