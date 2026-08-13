FROM node:24-bookworm AS node
FROM python:3.12-bookworm
WORKDIR /repo
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -sf ../lib/node_modules/corepack/dist/corepack.js /usr/local/bin/corepack \
  && ln -sf ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
  && corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY health/scoring ./health/scoring
COPY health/agent ./health/agent
RUN pnpm install --frozen-lockfile --filter @health/scoring...
WORKDIR /repo/health/agent
RUN python3 -m venv .venv && .venv/bin/pip install --no-cache-dir -e ".[adk]"
ENV PORT=8080
ENV HEALTH_REASONER=adk
ENV GOOGLE_GENAI_USE_VERTEXAI=true
EXPOSE 8080
WORKDIR /repo
CMD ["health/agent/.venv/bin/python", "-m", "health_agent.push_server"]
