from __future__ import annotations

import json
import os
from uuid import uuid4

import psycopg

from health_agent.models import (
    CharacteristicRead,
    HealthRead,
    RunMetrics,
    ServiceRead,
)
from health_agent.score_bridge import repo_root
from health_agent.tracing import tracer


def database_url() -> str:
    return os.environ.get(
        "DATABASE_URL",
        "postgresql://health:health@127.0.0.1:5433/health",
    )


def connect() -> psycopg.Connection:
    return psycopg.connect(database_url())


def migrate(conn: psycopg.Connection) -> None:
    conn.execute(
        """
        create table if not exists schema_migrations (
          id text primary key,
          applied_at timestamptz not null default now()
        )
        """
    )
    conn.commit()
    folder = repo_root() / "health" / "agent" / "migrations"
    files = sorted(folder.glob("*.sql"))
    already = conn.execute(
        """
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'health_characteristic'
          and column_name = 'scope'
        """
    ).fetchone()
    if already is not None:
        for path in files:
            conn.execute(
                """
                insert into schema_migrations (id) values (%s)
                on conflict (id) do nothing
                """,
                (path.name,),
            )
        conn.commit()
        return
    for path in files:
        applied = conn.execute(
            "select 1 from schema_migrations where id = %s",
            (path.name,),
        ).fetchone()
        if applied is not None:
            continue
        for statement in path.read_text().split(";"):
            sql = statement.strip()
            if sql:
                conn.execute(sql)
        conn.execute(
            "insert into schema_migrations (id) values (%s)",
            (path.name,),
        )
        conn.commit()


def _metrics_payload(read: HealthRead) -> dict[str, object] | None:
    if read.metrics is None:
        return None
    return read.metrics.model_dump(by_alias=True)


