from __future__ import annotations

import json
import os
from uuid import uuid4

import psycopg

from health_agent.models import (
    CharacteristicRead,
    HealthRead,
    Narrative,
    RunMetrics,
    ServiceRead,
)
from health_agent.score_bridge import repo_root
from health_agent.tracing import tracer

BOOTSTRAP_MIGRATIONS = (
    "001_init.sql",
    "002_reasoner_trace.sql",
    "003_run_metrics.sql",
    "004_per_service_supersede.sql",
)

_SQL_CONNECTOR: object | None = None
_DATABASE_URL: str | None = None


def database_url() -> str:
    global _DATABASE_URL
    existing = os.environ.get("DATABASE_URL", "").strip()
    if existing:
        return existing
    if _DATABASE_URL:
        return _DATABASE_URL
    secret_id = os.environ.get("HEALTH_DATABASE_URL_SECRET", "").strip()
    if secret_id:
        _DATABASE_URL = _secret_payload(secret_id)
        return _DATABASE_URL
    return "postgresql://health:health@127.0.0.1:5433/health"


def _secret_payload(secret_id: str) -> str:
    from google.cloud import secretmanager

    project = os.environ.get("GOOGLE_CLOUD_PROJECT", "").strip()
    if not project:
        raise RuntimeError(
            "GOOGLE_CLOUD_PROJECT is required to load DATABASE_URL from Secret Manager"
        )
    client = secretmanager.SecretManagerServiceClient()
    name = f"projects/{project}/secrets/{secret_id}/versions/latest"
    payload = client.access_secret_version(request={"name": name}).payload.data
    return payload.decode("utf-8").strip()


def connect() -> psycopg.Connection | _PgConn:
    instance = os.environ.get("CLOUD_SQL_CONNECTION_NAME", "").strip()
    if instance:
        return _connect_connector(instance)
    return psycopg.connect(database_url())


class _PgConn:
    """pg8000 adapter so Agent Runtime can use Cloud SQL Connector (no psycopg driver)."""

    def __init__(self, raw: object) -> None:
        self._raw = raw

    def execute(self, sql: str, params: object = None) -> object:
        cursor = getattr(self._raw, "cursor")()
        if params is None:
            cursor.execute(sql)
        else:
            cursor.execute(sql, params)
        return cursor

    def commit(self) -> None:
        getattr(self._raw, "commit")()

    def close(self) -> None:
        getattr(self._raw, "close")()


def _connect_connector(instance: str) -> _PgConn:
    from urllib.parse import unquote, urlparse

    from google.cloud.sql.connector import Connector

    global _SQL_CONNECTOR
    if _SQL_CONNECTOR is None:
        _SQL_CONNECTOR = Connector()
    parsed = urlparse(database_url())
    user = unquote(parsed.username or "health")
    password = unquote(parsed.password or "")
    db = (parsed.path or "/health").lstrip("/") or "health"
    connector = _SQL_CONNECTOR
    raw = connector.connect(
        instance,
        "pg8000",
        user=user,
        password=password,
        db=db,
    )
    return _PgConn(raw)


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
        for name in BOOTSTRAP_MIGRATIONS:
            conn.execute(
                """
                insert into schema_migrations (id) values (%s)
                on conflict (id) do nothing
                """,
                (name,),
            )
        conn.commit()
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


def iso_or_none(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    return text if text else None


def insert_health_read(
    conn: psycopg.Connection,
    read: HealthRead,
    commit_message: str,
    committed_at: str | None = None,
) -> str:
    with tracer().start_as_current_span("persistence"):
        previous = conn.execute(
            """
            select run_id, committed_at, coalesce(incomplete, false)
            from health_run
            where commit_sha = %s and state = 'current'
            """,
            (read.commitSha,),
        ).fetchone()
        run_id = f"{read.commitSha}:{uuid4().hex}"
        persisted_committed_at: object = committed_at
        incomplete = not bool(read.reasoner)
        if previous is not None:
            previous_id, previous_committed_at, previous_incomplete = previous
            if persisted_committed_at is None:
                persisted_committed_at = previous_committed_at
            if previous_incomplete:
                return str(previous_id)
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
              state, service_overalls, metrics, created_at, scored_at, rule_set_version,
              committed_at, model, host, agent_identity, incomplete
            )
            values (
              %s, %s, %s, %s, %s, %s,
              %s, %s, %s, %s, %s,
              'current', %s::jsonb, %s::jsonb, now(), now(), %s,
              %s, %s, %s, %s, %s
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
                read.ruleSetVersion,
                persisted_committed_at,
                read.model,
                read.host,
                read.agentIdentity,
                incomplete,
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
        return run_id


def attach_reasoning(
    conn: psycopg.Connection,
    run_id: str,
    narratives: list[Narrative],
    *,
    reasoner: str,
    host: str | None,
    model: str | None,
    agent_identity: str | None,
    trace_id: str | None,
) -> None:
    """Attach prose to an already-scored run. Never updates a score column."""
    by_id = {item.id: item for item in narratives}
    rows = conn.execute(
        """
        select scope, characteristic, score
        from health_characteristic
        where run_id = %s
        """,
        (run_id,),
    ).fetchall()
    if not rows:
        raise RuntimeError(f"no scored characteristics for {run_id}")
    for scope, characteristic, score in rows:
        key = (
            str(characteristic)
            if str(scope) == "platform"
            else f"{scope}:{characteristic}"
        )
        narrative = by_id.get(key)
        if narrative is None:
            raise RuntimeError(f"missing narrative for {key}")
        recommendations = [] if int(score) == 100 else narrative.recommendations
        conn.execute(
            """
            update health_characteristic
               set reasoning = %s,
                   recommendations = %s::jsonb
             where run_id = %s and scope = %s and characteristic = %s
            """,
            (
                narrative.reasoning,
                json.dumps(recommendations),
                run_id,
                scope,
                characteristic,
            ),
        )
    conn.execute(
        """
        update health_run
           set reasoner = %s,
               host = %s,
               model = %s,
               agent_identity = %s,
               trace_id = coalesce(%s, trace_id),
               incomplete = false
         where run_id = %s
        """,
        (reasoner, host, model, agent_identity, trace_id, run_id),
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
    model: object = None,
    host: object = None,
    agent_identity: object = None,
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
        model=str(model) if model else None,
        host=str(host) if host else None,
        agentIdentity=str(agent_identity) if agent_identity else None,
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
               metrics, service_overalls, state, coalesce(rule_set_version, 1),
               model, host, agent_identity
        from health_run
        where state = 'current'
        order by coalesce(committed_at, created_at) asc, created_at asc
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
