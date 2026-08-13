FROM node:24-bookworm
WORKDIR /repo
RUN corepack enable \
  && apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv python3-pip \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY health/scoring ./health/scoring
COPY health/agent ./health/agent
COPY pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --filter @health/scoring...
WORKDIR /repo/health/agent
# Stub reasoner only. Skip google-adk so pip does not backtrack on Python 3.11 (node:24-bookworm).
RUN rm -rf .venv && python3 -m venv .venv && .venv/bin/pip install --no-cache-dir -e .
ENV PORT=8080
ENV HEALTH_REASONER=stub
EXPOSE 8080
WORKDIR /repo
CMD ["health/agent/.venv/bin/python", "-m", "health_agent.push_server"]
