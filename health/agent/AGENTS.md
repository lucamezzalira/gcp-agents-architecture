# Health agent

Python 3.12, Google ADK, deployed to Agent Runtime.

Consumes an `AnalysisPayload`, loads active accepted decisions for the paths in scope, and produces a `HealthRead`.

## The one rule that matters

**The agent does not compute or modify scores.** Scores come from `health/scoring` and are deterministic. The agent writes the reasoning and recommendations around them.

If a number in the output differs from what the scoring model produced, that is a bug.

## What the agent contributes

- Reasoning: what the signals mean together, in plain language, naming which signals drove a score.
- Judgment where the tools are silent, including distinguishing a genuine violation from an accepted trade-off. Duplication between services is deliberate, not a defect.
- Concrete recommendations wherever a characteristic scores below 100.

## Constraints

- NEVER run analysis tools. The agent consumes CI output; it does not invoke ts-arch, dependency-cruiser or jscpd.
- Deterministic findings are authoritative. A failed architecture test is a fact and the agent does not argue with it.
- The runtime call graph is observed from synthetic smoke traffic. Name a runtime-only edge with its protocol when it appears. queried false is not an empty graph. p95-latency and error-rate arrive with `illustrative: true`; treat those as demonstrative of the pattern and say so in reasoning.
- Memory Bank stores structured score records (sha, scores, findings fired and cleared), never reasoner prose. Retrieve across every service in the payload. Use a retrieved record only when it is relevant to this commit. Silence about memory is correct. Any claim about a past commit must name the commit and come from a retrieved record. The store can be emptied: `python -m health_agent.vertex_memory purge`. A false record stays until someone forgets it.
- Every run must be traceable end to end. A persisted read always carries a trace id, including local persist. Do not swallow errors.
