from pydantic import BaseModel, ConfigDict


class ArchViolation(BaseModel):
    file: str
    detail: str


class ArchTestResult(BaseModel):
    ruleId: str
    passed: bool
    violations: list[ArchViolation]


class RuntimePayload(BaseModel):
    illustrative: bool
    signals: list[dict[str, str | float | int]]


class Clone(BaseModel):
    files: list[str]
    lines: int = 0
    tokens: int = 0


class DuplicationPayload(BaseModel):
    clones: list[Clone] = []
    percentage: float = 0


class DependencyMetrics(BaseModel):
    modules: int = 0
    dependencies: int = 0


class DependencyCruiserPayload(BaseModel):
    cycles: list[dict[str, object]] = []
    orphans: list[str] = []
    violations: list[dict[str, object]] = []
    metrics: DependencyMetrics = DependencyMetrics()


class RecentCommit(BaseModel):
    sha: str
    message: str


class AnalysisPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    runId: str
    commitSha: str
    commitMessage: str
    timestamp: str
    archTests: list[ArchTestResult]
    runtime: RuntimePayload
    dependencyCruiser: DependencyCruiserPayload = DependencyCruiserPayload()
    duplication: DuplicationPayload = DuplicationPayload()
    recentCommits: list[RecentCommit] = []


class CharacteristicScore(BaseModel):
    id: str
    score: int
    signalsUsed: list[str]
    suppressedBy: list[str] | None = None


class ScoreResult(BaseModel):
    overall: int
    characteristics: list[CharacteristicScore]


class CharacteristicRead(BaseModel):
    id: str
    score: int
    reasoning: str
    recommendations: list[str]
    signalsUsed: list[str]
    suppressedBy: list[str] | None = None


class HealthRead(BaseModel):
    runId: str
    commitSha: str
    overall: int
    characteristics: list[CharacteristicRead]
    reasoner: str
    traceId: str | None = None


class Narrative(BaseModel):
    id: str
    reasoning: str
    recommendations: list[str]
