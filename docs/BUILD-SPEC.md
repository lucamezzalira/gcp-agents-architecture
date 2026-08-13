# Build spec

Companion to `PRD.md`. That document says what and why. This one says where, in what shape, and how you know it works.

## Stack decisions

| Concern | Decision |
| --- | --- |
| Monorepo tooling | pnpm workspaces + Turborepo |
| Services | TypeScript, Node 24, Fastify |
| Request and payload schemas | Zod |
| Health agent | Python 3.12, Google ADK |
| MCP server | TypeScript, official MCP SDK |
| Dashboard | Astro |
| Service state | Firestore, one named database per service |
| Health history and decisions | Postgres (Cloud SQL), health project only |
| Object storage | Cloud Storage. Checkout writes confirmation objects. Notification fetches by `bodyRef`. |
| IaC | Terraform |
| Tests | Vitest (TS), pytest (Python) |
| Architecture tests | ts-arch |
| Static analysis | dependency-cruiser |
| Duplication | jscpd |

Checkout and notification do not share a database. Project B has two Firestore databases (`checkout`, `notification`). If one is unavailable, the other service's state stays up. Notification may `GetObject` by `bodyRef`. It must never query checkout's Firestore. Health history stays in its own Postgres in project A.

## Directory tree

```
.
├── AGENTS.md
├── .cursor/rules/
├── package.json                  # pnpm workspace root
├── pnpm-workspace.yaml
├── turbo.json
├── docs/
│   ├── PRD.md
│   ├── BUILD-SPEC.md
│   └── SCORING.md                # weights, published
├── services/
│   ├── notification/
│   │   ├── AGENTS.md
│   │   ├── src/
│   │   │   ├── transport/        # pubsub subscriber, http
│   │   │   ├── domain/           # idempotency decision, ports
│   │   │   └── infrastructure/   # firestore, storage, provider
│   │   └── test/
│   └── checkout/
│       ├── AGENTS.md
│       ├── src/
│       │   ├── transport/
│       │   ├── domain/           # order state, notify decision, rendering
│       │   └── infrastructure/
│       └── test/
├── health/
│   ├── agent/                    # Python, ADK
│   │   ├── AGENTS.md
│   │   ├── src/
│   │   └── tests/
│   ├── scoring/                  # TypeScript, pure, no I/O
│   │   ├── src/
│   │   ├── fixtures/             # sample tool output
│   │   └── test/
│   ├── mcp-server/
│   └── dashboard/
├── analysis/
│   ├── .dependency-cruiser.js
│   ├── .jscpd.json
│   └── arch-tests/               # ts-arch specs
├── infra/
│   ├── health/                   # Terraform, project A
│   └── services/                 # Terraform, project B
└── .github/workflows/
```

The layer directories are load-bearing. ts-arch rules are expressed against `transport/`, `domain/` and `infrastructure/`, so these names do not change without changing the rules.

## Contracts

### Send instruction (published to notification)

```ts
type SendInstruction = {
  messageId: string;      // unique, idempotency key
  to: string;             // recipient address
  subject: string;
  bodyRef: string;        // Cloud Storage object key, pre-rendered HTML
};
```

### Analysis payload (CI → health topic)

The most important contract in the system. It is the interface between the deterministic tools and the agent.

```ts
type AnalysisPayload = {
  runId: string;
  commitSha: string;
  commitMessage: string;
  timestamp: string;               // ISO 8601
  archTests: {
    ruleId: string;                // matches SCORING.md
    passed: boolean;
    violations: Array<{ file: string; detail: string }>;
  }[];
  dependencyCruiser: {
    cycles: Array<{ path: string[] }>;
    orphans: string[];
    violations: Array<{ rule: string; from: string; to: string }>;
    metrics: { modules: number; dependencies: number };
  };
  duplication: {
    clones: Array<{ files: string[]; lines: number; tokens: number }>;
    percentage: number;
  };
  runtime: {                       // ILLUSTRATIVE
    illustrative: true;
    signals: Array<{ name: string; value: number; unit: string }>;
  };
};
```

`runtime.illustrative` is always `true` in this build. Runtime signals do not move a score and are omitted from the dashboard.

### Health read (agent output)

```ts
type HealthRead = {
  runId: string;
  commitSha: string;
  overall: number;                 // 0-100
  characteristics: Array<{
    id: string;
    score: number;                 // 0-100, deterministic
    reasoning: string;             // agent-authored
    recommendations: string[];     // agent-authored, empty when score is 100
    signalsUsed: string[];
    suppressedBy?: string[];       // decision ids
  }>;
};
```

