FROM node:24-bookworm-slim
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY services/notification/package.json services/notification/package.json
COPY services/checkout/package.json services/checkout/package.json
COPY health/scoring/package.json health/scoring/package.json
COPY health/dashboard/package.json health/dashboard/package.json
COPY health/mcp-server/package.json health/mcp-server/package.json
COPY analysis/package.json analysis/package.json
RUN pnpm install --frozen-lockfile
COPY health/mcp-server ./health/mcp-server
ENV PORT=8080
ENV MCP_HTTP=1
EXPOSE 8080
WORKDIR /repo/health/mcp-server
CMD ["pnpm", "exec", "tsx", "src/main.ts"]
