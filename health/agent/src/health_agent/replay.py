from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from pathlib import Path

from health_agent.persist import connect, insert_health_read, migrate
from health_agent.run import produce_health_read
from health_agent.score_bridge import repo_root


def history_shas(root: Path) -> list[str]:
    text = (root / "analysis" / "history-shas.txt").read_text()
    return [line.strip() for line in text.splitlines() if line.strip()]


def collect_payload(root: Path, worktree: Path, out_path: Path) -> None:
    subprocess.run(
        [
            "pnpm",
            "--filter",
            "analysis",
            "exec",
            "tsx",
            str(root / "analysis" / "collect-payload.ts"),
            str(out_path),
            str(worktree),
        ],
        cwd=root,
        check=True,
    )


def replay() -> None:
    root = repo_root()
    conn = connect()
    migrate(conn)
    shas = history_shas(root)
    subprocess.run(["git", "worktree", "prune"], cwd=root, check=False)
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        for sha in shas:
            worktree = tmp_path / sha
            subprocess.run(
                ["git", "worktree", "add", "--detach", str(worktree), sha],
                cwd=root,
                check=True,
                capture_output=True,
                text=True,
            )
            try:
                payload_path = tmp_path / f"{sha}.json"
                collect_payload(root, worktree, payload_path)
                payload = json.loads(payload_path.read_text())
                read = produce_health_read(payload_path)
                insert_health_read(conn, read, str(payload.get("commitMessage", "")))
            finally:
                subprocess.run(
                    ["git", "worktree", "remove", "--force", str(worktree)],
                    cwd=root,
                    check=False,
                )
    print(f"replayed {len(shas)} commits")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.parse_args()
    replay()


if __name__ == "__main__":
    main()
