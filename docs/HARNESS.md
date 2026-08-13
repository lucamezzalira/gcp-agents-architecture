# The harness

How the AI context in this repository is organised, and why it is shaped this way.

## Files

| File | Purpose |
| --- | --- |
| `AGENTS.md` (root) | Layout, stack, commands, architecture rules, hard prohibitions. Read by Cursor and by any other agent that honours the open standard. |
| `services/*/AGENTS.md`, `health/*/AGENTS.md` | Scoped context, loaded when working in that subtree. Nearest file wins. |
| `.cursor/rules/*.mdc` | Cursor-specific rules with frontmatter-driven activation. |
| `.cursor/mcp.json` | Project MCP: `architecture-health` over Streamable HTTP to Cloud Run. |
| `docs/PRD.md` | What is being built. |
| `docs/BUILD-SPEC.md` | Where things live, the contracts, the schema, the acceptance criteria, the build order. |
| `docs/SCORING.md` | The published weights. |

## Why both AGENTS.md and .cursor/rules

`.cursorrules` is deprecated and is not loaded in Agent mode, so it is not used here.

`.cursor/rules/*.mdc` gives glob-scoped activation, so a rule about Terraform costs nothing while working in TypeScript. `AGENTS.md` is the open standard read by Cursor and other agents, and its nested form gives directory-level scoping for free. Both are maintained because they do different jobs: the rules give precise activation, the nested files give portability.

## Activation model

| Rule | Activation |
| --- | --- |
| `000-core` | Always. Kept short, because it loads on every request. |
| `100-typescript` | On `**/*.ts` |
| `110-service-layering` | On `services/**/*.ts` |
| `120-scoring` | On `health/scoring/**/*.ts` |
| `130-python-agent` | On `health/agent/**/*.py` |
| `140-terraform` | On `infra/**/*.tf` |
| `200-writing-heuristics` | Requested by description, when a judgment call is needed |

## Conventions used

Direct imperatives, not observations. "NEVER import the email provider outside `services/notification`" rather than "we generally keep provider access in one place." Emphasis markers on the constraints that matter most.

Always-apply content stays short. Everything scoped loads only where it applies.

Each file states prohibitions explicitly, because an agent under time pressure takes the shortest path that compiles, and the shortest path is frequently the one that crosses a boundary.

## The recursion worth noticing

This directory is itself the subject of the exercise. The constraints that stop an agent drifting live in the repository, next to the tests that verify they were followed. Guidance in front, verification behind. The same argument the health system makes about MCP, applied one layer down to the agents writing the code.
