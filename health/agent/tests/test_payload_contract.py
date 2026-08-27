from __future__ import annotations

import json
from pathlib import Path

from health_agent.models import AnalysisPayload
from health_agent.score_bridge import repo_root


def test_analysis_payload_fields_match_checked_in_keys() -> None:
    keys_path = Path(repo_root()) / "analysis" / "payload-top-level-keys.json"
    expected = set(json.loads(keys_path.read_text()))
    actual = set(AnalysisPayload.model_fields)
    assert actual == expected
