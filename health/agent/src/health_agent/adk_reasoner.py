from __future__ import annotations

import asyncio
import json
import os

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from health_agent.adk_agent import INSTRUCTION, build_root_agent
from health_agent.models import AnalysisPayload, Narrative, ScoreResult
from health_agent.reasoner import Reasoner
from health_agent.reasoner_facts import build_facts


class AdkReasoner(Reasoner):
    """Uses the ADK agent for prose. Scores still come from health/scoring."""

    def reason(
        self,
        payload: AnalysisPayload,
        scores: ScoreResult,
        prior_reads: list | None = None,
        memory_snippets: list[str] | None = None,
    ) -> list[Narrative]:
        facts = build_facts(payload, scores, prior_reads, memory_snippets)
        prompt = (
            f"{INSTRUCTION}\n\n"
            "These scores are facts. Copy each id in narrativeIds. Do not change a score.\n"
            "Platform characteristics use the id as given. Service characteristics "
            "use service:id (example checkout:coupling).\n"
            "Return JSON: {\"narratives\": [{\"id\": \"\", \"reasoning\": \"\", \"recommendations\": []}]}\n"
            "Empty recommendations when score is 100.\n\n"
            f"{json.dumps(facts)}"
        )
        session_service = InMemorySessionService()
        runner = Runner(
            agent=build_root_agent(),
            app_name="architecture_health",
            session_service=session_service,
        )
        session = asyncio.run(
            session_service.create_session(
                app_name="architecture_health",
                user_id="local",
            )
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
        required: list[str] = [item.id for item in scores.characteristics]
        required.extend(
            f"{service.service}:{item.id}"
            for service in scores.services
            for item in service.characteristics
        )
        for key in required:
            found = by_id.get(key)
            if found is None:
                raise RuntimeError(f"ADK omitted narrative for {key}")
            ordered.append(found.model_copy(update={"id": key}))
        return ordered


def _extract_json(text: str) -> str:
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end < 0:
        raise RuntimeError("ADK did not return JSON")
    return text[start : end + 1]


def use_adk() -> bool:
    return os.environ.get("HEALTH_REASONER", "stub") == "adk"
