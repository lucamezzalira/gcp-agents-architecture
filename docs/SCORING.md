# Scoring model

The score is deterministic. These weights are the specification; `health/scoring` must match this document exactly, and any change touches both in the same commit.

## Characteristics

| Id | What it measures | Where it lives |
| --- | --- | --- |
| `boundary-integrity` | Whether a service's own files respect declared boundaries | each service, rolled up to the platform |
| `layering` | Whether transport, domain and infrastructure stay separated | each service, rolled up to the platform |
| `coupling` | Cycles, orphans, dep-cruiser faults, and efferent coupling growth | each service, rolled up to the platform |
| `duplication` | Internal clones inside one service | each service, rolled up to the platform |
| `cross-service-integrity` | The relationship: rules 3-5 and 7, plus clones that span services | platform only |

Runtime signals carry no weight. They are illustrative and are reported, not scored.

## Method

Each characteristic starts at 100. Every deterministic finding applies its penalty. Scores floor at 0.

An active `accepted_decision` matching the rule, path, and scope suppresses that penalty. Suppression appears in `suppressedBy` on the output; it is never silent.

A decision's `scope` is a service name (`checkout`, `notification`) or `platform`. A platform-scoped decision may suppress a finding in any service whose path matches. A service-scoped decision only suppresses findings attributed to that service.

## Attribution

A violation is attributed to the service that owns the file which committed it (`services/<name>/...`). If checkout imports the email provider, checkout's `boundary-integrity` drops and notification's does not.

The same boundary breach also penalises platform `cross-service-integrity`, because the relationship failed even though only one side caused it.

## Services

Known services in this build: `checkout` and `notification`. A service listed in the payload is scored even when it has no findings (every characteristic 100). New services are included from their first commit.

## Penalties