def insert_health_read(
    conn: psycopg.Connection,
    read: HealthRead,
    commit_message: str,
) -> None:
    with tracer().start_as_current_span("persistence"):
        previous = conn.execute(
            """
            select run_id, created_at
            from health_run
            where commit_sha = %s and state = 'current'
            """,
            (read.commitSha,),
        ).fetchone()
        run_id = f"{read.commitSha}:{uuid4().hex}"
        created_at = None
        if previous is not None:
            previous_id, created_at = previous
            conn.execute(
                """
                update health_run
                   set state = 'superseded',
                       superseded_at = now(),
                       superseded_by = %s
                 where run_id = %s
                """,
                (run_id, previous_id),
            )
        metrics = _metrics_payload(read)
        service_overalls = {item.service: item.overall for item in read.services}
        conn.execute(
            """
            insert into health_run (
              run_id, commit_sha, commit_message, overall_score, reasoner, trace_id,
              modules, dependencies, duplication_pct, orphan_count, cycle_count,
              state, service_overalls, metrics, created_at, scored_at, rule_set_version
            )
            values (
              %s, %s, %s, %s, %s, %s,
              %s, %s, %s, %s, %s,
              'current', %s::jsonb, %s::jsonb, coalesce(%s, now()), now(), %s
            )
            """,
            (
                run_id,
                read.commitSha,
                commit_message,
                read.overall,
                read.reasoner,
                read.traceId,
                None if read.metrics is None else read.metrics.modules,
                None if read.metrics is None else read.metrics.dependencies,
                None if read.metrics is None else read.metrics.duplicationPercentage,
                None if read.metrics is None else read.metrics.orphanCount,
                None if read.metrics is None else read.metrics.cycleCount,
                json.dumps(service_overalls),
                json.dumps(metrics) if metrics is not None else None,
                created_at,
                read.ruleSetVersion,
            ),
        )
        scopes: list[tuple[str, list[CharacteristicRead]]] = [
            ("platform", read.characteristics)
        ]
        scopes.extend((item.service, item.characteristics) for item in read.services)
        for scope, items in scopes:
            for item in items:
                conn.execute(
                    """
                    insert into health_characteristic (
                      run_id, scope, characteristic, score, reasoning,
                      recommendations, signals_used, suppressed_by
                    ) values (%s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb)
                    """,
                    (
                        run_id,
                        scope,
                        item.id,
                        item.score,
                        item.reasoning,
                        json.dumps(item.recommendations),
                        json.dumps(item.signalsUsed),
                        json.dumps(item.suppressedBy or []),
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
    scope: str = "platform",
) -> None:
    conn.execute(
        """
        insert into accepted_decision (
          id, rule_id, path_glob, decision, rationale, decided_by, scope
        ) values (%s, %s, %s, %s, %s, %s, %s)
        on conflict (id) do update set
          active = true,
          rationale = excluded.rationale,
          scope = excluded.scope
        """,
        (decision_id, rule_id, path_glob, decision, rationale, decided_by, scope),
    )
    conn.commit()


def load_active_decisions(conn: psycopg.Connection) -> list[dict[str, object]]:
    rows = conn.execute(
        """
        select id, rule_id, path_glob, decision, rationale, decided_by,
               decided_at::text, active, coalesce(scope, 'platform')
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
                "scope": row[8],
            }
        )
    return results


def count_runs(conn: psycopg.Connection) -> int:
    row = conn.execute("select count(*) from health_run").fetchone()
    if row is None:
        return 0
    return int(row[0])


def _characteristics(
    conn: psycopg.Connection, run_id: str, scope: str
) -> list[CharacteristicRead]:
    rows = conn.execute(
        """
        select characteristic, score, reasoning, recommendations, signals_used,
               suppressed_by
        from health_characteristic
        where run_id = %s and scope = %s
        order by characteristic
        """,
        (run_id, scope),
    ).fetchall()
    characteristics: list[CharacteristicRead] = []
    for row in rows:
        recommendations = row[3] if isinstance(row[3], list) else json.loads(row[3] or "[]")
        signals = row[4] if isinstance(row[4], list) else json.loads(row[4] or "[]")
        suppressed = row[5] if isinstance(row[5], list) else json.loads(row[5] or "[]")
        characteristics.append(
            CharacteristicRead(
                id=row[0],
                score=int(row[1]),
                reasoning=row[2] or "",
                recommendations=recommendations,
                signalsUsed=signals,
                suppressedBy=suppressed or None,
            )
        )
    return characteristics


def _read_from_run_row(
    conn: psycopg.Connection,
    run_id: str,
    commit_sha: str,
    overall: int,
    reasoner: str | None,
    trace_id: str | None,
    modules: int | None,
    dependencies: int | None,
    duplication_pct: float | None,
    orphan_count: int | None,
    cycle_count: int | None,
    metrics_json: object,
    service_overalls: object,
    state: str,
    rule_set_version: object = 1,
) -> HealthRead | None:
    platform = _characteristics(conn, run_id, "platform")
    if not platform:
        return None
    metrics = None
    if isinstance(metrics_json, dict):
        metrics = RunMetrics.model_validate(metrics_json)
    elif modules is not None and dependencies is not None:
        metrics = RunMetrics(
            modules=int(modules),
            dependencies=int(dependencies),
            duplicationPercentage=float(duplication_pct or 0),
            orphanCount=int(orphan_count or 0),
            cycleCount=int(cycle_count or 0),
        )
    overalls = service_overalls if isinstance(service_overalls, dict) else {}
    scopes = conn.execute(
        """
        select distinct scope from health_characteristic
        where run_id = %s and scope <> 'platform'
        order by scope
        """,
        (run_id,),
    ).fetchall()
    services: list[ServiceRead] = []
    for (scope,) in scopes:
        services.append(
            ServiceRead(
                service=str(scope),
                overall=int(overalls.get(scope, 0)) if isinstance(overalls, dict) else 0,
                characteristics=_characteristics(conn, run_id, str(scope)),
            )
        )
    return HealthRead(
        runId=str(run_id),
        commitSha=str(commit_sha),
        overall=int(overall),
        characteristics=platform,
        reasoner=str(reasoner or "stub"),
        traceId=str(trace_id) if trace_id else None,
        metrics=metrics,
        state=state,
        services=services,
        ruleSetVersion=int(rule_set_version or 1),
    )


def load_recent_reads(conn: psycopg.Connection, limit: int = 64) -> list[HealthRead]:
    runs = conn.execute(
        """
        select run_id, commit_sha, overall_score, reasoner, trace_id,
               modules, dependencies, duplication_pct, orphan_count, cycle_count,
               metrics, service_overalls, state, coalesce(rule_set_version, 1)
        from health_run
        where state = 'current'
        order by created_at asc
        limit %s
        """,
        (limit,),
    ).fetchall()
    reads: list[HealthRead] = []
    for row in runs:
        read = _read_from_run_row(conn, *row)
        if read is not None:
            reads.append(read)
    return reads
