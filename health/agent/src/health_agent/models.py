from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ArchViolation(BaseModel):
    file: str
    detail: str
    service: str | None = None


class ArchTestResult(BaseModel):
    ruleId: str
    passed: bool
    violations: list[ArchViolation]


class RuntimeEdge(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_service: str = Field(alias="from")
    to: str
    protocol: str = "http"
    count: int = 1


class RuntimeCallGraph(BaseModel):
    illustrative: bool = False
    synthetic: bool = True
    description: str = ""
    window: dict[str, str] = Field(default_factory=dict)
    traffic: str = "none"
    queried: bool = False
    edges: list[RuntimeEdge] | None = None


class RuntimeVsImports(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    runtimeOnly: list[RuntimeEdge] = Field(default_factory=list)
    importOnly: list[RuntimeEdge] = Field(default_factory=list)


class RuntimeSignal(BaseModel):
    model_config = ConfigDict(extra="allow")

    name: str
    value: float
    unit: str
    illustrative: bool | None = None


class RuntimePayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    illustrative: bool | None = None
    callGraph: RuntimeCallGraph | None = None
    vsImports: RuntimeVsImports | None = None
    signals: list[RuntimeSignal] = Field(default_factory=list)



class Clone(BaseModel):
    files: list[str]
    lines: int = 0
    tokens: int = 0
    classification: str | None = None
    services: list[str] = Field(default_factory=list)


class DuplicationPayload(BaseModel):
    clones: list[Clone] = Field(default_factory=list)
    percentage: float = 0


class DependencyMetrics(BaseModel):
    modules: int = 0
    dependencies: int = 0


class FolderMetric(BaseModel):
    folder: str
    afferentCoupling: float = 0
    efferentCoupling: float = 0
    instability: float = 0
    moduleCount: int | None = None


class ServiceCouplingMetric(BaseModel):
    service: str
    afferentCoupling: float = 0
    efferentCoupling: float = 0


class DependencyCruiserPayload(BaseModel):
    cycles: list[dict[str, object]] = Field(default_factory=list)
    orphans: list[str] = Field(default_factory=list)
    violations: list[dict[str, object]] = Field(default_factory=list)
    metrics: DependencyMetrics = Field(default_factory=DependencyMetrics)
    folderMetrics: list[FolderMetric] = Field(default_factory=list)
    serviceMetrics: list[ServiceCouplingMetric] = Field(default_factory=list)


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
    services: list[str] = Field(default_factory=list)
    dependencyCruiser: DependencyCruiserPayload = Field(
        default_factory=DependencyCruiserPayload
    )
    duplication: DuplicationPayload = Field(default_factory=DuplicationPayload)
    recentCommits: list[RecentCommit] = Field(default_factory=list)
    changedFiles: list[str] = Field(default_factory=list)
    priorServiceMetrics: list[ServiceCouplingMetric] = Field(default_factory=list)
    priorDuplicationCounts: DuplicationCounts | None = None
    ruleSetVersion: int = 1


class DuplicationCounts(BaseModel):
    internal: int = 0
    crossService: int = 0
    shared: int = 0
    internalByService: dict[str, int] = Field(default_factory=dict)


class RunMetrics(BaseModel):
    modules: int
    dependencies: int
    duplicationPercentage: float = 0
    orphanCount: int = 0
    cycleCount: int = 0
    folderInstability: dict[str, float] = Field(default_factory=dict)
    duplicationCounts: DuplicationCounts = Field(default_factory=DuplicationCounts)
    serviceCoupling: list[ServiceCouplingMetric] = Field(default_factory=list)
    runtimeEdges: list[RuntimeEdge] = Field(default_factory=list)


class CharacteristicScore(BaseModel):
    id: str
    score: int
    signalsUsed: list[str]
    suppressedBy: list[str] | None = None


class ServiceScore(BaseModel):
    service: str
    overall: int
    characteristics: list[CharacteristicScore]


class ScoreResult(BaseModel):
    overall: int
    characteristics: list[CharacteristicScore]
    services: list[ServiceScore] = Field(default_factory=list)


class CharacteristicRead(BaseModel):
    id: str
    score: int
    reasoning: str
    recommendations: list[str]
    signalsUsed: list[str]
    suppressedBy: list[str] | None = None


class ServiceRead(BaseModel):
    service: str
    overall: int
    characteristics: list[CharacteristicRead]


class HealthRead(BaseModel):
    runId: str
    commitSha: str
    overall: int
    characteristics: list[CharacteristicRead]
    reasoner: str
    traceId: str | None = None
    metrics: RunMetrics | None = None
    state: str = "current"
    supersededAt: str | None = None
    supersededBy: str | None = None
    services: list[ServiceRead] = Field(default_factory=list)
    ruleSetVersion: int = 1


class Narrative(BaseModel):
    id: str
    reasoning: str
    recommendations: list[str]
