from health_agent.persist import BOOTSTRAP_MIGRATIONS, iso_or_none


def test_later_migrations_are_not_treated_as_bootstrap() -> None:
    assert "007_incomplete.sql" not in BOOTSTRAP_MIGRATIONS
    assert "006_agent_identity.sql" not in BOOTSTRAP_MIGRATIONS
    assert "005_committed_at.sql" not in BOOTSTRAP_MIGRATIONS
    assert "001_init.sql" in BOOTSTRAP_MIGRATIONS


def test_database_url_uses_env_before_secret(monkeypatch) -> None:
    from health_agent import persist as persist_mod

    persist_mod._DATABASE_URL = None
    monkeypatch.setenv("DATABASE_URL", "postgresql://from-env/health")
    monkeypatch.setenv("HEALTH_DATABASE_URL_SECRET", "health-database-url")
    monkeypatch.setattr(
        persist_mod,
        "_secret_payload",
        lambda _sid: "postgresql://from-secret/health",
    )
    assert persist_mod.database_url() == "postgresql://from-env/health"


def test_database_url_loads_secret_when_env_missing(monkeypatch) -> None:
    from health_agent import persist as persist_mod

    persist_mod._DATABASE_URL = None
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("HEALTH_DATABASE_URL_SECRET", "health-database-url")
    monkeypatch.setattr(
        persist_mod,
        "_secret_payload",
        lambda sid: f"postgresql://secret/{sid}",
    )
    assert persist_mod.database_url() == "postgresql://secret/health-database-url"


def test_pg_conn_adapter_executes_and_commits() -> None:
    from health_agent.persist import _PgConn

    class FakeCursor:
        def __init__(self) -> None:
            self.sql = ""
            self.params: object = None

        def execute(self, sql: str, params: object = None) -> None:
            self.sql = sql
            self.params = params

        def fetchone(self) -> tuple[int]:
            return (1,)

    class FakeRaw:
        def __init__(self) -> None:
            self.cursor_obj = FakeCursor()
            self.committed = False
            self.closed = False

        def cursor(self) -> FakeCursor:
            return self.cursor_obj

        def commit(self) -> None:
            self.committed = True

        def close(self) -> None:
            self.closed = True

    raw = FakeRaw()
    conn = _PgConn(raw)
    result = conn.execute("select 1", (1,))
    assert result.fetchone() == (1,)
    conn.commit()
    conn.close()
    assert raw.committed is True
    assert raw.closed is True


def test_iso_or_none_keeps_git_committer_time() -> None:
    assert iso_or_none("2026-08-14T17:55:39+01:00") == "2026-08-14T17:55:39+01:00"
    assert iso_or_none("  ") is None
    assert iso_or_none(None) is None
    assert iso_or_none(12) is None


def test_attach_reasoning_does_not_update_score_columns() -> None:
    from health_agent.models import Narrative
    from health_agent.persist import attach_reasoning

    sql: list[str] = []

    class FakeCursor:
        def fetchall(self) -> list[tuple[str, str, int]]:
            return [("platform", "layering", 100)]

    class FakeConn:
        def execute(self, statement: str, params: object = None) -> FakeCursor:
            sql.append(statement)
            return FakeCursor()

        def commit(self) -> None:
            return None

    attach_reasoning(
        FakeConn(),
        "sha:run",
        [Narrative(id="layering", reasoning="ok", recommendations=["no"])],
        reasoner="adk",
        host="agent-runtime",
        model="gemini-2.5-pro",
        agent_identity="principal://agents.example/health-agent",
        trace_id="abc",
    )
    updates = [item.lower() for item in sql if "update" in item.lower()]
    assert updates
    assert all("score" not in item.split("set", 1)[-1].split("where", 1)[0] for item in updates)
    assert any("reasoning" in item for item in updates)
    assert any("incomplete = false" in item.replace("\n", " ") for item in updates)


def test_insert_does_not_copy_created_at_and_marks_incomplete() -> None:
    from health_agent.models import CharacteristicRead, HealthRead
    from health_agent.persist import insert_health_read

    statements: list[str] = []
    params: list[object] = []

    class FakeCursor:
        def fetchone(self) -> None:
            return None

        def fetchall(self) -> list[tuple[object, ...]]:
            return []

    class FakeConn:
        def execute(self, statement: str, values: object = None) -> FakeCursor:
            statements.append(statement)
            params.append(values)
            return FakeCursor()

        def commit(self) -> None:
            return None

    read = HealthRead(
        runId="r1",
        commitSha="a" * 40,
        overall=93,
        characteristics=[
            CharacteristicRead(
                id="layering",
                score=100,
                reasoning="",
                recommendations=[],
                signalsUsed=[],
            )
        ],
        reasoner="",
        traceId="t1",
    )
    insert_health_read(FakeConn(), read, "msg", "2026-08-14T17:00:00Z")
    insert_sql = next(item for item in statements if "insert into health_run" in item)
    assert "coalesce(%s, now())" not in insert_sql
    assert "now(), now()" in insert_sql.replace("\n", " ")
    insert_params = next(
        values for statement, values in zip(statements, params) if "insert into health_run" in statement
    )
    assert insert_params is not None
    assert insert_params[-1] is True


def test_insert_reuses_incomplete_current_row() -> None:
    from health_agent.models import CharacteristicRead, HealthRead
    from health_agent.persist import insert_health_read

    class FakeCursor:
        def fetchone(self) -> tuple[str, str, bool]:
            return ("sha:existing", "2026-08-14T17:00:00Z", True)

    class FakeConn:
        def execute(self, statement: str, _values: object = None) -> FakeCursor:
            return FakeCursor()

        def commit(self) -> None:
            return None

    read = HealthRead(
        runId="r1",
        commitSha="a" * 40,
        overall=93,
        characteristics=[
            CharacteristicRead(
                id="layering",
                score=100,
                reasoning="",
                recommendations=[],
                signalsUsed=[],
            )
        ],
        reasoner="",
    )
    assert insert_health_read(FakeConn(), read, "msg") == "sha:existing"

