from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

from health_agent.settings import (
    AIPLATFORM_GET_TIMEOUT_S,
    DEFAULT_ADK_MODEL,
    DEFAULT_MEMORY_BANK_LOCATION,
    DEFAULT_RUNTIME_LOCATION,
)

_IDENTITY_CACHE: str | None = None


def hosted_on_runtime() -> bool:
    return os.environ.get("HEALTH_HOST", "").strip() == "agent-runtime"


def hosted_in_cloud() -> bool:
    return hosted_on_runtime() or bool(os.environ.get("K_SERVICE"))


def resolved_host() -> str:
    if hosted_on_runtime():
        return "agent-runtime"
    if os.environ.get("K_SERVICE"):
        return "cloud-run"
    return "local"


def resolve_model() -> str:
    """Model id the ADK reasoner will call. On Agent Runtime this must come from Terraform."""
    model = os.environ.get("HEALTH_ADK_MODEL", "").strip()
    if model:
        return model
    if hosted_on_runtime():
        raise RuntimeError(
            "HEALTH_ADK_MODEL is unset. Agent Runtime must take gemini-2.5-pro "
            "from spec.deployment_spec.env, not a code default."
        )
    return DEFAULT_ADK_MODEL


def resolved_identity() -> str | None:
    explicit = os.environ.get("AGENT_IDENTITY", "").strip()
    if explicit:
        return explicit
    if not hosted_on_runtime():
        return None
    return fetch_effective_identity()


def fetch_engine_identity(engine_id: str, location: str, project: str) -> str | None:
    if not engine_id or not project:
        return None
    try:
        body = _aiplatform_get(
            f"https://{location}-aiplatform.googleapis.com/v1beta1/"
            f"projects/{project}/locations/{location}/reasoningEngines/{engine_id}"
        )
    except (RuntimeError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"agent_identity_lookup_failed={exc}", flush=True)
        return None
    return _identity_from_engine(body)


def runtime_location() -> str:
    """Region for Agent Runtime identity lookup.

    On Agent Runtime, never fall through to MEMORY_BANK_LOCATION (often us-central1).
    Prefer HEALTH_RUNTIME_LOCATION, else DEFAULT_RUNTIME_LOCATION (europe-west1).
    """
    explicit = os.environ.get("HEALTH_RUNTIME_LOCATION", "").strip()
    if explicit:
        return explicit
    if hosted_on_runtime():
        return DEFAULT_RUNTIME_LOCATION
    return (
        os.environ.get("GOOGLE_CLOUD_LOCATION", "").strip()
        or os.environ.get("MEMORY_BANK_LOCATION", "").strip()
        or DEFAULT_MEMORY_BANK_LOCATION
    )


def fetch_effective_identity() -> str | None:
    """Read spec.effectiveIdentity from the deployed engine, not from Terraform config."""
    global _IDENTITY_CACHE
    if _IDENTITY_CACHE:
        return _IDENTITY_CACHE
    project = os.environ.get("GOOGLE_CLOUD_PROJECT", "").strip()
    location = runtime_location()
    if not project:
        return None
    engine_id = os.environ.get("HEALTH_RUNTIME_ENGINE_ID", "").strip()
    try:
        if engine_id:
            identity = fetch_engine_identity(engine_id, location, project)
        else:
            identity = _identity_from_display_name(
                project,
                location,
                os.environ.get("HEALTH_RUNTIME_DISPLAY_NAME", "health-agent").strip()
                or "health-agent",
            )
    except (RuntimeError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"agent_identity_lookup_failed={exc}", flush=True)
        return None
    if identity:
        _IDENTITY_CACHE = identity
    return identity


def _identity_from_display_name(project: str, location: str, display_name: str) -> str | None:
    body = _aiplatform_get(
        f"https://{location}-aiplatform.googleapis.com/v1beta1/"
        f"projects/{project}/locations/{location}/reasoningEngines"
    )
    engines = body.get("reasoningEngines") or body.get("reasoning_engines") or []
    if not isinstance(engines, list):
        return None
    for item in engines:
        if not isinstance(item, dict):
            continue
        if item.get("displayName") != display_name and item.get("display_name") != display_name:
            continue
        identity = _identity_from_engine(item)
        if identity:
            return identity
    return None


def _identity_from_engine(body: dict[str, object]) -> str | None:
    spec = body.get("spec")
    if not isinstance(spec, dict):
        return None
    identity = spec.get("effectiveIdentity") or spec.get("effective_identity")
    return identity if isinstance(identity, str) and identity else None


def _aiplatform_get(url: str) -> dict[str, object]:
    import google.auth
    from google.auth.transport.requests import Request

    creds, _ = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    creds.refresh(Request())
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {creds.token}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=AIPLATFORM_GET_TIMEOUT_S) as response:
        raw = json.loads(response.read().decode("utf-8"))
    if not isinstance(raw, dict):
        raise RuntimeError("Agent Engine lookup returned a non-object")
    return raw
