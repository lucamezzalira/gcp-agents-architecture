from __future__ import annotations

import asyncio
import os
from collections.abc import Coroutine
from typing import TypeVar

from health_agent.memory import MemoryBank, NoopMemoryBank

T = TypeVar("T")


def _run(coro: Coroutine[object, object, T]) -> T:
    return asyncio.run(coro)


class VertexMemoryBank:
    """Vertex AI Memory Bank via ADK. Separate from accepted_decision in Postgres."""

    def __init__(self) -> None:
        from google.adk.memory import VertexAiMemoryBankService

        project = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
        location = os.environ.get(
            "MEMORY_BANK_LOCATION",
            os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1"),
        )
        engine_id = os.environ.get("AGENT_ENGINE_ID", "")
        if not project or not engine_id:
            raise RuntimeError(
                "Vertex Memory Bank needs GOOGLE_CLOUD_PROJECT and AGENT_ENGINE_ID"
            )
        self._svc = VertexAiMemoryBankService(
            project=project,
            location=location,
            agent_engine_id=engine_id,
        )
        self._app = "architecture_health"
        self._user = "health-agent"

    def retrieve(self, query: str) -> list[str]:
        result = _run(
            self._svc.search_memory(
                app_name=self._app,
                user_id=self._user,
                query=query,
            )
        )
        memories = getattr(result, "memories", None) or []
        texts: list[str] = []
        for item in memories:
            text = _memory_text(item)
            if text:
                texts.append(text)
        return texts

    def write(
        self,
        observation: str,
        metadata: dict[str, str] | None = None,
    ) -> None:
        add_memory = getattr(self._svc, "add_memory", None)
        if callable(add_memory):
            _run(_write_direct(add_memory, self._app, self._user, observation))
            return
        from google.adk.events import Event
        from google.adk.sessions import Session
        from google.genai import types

        session = Session(
            id=(metadata or {}).get("runId", "run"),
            appName=self._app,
            userId=self._user,
            events=[
                Event(
                    author="health-agent",
                    content=types.Content(
                        role="user",
                        parts=[types.Part(text=observation)],
                    ),
                )
            ],
        )
        _run(self._svc.add_session_to_memory(session))


async def _write_direct(
    add_memory: object,
    app_name: str,
    user_id: str,
    observation: str,
) -> None:
    from google.adk.memory.memory_entry import MemoryEntry
    from google.genai import types

    entry = MemoryEntry(
        content=types.Content(
            role="user",
            parts=[types.Part(text=observation)],
        )
    )
    try:
        await add_memory(  # type: ignore[misc]
            app_name=app_name,
            user_id=user_id,
            memories=[entry],
        )
    except TypeError:
        await add_memory(  # type: ignore[misc]
            app_name=app_name,
            user_id=user_id,
            memories=[observation],
        )


def _memory_text(item: object) -> str:
    content = getattr(item, "content", None)
    parts = getattr(content, "parts", None) if content is not None else None
    if parts:
        texts = [
            part.text
            for part in parts
            if getattr(part, "text", None)
        ]
        if texts:
            return " ".join(texts)
    text = getattr(item, "text", None)
    if isinstance(text, str) and text:
        return text
    inner = getattr(content, "text", None) if content is not None else None
    if isinstance(inner, str) and inner:
        return inner
    if isinstance(item, dict):
        memory = item.get("memory")
        if isinstance(memory, dict):
            fact = memory.get("fact")
            if isinstance(fact, str) and fact:
                return fact
        value = item.get("text") or item.get("content")
        if isinstance(value, str):
            return value
    return ""


def choose_memory_bank() -> MemoryBank:
    if os.environ.get("AGENT_ENGINE_ID"):
        return VertexMemoryBank()
    if os.environ.get("K_SERVICE"):
        raise RuntimeError("AGENT_ENGINE_ID is required on Cloud Run")
    return NoopMemoryBank()
