"""Named defaults for the health agent. Env overrides stay at call sites where Terraform sets them."""

from __future__ import annotations

DEFAULT_DATABASE_URL = "postgresql://health:health@127.0.0.1:5433/health"
DEFAULT_PRIOR_READ_LIMIT = 64
DEFAULT_ADK_MODEL = "gemini-2.5-pro"
DEFAULT_RUNTIME_LOCATION = "europe-west1"
DEFAULT_MEMORY_BANK_LOCATION = "us-central1"

RUNTIME_QUERY_TIMEOUT_S = 240
REASON_PUBLISH_TIMEOUT_S = 30
AIPLATFORM_GET_TIMEOUT_S = 30
TRACE_FORCE_FLUSH_MS = 10_000

# Folder instability: transport-style layers above this look appropriately unstable.
HEALTHY_TRANSPORT_INSTABILITY = 0.78

KNOWN_ARCH_RULE_IDS = tuple(f"rule-{n}" for n in range(1, 11))
