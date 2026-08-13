from __future__ import annotations

import json
import os

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from health_agent.adk_agent import INSTRUCTION, root_agent
from health_agent.models import AnalysisPayload, Narrative, ScoreResult
from health_agent.reasoner import Reasoner


class AdkReasoner(Reasoner):
    """Uses the ADK agent for prose. Scores still come from health/scoring."""

    def reason(
        self,
        payload: AnalysisPayload,
        scores: ScoreResult,
        prior_reads: list | None = None,
    ) -> list[Narrative]:
        facts = {
            "overall": scores.overall,
            "characteristics": [
                {
                    "id": item.id,
                    "score": item.score,
                    "signalsUsed": item.signalsUsed,
                    "suppressedBy": item.suppressedBy,
                }
                for item in scores.characteristics
            ],
            "failedRules": [
                {
                    "ruleId": item.ruleId,
                    "files": [violation.file for violation in item.violations],
                    "details": [violation.detail for violation in item.violations],
                }
                for item in payload.archTests
                if not item.passed
            ],
            "commitMessage": payload.commitMessage,
            "recentCommits": [item.message for item in payload.recentCommits],
            "duplication": {
                "percentage": payload.duplication.percentage,
                "clones": [item.files for item in payload.duplication.clones],
            },
            "couplingMetrics": {
                "modules": payload.dependencyCruiser.metrics.modules,
                "dependencies": payload.dependencyCruiser.metrics.dependencies,
            },
            "priorOverall": [item.overall for item in (prior_reads or [])][-6:],
            "runtimeIllustrative": payload.runtime.illustrative,
        }
        prompt = (
            f"{INSTRUCTION}\n\n"
            "These scores are facts. Copy each id. Do not change a score.\n"
            "Return JSON: {\"narratives\": [{\"id\": \"\", \"reasoning\": \"\", \"recommendations\": []}]}\n"
            "Empty recommendations when score is 100. Reasoning may still "
            "describe drift when rules pass.\n\n"
            f"{json.dumps(facts)}"
        )
        session_service = InMemorySessionService()
        runner = Runner(
            agent=root_agent,
            app_name="architecture_health",
            session_service=session_service,
        )
        session = session_service.create_session(
            app_name="architecture_health",
            user_id="local",
        )
        text = ""
        for event in runner.run(
            user_id="local",
            session_id=session.id,
            new_message=types.Content(role="user", parts=[types.Part(text=prompt)]),
        ):
            if event.content and event.content.parts:
                for part in event.content.parts:
                    if part.text:
                        text += part.text
        parsed = json.loads(_extract_json(text))
        narratives = [Narrative.model_validate(item) for item in parsed["narratives"]]
        by_id = {item.id: item for item in narratives}
        ordered: list[Narrative] = []
        for scored in scores.characteristics:
            found = by_id.get(scored.id)
            if found is None:
                raise RuntimeError(f"ADK omitted narrative for {scored.id}")
            ordered.append(found)
        return ordered


def _extract_json(text: str) -> str:
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end < 0:
        raise RuntimeError("ADK did not return JSON")
    return text[start : end + 1]


def use_adk() -> bool:
    return os.environ.get("HEALTH_REASONER", "stub") == "adk"
