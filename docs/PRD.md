# PRD — Architectural health for an AI-accelerated migration

## What this is

Two things in one repository.

1. **Two services** carved out of a legacy monolith. The subject under observation.
2. **A health system** that watches the migration and reports whether the result still resembles its intended architecture. The point of the exercise.

The demonstration is a real commit history containing genuine improvements and regressions, analysed run by run, so the health read moves over time rather than turning on a single staged catch.

## Services under migration

### Notification service

The only service permitted to talk to the email provider. Everything else routes through it.

Knows nothing about calling domains. Does not render, hold templates, or interpret business events. Receives a recipient, a subject and a pointer to pre-rendered HTML, and delivers.

Input arrives on Pub/Sub. The HTML body is passed by reference (claim check) because rendered HTML email exceeds message size quotas.

Behaviour: receive, enforce idempotency on `messageId` so redelivery never sends twice, fetch the HTML by `bodyRef`, send via provider, record outcome.

Pub/Sub is at-least-once; the service makes the effect exactly-once. That is its domain decision.

### Checkout service

Owns orders through payment. When an order is paid it renders a confirmation email stating the order ships within 48 hours, stores the rendered HTML in object storage, and publishes a send instruction to the notification service.

Owns its rendering entirely. No shared rendering library exists.

### Layering

Both services follow three layers.

- **Transport** — Pub/Sub subscribers, HTTP surface. Accepts input, validates shape, hands off. Makes no decisions.
- **Domain** — owns the decisions. Idempotency in notification, order state and the notify decision in checkout.
- **Infrastructure** — object storage, provider clients, database access. Performs actions, decides nothing.

Dependencies point inward. Transport depends on domain. Domain defines the interfaces infrastructure implements.

## Health system

### Signals

Three real, two leftover illustrative.

- **Architecture tests** (real) — ts-arch, encoding declared rules as executable tests.
- **Static analysis** (real) — dependency-cruiser: dependency graphs, coupling, cycles, orphans.
- **Duplication** (real) — jscpd. Present because the no-shared-rendering decision creates duplication the system should surface without condemning.
- **Runtime call graph** (real, synthetic traffic) — Cloud Trace edges from a smoke script. Compared with the import graph. Not scored.
- **p95-latency and error-rate** (illustrative) — representative numbers. Labelled as such in the repo and the article.

### Architecture rules

Within each service:

1. Transport must not import provider or storage clients directly.
2. Infrastructure must not contain domain decisions.

Across services:

3. **No service other than notification may import or call the email provider.** The rule the demonstration turns on.
4. No service reads another service's data store.
5. No service imports another service's internal modules.

### Flow

Push triggers CI. CI runs ts-arch, dependency-cruiser and jscpd. CI publishes their output to a Pub/Sub topic in the health project. The health agent, subscribed to that topic, produces a health read.

The agent runs no analysis tools itself. It consumes their output.

A replay mechanism runs the same flow across the commit history to populate the trend.

### Health agent

Python, ADK, deployed to Agent Runtime. Runs under an attested Agent Identity. Traced through Cloud Trace so a team that did not run the analysis can reconstruct the verdict.

Reads all signals together, loads accepted decisions for the paths in scope, produces the health read.

Deterministic results are authoritative where certain. A failed architecture test is a fact; the agent does not argue with it.

### Scoring

Deterministic. Fixed inputs, fixed weights, published in the repo so anyone can recompute by hand.

- Each characteristic scores 0 to 100.
- Scores derive from the deterministic signals, each with a stated weight and penalty.
- Overall is a weighted roll-up.
- An accepted decision suppresses the penalty it covers, and the suppression is shown rather than hidden.

The same commit analysed twice produces the same number. **The agent does not set the score.**

The agent contributes what the number cannot carry: reasoning about what the signals mean together, judgment where tools are silent, distinguishing a violation from an accepted trade-off, and recommendations for raising a score below 100.

### Accepted decisions

Deviations the team has explicitly accepted, so the system does not relitigate settled decisions every run.

Stored in Postgres as the authoritative record. The agent loads active decisions in scope at the start of a run. A minimal path for recording a decision is required and is not faked.

Memory Bank holds the agent's own accumulated reasoning across runs. Postgres records what the team agreed; Memory Bank is what the agent has learned about this codebase.

### Outputs

**Dashboard** — real UI on Cloud Run, public, no auth. Current overall and per-category scores, reasoning, recommendations, trend across the commit history.

**MCP server** — exposes the health read to coding agents:
- `get_health` — current health for a path or service, with reasoning and recommendations
- `get_prior_decisions` — decisions already accepted for a path
- `list_characteristics` — the characteristics being tracked

MCP provides context, not enforcement. The health read still runs after every change.

## The demonstration

A real commit history. The central regression: checkout imports the email provider client directly to get a confirmation out quickly. It compiles, passes every test, reads reasonably in a large diff, and quietly makes the notification service pointless.

Other commits move the other way, tightening boundaries and removing coupling, so the trend rises and falls on real work.

## Infrastructure

Terraform, two GCP projects.

**Project A — health system**: Pub/Sub topic and subscription for signals, health agent on Agent Runtime with Agent Identity, Memory Bank, Cloud SQL Postgres, MCP server on Cloud Run, dashboard on Cloud Run, Cloud Trace.

**Project B — services**: Pub/Sub topic and subscription for send instructions, notification and checkout on Cloud Run, one Firestore database per service, Cloud Storage for claim-check bodies.

Checkout's Firestore holds orders. Notification's Firestore holds delivery records (idempotency). They are separate databases so an outage of one does not take the other service's state down. Notification fetches HTML by `bodyRef` from Cloud Storage. It does not read checkout's database.

Cross-project IAM allows CI to publish to the health project's signal topic. Region is not significant; pick one and stay consistent.

## What is real and what is not

Real: both services and their infrastructure, Pub/Sub, Firestore, Postgres, the health agent, Memory Bank, the MCP server, the dashboard, ts-arch, dependency-cruiser, jscpd, Cloud Trace, the commit history, the scoring model, all Terraform.

Illustrative: p95-latency, error-rate, and security signals, supplied as representative data. The runtime call graph is observed from synthetic smoke traffic generated in CI for the scored commit, and is not scored.

Stated plainly in the repository README and in the article.

## Open decisions

- Exact weights in the scoring model. Settle once real signal output is available.
- Shape of the commit history: how many commits, which improvements sit alongside the central regression.
- Whether checkout's 48-hour rule needs enforcement or exists only as content in the email.
