# AGENTS.md

Monorepo containing two services under migration and a health system that measures them.

Read `docs/PRD.md` for what this is, `docs/BUILD-SPEC.md` for the tree, contracts, schema and acceptance criteria. Follow the build order in the spec; do not jump ahead to cloud deployment.

## Layout

- `services/notification` — the only service allowed to talk to the email provider
- `services/checkout` — owns orders, renders its own emails, publishes send instructions
- `health/scoring` — deterministic scoring, pure TypeScript, no I/O
- `health/agent` — Python ADK agent, writes reasoning around the computed scores
- `health/mcp-server`, `health/dashboard`
- `analysis/` — ts-arch rules, dependency-cruiser, jscpd config
- `infra/` — Terraform, two GCP projects

## Stack

pnpm workspaces, Turborepo. TypeScript on Node 24 with Fastify for services. Zod at the HTTP and payload boundary. Python 3.12 with ADK for the agent. Astro for the dashboard. Vitest and pytest. One Firestore database per service. Postgres for health history only.

## MCP (Cursor)

Project config is `.cursor/mcp.json`. It points at the Cloud Run MCP (`https://health-mcp-k3ljxa4a4q-ew.a.run.app/mcp`), which reads Cloud SQL.

Tools: `list_health_runs` (trend across commits), `get_health` (latest or a SHA, optional path), `get_prior_decisions`, `list_characteristics`. Scores come from Postgres. Do not invent them.

## Commands

```
pnpm install
pnpm test               # all workspaces
pnpm arch               # ts-arch rules
pnpm depcruise          # dependency-cruiser
pnpm jscpd              # duplication
```

## Architecture rules — these are enforced by tests

1. Transport must not import provider or storage clients directly.
2. Infrastructure must not contain domain decisions.
3. **Only `services/notification` may import or call the email provider.**
4. No service reads another service's data store. Each service has its own Firestore database.
5. No service imports another service's internal modules.

Layer directory names (`transport/`, `domain/`, `infrastructure/`) are load-bearing. The architecture tests are written against them. NEVER rename or restructure them.

## Hard prohibitions

- NEVER import the email provider outside `services/notification`.
- NEVER create a shared rendering package. Each service renders its own email. The duplication is deliberate.
- NEVER let the health agent compute or modify a score. Scores are deterministic and come from `health/scoring`.
- NEVER add barrel files that re-export across layer boundaries.
- NEVER use `any`.
- Do not add a dependency without checking it is not already in the workspace.

## Conventions

Ports and adapters: `domain/` defines interfaces, `infrastructure/` implements them. Tests colocate as `*.test.ts`. Every service must run locally against in-memory adapters with no cloud credentials.
