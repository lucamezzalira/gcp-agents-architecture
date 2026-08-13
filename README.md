# Architectural health for an AI-accelerated migration

Two services carved out of a legacy monolith, plus a health system that scores whether the result still matches the intended architecture.

Read `docs/PRD.md` for what and why, `docs/BUILD-SPEC.md` for the tree, contracts, and build order.

## What is real and what is not

Real: notification and checkout, their layering, Pub/Sub, Firestore, Postgres, the health agent, Memory Bank, the MCP server, the dashboard, ts-arch, dependency-cruiser, jscpd, Cloud Trace, the commit history, the scoring model, Terraform.

Illustrative: runtime and security signals. They arrive with `illustrative: true` and carry no weight.

## Commands

```
pnpm install
pnpm test
docker compose up -d postgres
./scripts/replay.sh
pnpm dashboard                 # http://localhost:4321
./scripts/dev-services.sh      # checkout :3000, notification :3001
```

Pay an order and inspect the in-memory send:

```
curl -sS -X POST http://127.0.0.1:3000/orders \
  -H 'content-type: application/json' \
  -d '{"id":"ord-1","email":"buyer@example.com"}'
curl -sS -X POST http://127.0.0.1:3000/orders/ord-1/pay
curl -sS http://127.0.0.1:3001/sent
```

`pnpm arch`, `pnpm depcruise`, `pnpm jscpd`, and `pnpm collect` run the analysis tools and write an `AnalysisPayload`.

GCP Terraform lives in `infra/`. Do not apply it until a billing account exists. See `infra/README.md`.

The health agent never computes a score. Scores come from `health/scoring` and are deterministic. Local default is `HEALTH_REASONER=stub`. Set `adk` when credentials exist.
