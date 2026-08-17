from __future__ import annotations

import asyncio
import os
from collections.abc import Coroutine
from typing import TypeVar

from health_agent.host import hosted_in_cloud
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
        del metadata
        body = memory_create_request(observation, self._app, self._user)
        fact = body["fact"]
        raw_scope = body["scope"]
        if not isinstance(fact, str) or not isinstance(raw_scope, dict):
            raise RuntimeError("Memory Bank create request is malformed")
        scope = {
            key: value
            for key, value in raw_scope.items()
            if isinstance(key, str) and isinstance(value, str)
        }
        client, engine = self._vertex_client()
        client.agent_engines.memories.create(
            name=engine,
            fact=fact,
            scope=scope,
            config={"wait_for_completion": True},
        )
        print(
            "memory_write_kind=create "
            f"fact_lines={observation.count(chr(10)) + 1}",
            flush=True,
        )

    def list_facts(self) -> list[str]:
        return [fact for _, fact in self._list_memories()]

    def purge(self) -> int:
        client, engine = self._vertex_client()
        names = [name for name, _ in self._list_memories()]
        if names:
            operation = client.agent_engines.memories.purge(
                name=engine,
                filter='scope.user_id="health-agent"',
                force=True,
                config={"wait_for_completion": True},
            )
            response = getattr(operation, "response", None)
            purged = getattr(response, "purge_count", None)
            print(
                f"memory_purge_kind=filter count={purged if purged is not None else len(names)}",
                flush=True,
            )
        remaining = [name for name, _ in self._list_memories()]
        for name in remaining:
            client.agent_engines.memories.delete(
                name=name,
                config={"wait_for_completion": True},
            )
        if remaining:
            print(f"memory_purge_kind=delete count={len(remaining)}", flush=True)
        left = self._list_memories()
        if left:
            raise RuntimeError(
                f"Memory Bank purge left {len(left)} entries"
            )
        return len(names)

    def _engine_name(self) -> str:
        project = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
        location = os.environ.get(
            "MEMORY_BANK_LOCATION",
            os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1"),
        )
        engine_id = os.environ.get("AGENT_ENGINE_ID", "")
        return (
            f"projects/{project}/locations/{location}/reasoningEngines/{engine_id}"
        )

    def _vertex_client(self) -> tuple[object, str]:
        from vertexai import Client

        project = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
        location = os.environ.get(
            "MEMORY_BANK_LOCATION",
            os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1"),
        )
        return Client(project=project, location=location), self._engine_name()

    def _list_memories(self) -> list[tuple[str, str]]:
        client, engine = self._vertex_client()
        found: list[tuple[str, str]] = []
        for item in client.agent_engines.memories.list(name=engine):
            name = getattr(item, "name", None)
            fact = getattr(item, "fact", None)
            if isinstance(name, str) and name:
                found.append((name, fact if isinstance(fact, str) else ""))
        return found


def memory_create_request(
    observation: str,
    app_name: str,
    user_id: str,
) -> dict[str, object]:
    """Exact fact, not LLM extraction. GenerateMemories would rewrite this as prose."""
    return {
        "fact": observation,
        "scope": {
            "app_name": app_name,
            "user_id": user_id,
        },
    }


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
    if hosted_in_cloud():
        raise RuntimeError("AGENT_ENGINE_ID is required in cloud")
    return NoopMemoryBank()


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["list", "purge"])
    args = parser.parse_args()
    bank = VertexMemoryBank()
    if args.command == "list":
        facts = bank.list_facts()
        print(f"memory_count={len(facts)}")
        for fact in facts:
            first = fact.splitlines()[0] if fact else ""
            print(first)
        return
    removed = bank.purge()
    print(f"purged={removed} remaining={len(bank.list_facts())}")


if __name__ == "__main__":
    main()
