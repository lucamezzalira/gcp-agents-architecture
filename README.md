# Architectural health for an AI-accelerated migration

Two services carved out of a legacy monolith, plus a health system that scores whether the result still matches the intended architecture.

Read `docs/PRD.md` for what and why, `docs/BUILD-SPEC.md` for the tree, contracts, and build order.

## What is real and what is not

Real: notification and checkout, their layering, Pub/Sub, Firestore, Postgres, the health agent, Memory Bank, the MCP server, the dashboard, ts-arch, dependency-cruiser, jscpd, Cloud Trace, the commit history, the scoring model, Terraform.

Illustrative: runtime and security signals. They arrive with `illustrative: true` and carry no weight. The dashboard labels them as such.

## Commands

```
pnpm install
pnpm test
```

`pnpm arch`, `pnpm depcruise`, `pnpm jscpd`, and `pnpm collect` run the analysis tools and write an `AnalysisPayload`.

The health agent never computes a score. Scores come from `health/scoring` and are deterministic.
