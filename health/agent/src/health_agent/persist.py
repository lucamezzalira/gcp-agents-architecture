from __future__ import annotations

import json
import os

import psycopg

from health_agent.models import CharacteristicRead, HealthRead
from health_agent.score_bridge import repo_root


def database_url() -> str:
    return os.environ.get(
        "DATABASE_URL",
        "postgresql://health:health@127.0.0.1:5433/health",
    )


def connect() -> psycopg.Connection:
    return psycopg.connect(database_url())


def migrate(conn: psycopg.Connection) -> None:
    sql = (repo_root() / "health" / "agent" / "migrations" / "001_init.sql").read_text()
    conn.execute(sql)
    conn.commit()


def insert_health_read(
    conn: psycopg.Connection,
    read: HealthRead,
    commit_message: str,
) -> None:
    conn.execute(
        """
        insert into health_run (run_id, commit_sha, commit_message, overall_score)
        values (%s, %s, %s, %s)
        on conflict (run_id) do update set
          commit_sha = excluded.commit_sha,
          commit_message = excluded.commit_message,
          overall_score = excluded.overall_score
        """,
        (read.runId, read.commitSha, commit_message, read.overall),
    )
    conn.execute(
        "delete from health_characteristic where run_id = %s",
        (read.runId,),
    )
    for item in read.characteristics:
        conn.execute(
            """
            insert into health_characteristic (
              run_id, characteristic, score, reasoning, recommendations, signals_used
            ) values (%s, %s, %s, %s, %s::jsonb, %s::jsonb)
            """,
            (
                read.runId,
                item.id,
                item.score,
                item.reasoning,
                json.dumps(item.recommendations),
                json.dumps(item.signalsUsed),
            ),
        )
    conn.commit()


def record_decision(
    conn: psycopg.Connection,
    *,
    decision_id: str,
    rule_id: str,
    path_glob: str,
    decision: str,
    rationale: str,
    decided_by: str,
) -> None:
    conn.execute(
        """
        insert into accepted_decision (
          id, rule_id, path_glob, decision, rationale, decided_by
        ) values (%s, %s, %s, %s, %s, %s)
        on conflict (id) do update set
          active = true,
          rationale = excluded.rationale
        """,
        (decision_id, rule_id, path_glob, decision, rationale, decided_by),
    )
    conn.commit()


def load_active_decisions(conn: psycopg.Connection) -> list[dict[str, object]]:
    rows = conn.execute(
        """
        select id, rule_id, path_glob, decision, rationale, decided_by,
               decided_at::text, active
        from accepted_decision
        where active = true
        """
    ).fetchall()
    results: list[dict[str, object]] = []
    for row in rows:
        results.append(
            {
                "id": row[0],
                "ruleId": row[1],
                "pathGlob": row[2],
                "decision": row[3],
                "rationale": row[4],
                "decidedBy": row[5],
                "decidedAt": row[6],
                "active": row[7],
            }
        )
    return results


def count_runs(conn: psycopg.Connection) -> int:
    row = conn.execute("select count(*) from health_run").fetchone()
    if row is None:
        return 0
    return int(row[0])


def load_recent_reads(conn: psycopg.Connection, limit: int = 8) -> list[HealthRead]:
    runs = conn.execute(
        """
        select run_id, commit_sha, overall_score
        from health_run
        order by created_at asc
        limit %s
        """,
        (limit,),
    ).fetchall()
    reads: list[HealthRead] = []
    for run_id, commit_sha, overall in runs:
        rows = conn.execute(
            """
            select characteristic, score, reasoning, recommendations, signals_used
            from health_characteristic
            where run_id = %s
            order by characteristic
            """,
            (run_id,),
        ).fetchall()
        characteristics: list[CharacteristicRead] = []
        for row in rows:
            recommendations = row[3] if isinstance(row[3], list) else json.loads(row[3] or "[]")
            signals = row[4] if isinstance(row[4], list) else json.loads(row[4] or "[]")
            characteristics.append(
                CharacteristicRead(
                    id=row[0],
                    score=int(row[1]),
                    reasoning=row[2] or "",
                    recommendations=recommendations,
                    signalsUsed=signals,
                )
            )
        if characteristics:
            reads.append(
                HealthRead(
                    runId=str(run_id),
                    commitSha=str(commit_sha),
                    overall=int(overall),
                    characteristics=characteristics,
                )
            )
    return reads