| Signal | Finding | Characteristic | Scope | Penalty |
| --- | --- | --- | --- | --- |
| ts-arch | rule 3 (provider imported outside notification) | `boundary-integrity` | offending service | 40 |
| ts-arch | rule 3 | `cross-service-integrity` | platform | 40 |
| ts-arch | rule 4 (cross-service data store read) | `boundary-integrity` | offending service | 30 |
| ts-arch | rule 4 | `cross-service-integrity` | platform | 30 |
| ts-arch | rule 5 (cross-service internal import) | `boundary-integrity` | offending service | 25 |
| ts-arch | rule 5 | `cross-service-integrity` | platform | 25 |
| ts-arch | rule 1 (transport imports infrastructure or a provider/storage client) | `layering` | offending service | 20 |
| ts-arch | rule 2 (infrastructure imports domain other than `domain/ports`) | `layering` | offending service | 20 |
| ts-arch | rule 6 (domain imports transport) | `layering` | offending service | 20 |
| ts-arch | rule 7 (transport imports another service's transport) | `boundary-integrity` | offending service | 25 |
| ts-arch | rule 7 | `cross-service-integrity` | platform | 25 |
| ts-arch | rule 8 (domain imports infrastructure) | `layering` | offending service | 20 |
| ts-arch | rule 9 (infrastructure imports transport) | `layering` | offending service | 20 |
| dependency-cruiser | each cycle | `coupling` | service owning the cycle path | 15 |
| dependency-cruiser | each orphan | `coupling` | service owning the orphan | 5 |
| dependency-cruiser | each `not-to-unresolvable` | `coupling` | service owning `from` | 10 |
| dependency-cruiser | each `no-dep-on-test` | `coupling` | service owning `from` | 10 |
| dependency-cruiser | efferent coupling growth vs the prior run | `coupling` | that service | `max(0, currentCe - priorCe) * 10` |
| jscpd | internal clone count (first run) or growth vs prior | `duplication` | that service | 8 per extra clone |
| jscpd | cross-service clone count (first run) or growth vs prior | `cross-service-integrity` | platform | 10 per extra clone |
| jscpd | shared clone count (first run) or growth vs prior | `cross-service-integrity` | platform | 8 per extra clone |

Duplication is not scored as a percentage. Config files are outside jscpd's TypeScript format filter and do not produce clones.

## Harmful direction

A metric-based penalty fires only when the number moves the wrong way.

| Signal | Harmful direction | First observation (no prior) |
| --- | --- | --- |
| Efferent coupling (`Ce`) | Increase vs the previous run | No growth penalty (neutral) |
| Internal / cross-service / shared clones | Increase vs the previous run's count | Score the current count (baseline) |
| Cycles, orphans, unresolvable, dep-on-test | Presence (a fault, not a bidirectional metric) | Same: each instance is a penalty |

`Ce` is the count of unique resolved dependencies whose path is not under `services/<name>/`. `Ca` is the count of unique modules outside the service that depend on a module inside it. Both are stored on `dependencyCruiser.serviceMetrics`. Only `Ce` growth is scored. `Ca` is observation. A service that other code reached into (`Ca` up, `Ce` unchanged) is not penalised.

Folder instability `I` (`Ce / (Ca + Ce)` per folder) stays on `folderMetrics` for the agent. It is not scored. Expected shapes, which the reasoner reads as facts rather than as scores:

- `transport` should be highly unstable. Depends on domain; nothing should depend on it. Low `I` means something depends on transport. A transport folder at 0.78 is healthy.
- `domain` should be stable. Things depend on it; it depends on little. Rising `I` is drift.
- `infrastructure` should be unstable. Implements ports; depended upon only through them.

Missing `serviceMetrics` or no prior for that service apply no efferent growth penalty, so a fixture with no graph still scores 100 on coupling.

Intra-file clones (both locations the same path) are not scored.

## Clone classification

| Class | Meaning | Scored on |
| --- | --- | --- |
| `internal` | every location is inside one service | that service's `duplication` |
| `cross-service` | locations span two or more services | platform `cross-service-integrity` |
| `shared` | locations span a service and code outside `services/` | platform `cross-service-integrity` |

## Roll-up (platform)

The platform's four original characteristics are composed from the per-service scores.

| Characteristic | Roll-up |
| --- | --- |
| `boundary-integrity` | worst-of (minimum) across services |
| `layering` | mean, rounded |
| `coupling` | mean, rounded |
| `duplication` | mean, rounded |
| `cross-service-integrity` | scored on the platform; not a roll-up |

Worst-of for boundary integrity: one service in ruins and one perfect must not average to tolerable.

If the payload lists no services, rolled-up characteristics are 100.

## Overall

### Service overall

Weighted mean of that service's four characteristics.

| Characteristic | Weight |
| --- | --- |
| `boundary-integrity` | 0.4 |
| `layering` | 0.3 |
| `coupling` | 0.2 |
| `duplication` | 0.1 |

### Platform overall

Weighted mean of the five platform characteristics.

| Characteristic | Weight |
| --- | --- |
| `boundary-integrity` | 0.30 |
| `layering` | 0.20 |
| `coupling` | 0.15 |
| `duplication` | 0.10 |
| `cross-service-integrity` | 0.25 |

A rule-3 finding therefore appears twice in the platform overall: once through worst-of `boundary-integrity`, and once through `cross-service-integrity`. That is intentional. The breach is both a service failure and a relationship failure.

## New services and the denominator

A new service with almost no code will score near 100 on everything and pull the platform mean up while nothing in the existing services has improved. That is a real property of any aggregate that includes a new, empty member. It is accepted. It is not a bug in the weights.

## Rule set versions

Every payload and persisted run records `ruleSetVersion`. Scores from different versions are not comparable. The dashboard marks the trend where the version changes.

### Version 1

Five rules. Rule 1 was transport must not depend on the `infrastructure` folder. Rule 2 was a filename list (`deliver`, `mark-paid`, `render-confirmation`). No positive fixtures. No guard that could fail.

### Version 2

- Rule 1 still forbids transport depending on the `infrastructure` folder, and also forbids transport importing infrastructure provider or storage clients (`email-provider`, `firestore-`, `gcs-`). Domain ports with those names stay allowed.
- Rule 2 no longer uses a filename list. Infrastructure must not depend on domain use cases. Ports named for their role (`store`, `provider`, `publisher`, `lookup`, `logger`, `stats`, `mailer`, `order.ts`, `send-instruction`) stay allowed. A new use case such as `cancel-order.ts` fails without a rule change.
- Rule 5's negative lookahead excludes `[Ss]tore` and `email-provider`, so a checkout import of the notification provider is rule 3 only, and a store read is rule 4 only.
- Rule 6: domain must not depend on transport. Layering, 20.
- Rule 7: transport in one service must not depend on transport in another. Boundary 25 and platform CSI 25.
- Rule 8: domain must not depend on infrastructure. Layering, 20.
- Rule 9: infrastructure must not depend on transport. Layering, 20.
- Every rule has a fixture that passes and a fixture that fails. A guard suite asserts every rule passes on the real services. The collector runs the same `checkArchitecture` and never fails.

### Version 3

Rule 2 no longer uses a name allow-list. Ports live in `domain/ports/`. Infrastructure may depend on that folder and on nothing else under `domain`. A port named `email-gateway.ts` is allowed because it sits in `ports/`, not because the name was anticipated. Use cases stay as files directly under `domain/`, so `cancel-order.ts` still fails with no rule change.

Rule 8 is unchanged: `domain` (including `domain/ports`) must not depend on `infrastructure`. That is the same constraint from the other side. Rule 2 cannot be a plain `inFolder("domain")` check, because ports remain under `domain/` by design.

### Version 4

Instability is no longer scored. Folder `I` remains an observation for the reasoner, read against the layer profiles above rather than against zero.

Coupling now penalises efferent coupling growth only: `max(0, currentCe - priorCe) * 10`. No prior means no growth penalty. Afferent coupling is never a penalty.

Duplication penalties are increase-only once a prior clone count exists. The first observation still scores the current count as the baseline.

The reasoner receives those layer profiles and the active rule ids. It must not recommend reducing transport instability, and must not recommend adding a rule that is already in force.
