# Scoring model

The score is deterministic. These weights are the specification; `health/scoring` must match this document exactly, and any change touches both in the same commit.

## Characteristics

| Id | What it measures |
| --- | --- |
| `boundary-integrity` | Whether service boundaries hold, especially provider access |
| `layering` | Whether the transport, domain and infrastructure separation holds |
| `coupling` | Structural coupling between and within services |
| `duplication` | Repeated code across the codebase |

## Method

Each characteristic starts at 100. Every deterministic finding applies its penalty. Scores floor at 0.

An active `accepted_decision` matching the rule and path suppresses that penalty. Suppression appears in `suppressedBy` on the output; it is never silent.

## Penalties

TO BE SET once real tool output is available. Placeholders below establish the shape.

| Signal | Finding | Characteristic | Penalty |
| --- | --- | --- | --- |
| ts-arch | rule 3 violated (provider imported outside notification) | `boundary-integrity` | 40 |
| ts-arch | rule 4 violated (cross-service data store read) | `boundary-integrity` | 30 |
| ts-arch | rule 5 violated (cross-service internal import) | `boundary-integrity` | 25 |
| ts-arch | rule 1 violated (transport imports client) | `layering` | 20 |
| ts-arch | rule 2 violated (decision in infrastructure) | `layering` | 20 |
| dependency-cruiser | each cycle | `coupling` | 15 |
| dependency-cruiser | each orphan | `coupling` | 5 |
| jscpd | each 1% duplication above 5% | `duplication` | 5 |

## Overall

Weighted mean of the characteristic scores.

| Characteristic | Weight |
| --- | --- |
| `boundary-integrity` | 0.4 |
| `layering` | 0.3 |
| `coupling` | 0.2 |
| `duplication` | 0.1 |

Boundary integrity carries the most weight because a breached service boundary is the failure that makes the decomposition pointless.

Runtime signals carry no weight. They are illustrative and are reported, not scored.
