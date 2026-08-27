import pytest

from health_agent.host import resolve_model, resolved_host, resolved_identity


def test_runtime_requires_model_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HEALTH_HOST", "agent-runtime")
    monkeypatch.delenv("HEALTH_ADK_MODEL", raising=False)
    with pytest.raises(RuntimeError, match="HEALTH_ADK_MODEL is unset"):
        resolve_model()


def test_runtime_uses_terraform_model(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HEALTH_HOST", "agent-runtime")
    monkeypatch.setenv("HEALTH_ADK_MODEL", "gemini-2.5-pro")
    assert resolve_model() == "gemini-2.5-pro"
    assert resolved_host() == "agent-runtime"


def test_identity_lookup_uses_runtime_location(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HEALTH_HOST", "agent-runtime")
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "ga-health-mezzalab")
    monkeypatch.setenv("HEALTH_RUNTIME_LOCATION", "europe-west1")
    monkeypatch.setenv("MEMORY_BANK_LOCATION", "us-central1")
    monkeypatch.delenv("AGENT_IDENTITY", raising=False)
    monkeypatch.delenv("HEALTH_RUNTIME_ENGINE_ID", raising=False)
    import health_agent.host as host_mod

    host_mod._IDENTITY_CACHE = None
    seen: dict[str, str] = {}

    def fake_get(url: str) -> dict[str, object]:
        seen["url"] = url
        return {
            "reasoningEngines": [
                {
                    "displayName": "health-agent",
                    "spec": {"effectiveIdentity": "principal://agents.example/health-agent"},
                }
            ]
        }

    monkeypatch.setattr("health_agent.host._aiplatform_get", fake_get)
    assert resolved_identity() == "principal://agents.example/health-agent"
    assert "europe-west1-aiplatform.googleapis.com" in seen["url"]
    assert "us-central1" not in seen["url"]


def test_identity_lookup_defaults_runtime_location_not_memory_bank(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("HEALTH_HOST", "agent-runtime")
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "ga-health-mezzalab")
    monkeypatch.delenv("HEALTH_RUNTIME_LOCATION", raising=False)
    monkeypatch.setenv("MEMORY_BANK_LOCATION", "us-central1")
    monkeypatch.delenv("AGENT_IDENTITY", raising=False)
    monkeypatch.delenv("HEALTH_RUNTIME_ENGINE_ID", raising=False)
    import health_agent.host as host_mod
    from health_agent.host import runtime_location

    host_mod._IDENTITY_CACHE = None
    seen: dict[str, str] = {}

    def fake_get(url: str) -> dict[str, object]:
        seen["url"] = url
        return {
            "reasoningEngines": [
                {
                    "displayName": "health-agent",
                    "spec": {"effectiveIdentity": "principal://agents.example/health-agent"},
                }
            ]
        }

    monkeypatch.setattr("health_agent.host._aiplatform_get", fake_get)
    assert runtime_location() == "europe-west1"
    assert resolved_identity() == "principal://agents.example/health-agent"
    assert "europe-west1-aiplatform.googleapis.com" in seen["url"]
    assert "us-central1" not in seen["url"]


def test_identity_lookup_uses_runtime_display_name(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HEALTH_HOST", "agent-runtime")
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "ga-health-mezzalab")
    monkeypatch.setenv("HEALTH_RUNTIME_LOCATION", "europe-west1")
    monkeypatch.setenv("HEALTH_RUNTIME_DISPLAY_NAME", "health-reasoner")
    monkeypatch.delenv("AGENT_IDENTITY", raising=False)
    monkeypatch.delenv("HEALTH_RUNTIME_ENGINE_ID", raising=False)
    import health_agent.host as host_mod

    host_mod._IDENTITY_CACHE = None
    seen: dict[str, object] = {}

    def fake_get(url: str) -> dict[str, object]:
        return {
            "reasoningEngines": [
                {
                    "displayName": "health-reasoner",
                    "spec": {"effectiveIdentity": "principal://agents.example/health-reasoner"},
                }
            ]
        }

    monkeypatch.setattr("health_agent.host._aiplatform_get", fake_get)
    assert resolved_identity() == "principal://agents.example/health-reasoner"
    del seen