## Postgres schema

```sql
create table health_run (
  run_id        text primary key,
  commit_sha    text not null,
  commit_message text,
  created_at    timestamptz not null default now(),
  overall_score int not null
);

create table health_characteristic (
  run_id          text references health_run(run_id),
  characteristic  text not null,
  score           int not null,
  reasoning       text,
  recommendations jsonb,
  signals_used    jsonb,
  primary key (run_id, characteristic)
);

create table accepted_decision (
  id          text primary key,
  rule_id     text not null,
  path_glob   text not null,
  decision    text not null,
  rationale   text not null,
  decided_by  text not null,
  decided_at  timestamptz not null default now(),
  active      boolean not null default true
);
```

## Scoring model

Lives in `health/scoring`, pure TypeScript, no I/O, fully unit tested against fixtures. Weights published in `docs/SCORING.md`.

Shape: each characteristic starts at 100. Each deterministic finding applies a stated penalty. An active `accepted_decision` matching the rule and path suppresses that penalty and is recorded in `suppressedBy`.

The agent receives the computed scores and writes reasoning and recommendations around them. It never modifies a number.

## Acceptance criteria

**Scoring model**
- Given a fixture payload with zero findings, every characteristic scores 100.
- Given a fixture with a rule-3 violation, the boundary characteristic scores below 100 and the violation appears in `signalsUsed`.
- Given the same fixture twice, the output is byte-identical.
- Given an active decision matching a violation, the penalty is suppressed and the decision id appears in `suppressedBy`.

**Notification service**
- Publishing a valid instruction results in exactly one provider call.
- Publishing the same `messageId` twice results in exactly one provider call.
- A missing `bodyRef` object fails without calling the provider.

**Checkout service**
- Marking an order paid renders HTML, stores it, and publishes a `SendInstruction` with a `bodyRef` pointing at it.
- Checkout never imports the provider client. Enforced by ts-arch rule 3.

**Architecture tests**
- Each of the five rules has at least one passing case and one deliberately failing fixture.

**Pipeline**
- A push produces an `AnalysisPayload` on the health topic within 90 seconds.
- The agent produces a `HealthRead` persisted to Postgres.
- Replay across N commits produces N rows in `health_run`.

**MCP server**
- `get_health` for a path returns the latest score, reasoning and recommendations. An optional `commitSha` loads that run instead.
- `list_health_runs` returns overall and characteristic scores for every persisted run, oldest first.
- `get_prior_decisions` returns only active decisions matching the path.

**Dashboard**
- Shows overall and per-characteristic scores for the latest run.
- Shows the trend across all runs.
- Runtime signals stay in the payload with `illustrative: true`. They do not appear on the dashboard and they do not move a score.

## Build order

Strictly sequential. Each step is demonstrable before the next begins.

1. **Workspace skeleton.** pnpm workspaces, turbo, tsconfig, directory tree. No logic.
2. **Scoring model against fixtures.** No cloud, no agent, no Pub/Sub. Hand-write fixture payloads. This de-risks the whole exercise because the argument rests on the score being defensible.
3. **Notification service, local.** Fastify, in-memory adapters, full test suite.
4. **Checkout service, local.** Same.
5. **Analysis tooling.** ts-arch rules, dependency-cruiser config, jscpd config. Verify each rule fails on a deliberate fixture.
6. **Commit history.** The sequence of improvements and regressions, including the provider-bypass regression.
7. **Health agent, local.** ADK agent consuming an `AnalysisPayload` file, calling the scoring model, writing a `HealthRead`.
8. **Postgres and persistence.** Schema, migrations, replay across the commit history.
9. **Dashboard.** Reads Postgres, renders scores and trend.
10. **MCP server.**
11. **Terraform and deployment.** Both projects, CI wiring, cross-project IAM.

Steps 1 to 9 run entirely locally. Cloud deployment is last because it is the highest-risk, lowest-narrative-value part of the build. If time runs short, a locally demonstrated system with a real commit history is worth more than a half-deployed one.

## Conventions

- No `any`. Use `unknown` and narrow.
- Parse unknown input with Zod at the boundary. Do not hand-roll object checks.
- Ports and adapters: domain defines interfaces, infrastructure implements them.
- No barrel files that re-export across layers; they defeat the architecture tests.
- Tests colocated as `*.test.ts` next to the unit under test.
- One responsibility per file.
- Every service runs against local adapters with no cloud credentials.
