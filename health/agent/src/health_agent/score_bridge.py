from __future__ import annotations

import json
import subprocess
from pathlib import Path

from health_agent.models import ScoreResult


def repo_root() -> Path:
    here = Path(__file__).resolve()
    for candidate in here.parents:
        if (candidate / "pnpm-workspace.yaml").exists():
            return candidate
    raise RuntimeError("could not find repo root")


def score_payload(payload_path: Path, decisions_path: Path | None = None) -> ScoreResult:
    root = repo_root()
    command = [
        "pnpm",
        "--filter",
        "@health/scoring",
        "score",
        "--",
        str(payload_path),
    ]
    if decisions_path is not None:
        command.append(str(decisions_path))
    completed = subprocess.run(
        command,
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
    )
    line = completed.stdout.strip().splitlines()[-1]
    return ScoreResult.model_validate(json.loads(line))
