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


class AnalysisPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    runId: str
    commitSha: str
    commitMessage: str
    timestamp: str
    archTests: list[ArchTestResult]
    runtime: RuntimePayload


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


class Narrative(BaseModel):
    id: str
    reasoning: str
    recommendations: list[str]
