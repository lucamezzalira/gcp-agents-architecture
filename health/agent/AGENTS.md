# Health agent

Python 3.12, Google ADK, deployed to Agent Runtime.

The Cloud Run receiver consumes an `AnalysisPayload`, loads active accepted decisions, computes scores with `health/scoring`, and persists the run. It then invokes this agent with those scores attached. The agent writes reasoning and recommendations, and reads and writes Memory Bank.

## The boundary

**The agent does not compute or modify scores.** That is a property of the image, not an instruction the model is asked to obey. `health/scoring` is not in this image, so it cannot be called. Scores come from the Cloud Run receiver. If a number appears in the agent response, the receiver logs it and ignores it. Postgres is the system's record and the receiver owns it. Memory Bank is this agent's own memory. Nothing writes to both.

## What the agent contributes

- Reasoning: what the signals mean together, in plain language, naming which signals drove a score.
- Judgment where the tools are silent, including distinguishing a genuine violation from an accepted trade-off. Duplication between services is deliberate, not a defect.
- Concrete recommendations wherever a characteristic scores below 100.

## Constraints

- NEVER run analysis tools. The agent consumes CI output; it does not invoke ts-arch, dependency-cruiser or jscpd.
- NEVER import or call `health/scoring`. The receiver already scored the payload.
- NEVER write Postgres. The receiver owns the system's record.
- Deterministic findings are authoritative. A failed architecture test is a fact and the agent does not argue with it.
- The runtime call graph is observed from synthetic smoke traffic. Name a runtime-only edge with its protocol when it appears. Pub/Sub without a matching import is designed eventing, not a hidden dependency. queried false is not an empty graph. p95-latency and error-rate arrive with `illustrative: true`; treat those as demonstrative of the pattern and say so in reasoning.
- Memory Bank stores structured score records (sha, scores, findings fired and cleared), never reasoner prose. Retrieve across every service in the payload. Use a retrieved record only when it is relevant to this commit. Silence about memory is correct. Any claim about a past commit must name the commit and come from a retrieved record. The store can be emptied: `python -m health_agent.vertex_memory purge`. A false record stays until someone forgets it.
- Every run must be traceable end to end. A persisted read always carries a trace id, host, reasoner, and rule set version. Do not swallow errors.
