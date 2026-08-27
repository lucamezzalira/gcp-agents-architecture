from __future__ import annotations

from health_agent.models import AnalysisPayload


def all_rules_passed(payload: AnalysisPayload) -> bool:
    return all(item.passed for item in payload.archTests)
