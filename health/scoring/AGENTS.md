# Scoring model

Deterministic. Pure TypeScript. No I/O, no network, no clock, no randomness.

Given an `AnalysisPayload` and the set of active accepted decisions, produces a score from 0 to 100 per architecture characteristic plus a weighted overall.

## Rules

- The same input MUST always produce byte-identical output. Anything non-deterministic is a bug.
- Each characteristic starts at 100. Each deterministic finding applies a stated penalty from `docs/SCORING.md`. Services are scored independently. The platform adds `cross-service-integrity` and rolls the other four up as means. `cross-service-integrity` is the sole platform-level boundary channel.
- An active decision matching the rule and path suppresses its penalty, and the decision id is recorded in `suppressedBy`. Suppression is always visible in the output, never silent.
- NEVER call a model from here. NEVER import the agent.
- Weights live in `docs/SCORING.md` and the implementation must match that document exactly. If you change a weight, change the document in the same commit.

## Testing

Fixtures in `fixtures/` are hand-written `AnalysisPayload` samples. Every scoring change needs a fixture demonstrating it. Build and test this package fully before anything touches a cloud.
