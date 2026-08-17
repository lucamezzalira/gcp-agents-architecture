from __future__ import annotations

import json
import sys
from typing import Any

from health_agent.models import HealthRead, Narrative, ScoreResult

_SCORE_KEYS = frozenset({"overall", "score", "scores"})


def empty_narratives(scores: ScoreResult) -> list[Narrative]:
    items = [
        Narrative(id=item.id, reasoning="", recommendations=[])
        for item in scores.characteristics
    ]
    items.extend(
        Narrative(id=f"{service.service}:{item.id}", reasoning="", recommendations=[])
        for service in scores.services
        for item in service.characteristics
    )
    return items


def required_narrative_ids(scores: ScoreResult) -> list[str]:
    ids = [item.id for item in scores.characteristics]
    ids.extend(
        f"{service.service}:{item.id}"
        for service in scores.services
        for item in service.characteristics
    )
    return ids


def numeric_fields(value: object, prefix: str = "") -> list[str]:
    found: list[str] = []
    if isinstance(value, dict):
        for key, item in value.items():
            path = f"{prefix}.{key}" if prefix else str(key)
            if key in _SCORE_KEYS:
                found.append(path)
            elif isinstance(item, (int, float)) and not isinstance(item, bool):
                found.append(path)
            else:
                found.extend(numeric_fields(item, path))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            found.extend(numeric_fields(item, f"{prefix}[{index}]"))
    elif isinstance(value, (int, float)) and not isinstance(value, bool):
        found.append(prefix or "<root>")
    return found


def narratives_from_agent(output: dict[str, Any], scores: ScoreResult) -> list[Narrative]:
    flagged = numeric_fields(output)
    if flagged:
        print(
            "agent_returned_numeric=" + json.dumps(flagged),
            file=sys.stderr,
            flush=True,
        )
    raw = output.get("narratives")
    parsed: list[Narrative]
    if isinstance(raw, list):
        parsed = [_narrative_from_unknown(item) for item in raw]
    else:
        parsed = _narratives_from_read_shape(output)
    by_id = {item.id: item for item in parsed}
    ordered: list[Narrative] = []
    for key in required_narrative_ids(scores):
        found = by_id.get(key)
        if found is None:
            raise RuntimeError(f"agent omitted narrative for {key}")
        ordered.append(found.model_copy(update={"id": key}))
    return ordered


def _narrative_from_unknown(item: object) -> Narrative:
    if not isinstance(item, dict):
        raise RuntimeError("agent narrative is not an object")
    reasoning = item.get("reasoning")
    recommendations = item.get("recommendations")
    ident = item.get("id")
    if not isinstance(ident, str) or not ident:
        raise RuntimeError("agent narrative is missing id")
    if not isinstance(reasoning, str):
        raise RuntimeError(f"agent narrative {ident} is missing reasoning")
    if recommendations is None:
        recs: list[str] = []
    elif isinstance(recommendations, list) and all(
        isinstance(entry, str) for entry in recommendations
    ):
        recs = list(recommendations)
    else:
        raise RuntimeError(f"agent narrative {ident} has invalid recommendations")
    return Narrative(id=ident, reasoning=reasoning, recommendations=recs)


def _narratives_from_read_shape(output: dict[str, Any]) -> list[Narrative]:
    items: list[Narrative] = []
    characteristics = output.get("characteristics")
    if isinstance(characteristics, list):
        for item in characteristics:
            if not isinstance(item, dict):
                continue
            ident = item.get("id")
            if not isinstance(ident, str):
                continue
            items.append(_narrative_from_unknown({**item, "id": ident}))
    services = output.get("services")
    if isinstance(services, list):
        for service in services:
            if not isinstance(service, dict):
                continue
            name = service.get("service")
            chars = service.get("characteristics")
            if not isinstance(name, str) or not isinstance(chars, list):
                continue
            for item in chars:
                if not isinstance(item, dict):
                    continue
                ident = item.get("id")
                if not isinstance(ident, str):
                    continue
                items.append(
                    _narrative_from_unknown({**item, "id": f"{name}:{ident}"})
                )
    if not items:
        raise RuntimeError("agent output has no narratives")
    return items


def scores_from_dict(raw: object) -> ScoreResult:
    if not isinstance(raw, dict):
        raise ValueError("scores are required; this host does not compute them")
    return ScoreResult.model_validate(raw)


def priors_from_dicts(raw: object) -> list[HealthRead]:
    if not isinstance(raw, list):
        return []
    reads: list[HealthRead] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        reads.append(HealthRead.model_validate(item))
    return reads
