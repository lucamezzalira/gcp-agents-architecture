# AGENTS.md

Monorepo containing services under migration and a health system that measures them.

`docs/PRD.md` is the original specification. `docs/BUILD-SPEC.md` is the implementation contract (tree, contracts, schema, acceptance criteria). Follow the build order in the spec for greenfield work.

## Layout

- `packages/observability` — sealed logger and tracing. Services import it as-is.
- `services/notification` — the only service allowed to talk to the email provider
- `services/checkout` — owns orders, renders its own emails, publishes send instructions, reserves stock through inventory
- `services/inventory` — owns stock levels and reservations, publishes reservation outcomes
- `services/audit` — append-only log of send-instructions already on the bus
- `health/scoring` — deterministic scoring, pure TypeScript, no I/O. Runs on the Cloud Run receiver. Not present in the agent image.
- `health/agent` — two images from one tree. Cloud Run receiver (Pub/Sub, scoring, Postgres). Agent Runtime reasoner (ADK, Memory Bank, prose).
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

1. Transport must not import provider or storage clients directly, and must not depend on the `infrastructure` folder.
2. Infrastructure must not import domain use cases. Ports (store, provider, publisher, lookup, mailer) stay allowed.
3. **Only `services/notification` may import or call the email provider.**
4. No service reads another service's data store. Each service has its own Firestore database.
5. No service imports another service's internal modules.
6. Domain must not depend on transport types.
7. Transport in one service must not depend on transport in another.
8. Domain must not depend on infrastructure.
9. Infrastructure must not depend on transport.
10. Every service imports `@observability/runtime` as-is. Do not boot a tracer, clone the logger, or subclass it.

Layer directory names (`transport/`, `domain/`, `infrastructure/`) are load-bearing. The architecture tests are written against them. NEVER rename or restructure them.

## Hard prohibitions

- NEVER import the email provider outside `services/notification`.
- NEVER create a shared rendering package. Each service renders its own email. The duplication is deliberate.
- Observability is shared: import `@observability/runtime`. Do not subclass or wrap it.
- NEVER let the health agent compute or modify a score. Scores are deterministic and come from `health/scoring` on the Cloud Run receiver. The scoring package is not in the agent's image, so this is a deployment boundary, not an instruction the model is asked to obey. Postgres is the system's record (receiver). Memory Bank is the agent's own memory (agent). Nothing writes to both.
- NEVER add barrel files that re-export across layer boundaries.
- NEVER use `any`.
- Do not add a dependency without checking it is not already in the workspace.

## Conventions

Ports and adapters: `domain/` defines interfaces, `infrastructure/` implements them. Tests colocate as `*.test.ts`. Every service must run locally against in-memory adapters with no cloud credentials.
