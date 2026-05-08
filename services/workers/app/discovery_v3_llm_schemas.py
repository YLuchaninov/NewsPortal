from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictDiscoveryModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class AssumptionItem(StrictDiscoveryModel):
    text: str
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class ProviderHint(StrictDiscoveryModel):
    providerId: str
    reason: str
    signalModes: list[Literal["direct", "hidden", "mixed"]] = Field(default_factory=list)


class DiscoveryGraphOutput(StrictDiscoveryModel):
    coreTopic: str
    entities: list[str] = Field(default_factory=list)
    aliases: list[str] = Field(default_factory=list)
    subtopics: list[str] = Field(default_factory=list)
    eventTypes: list[str] = Field(default_factory=list)
    directSignalPhrases: list[str] = Field(default_factory=list)
    hiddenSignalPhrases: list[str] = Field(default_factory=list)
    sourceRoleHints: list[str] = Field(default_factory=list)
    geos: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    localizedTerms: dict[str, list[str]] = Field(default_factory=dict)
    negativePatterns: list[str] = Field(default_factory=list)
    providerHints: list[ProviderHint] = Field(default_factory=list)
    assumptions: list[AssumptionItem] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class DiscoveryHypothesisItem(StrictDiscoveryModel):
    hypothesisType: str
    signalMode: Literal["direct", "hidden", "mixed", "provider_discovery", "source_expansion", "replacement"]
    sourceRole: str
    acquisitionTactic: str
    queryText: str | None = None
    seedDomain: str | None = None
    seedUrl: str | None = None
    seedEntity: str | None = None
    providerId: str | None = None
    expectedProviderTypes: list[str] = Field(default_factory=list)
    expectedEndpointKinds: list[str] = Field(default_factory=list)
    endpointPatterns: list[str] = Field(default_factory=list)
    expectedDataShape: str | None = None
    whyThisCouldWork: list[str] = Field(default_factory=list)
    priority: float = Field(default=0.5, ge=0.0, le=1.0)
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    riskScore: float = Field(default=0.5, ge=0.0, le=1.0)


class DiscoveryHypothesisPackOutput(StrictDiscoveryModel):
    hypotheses: list[DiscoveryHypothesisItem] = Field(default_factory=list)
    graphExpansions: dict[str, Any] = Field(default_factory=dict)
    coverageIntent: dict[str, list[str]] = Field(default_factory=dict)


class SkepticCritique(StrictDiscoveryModel):
    hypothesisRef: str
    riskType: str
    severity: float = Field(default=0.0, ge=0.0, le=1.0)
    repairable: bool = True
    reason: str
    suggestedFix: str | None = None


class SkepticRepairPatch(StrictDiscoveryModel):
    hypothesisRef: str
    changeType: str
    patch: dict[str, Any] = Field(default_factory=dict)


class SkepticAddedIdea(StrictDiscoveryModel):
    additionType: str
    sourceRole: str
    signalMode: Literal["direct", "hidden", "mixed"]
    providerId: str | None = None
    queryText: str | None = None
    reason: str
    expectedEvidence: list[str] = Field(default_factory=list)
    recommendedAction: str = "execute"
    priority: float = Field(default=0.5, ge=0.0, le=1.0)
    riskScore: float = Field(default=0.5, ge=0.0, le=1.0)
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)


class SkepticOutput(StrictDiscoveryModel):
    decision: Literal["accept", "repair_required", "manual_review", "reject"] = "accept"
    disagreementScore: float = Field(default=0.0, ge=0.0, le=1.0)
    maxSeverity: float = Field(default=0.0, ge=0.0, le=1.0)
    summary: str = ""
    critiques: list[SkepticCritique] = Field(default_factory=list)
    repairPatches: list[SkepticRepairPatch] = Field(default_factory=list)
    addedIdeas: list[SkepticAddedIdea] = Field(default_factory=list)
    rejectHypotheses: list[dict[str, str]] = Field(default_factory=list)
    manualReviewItems: list[dict[str, str]] = Field(default_factory=list)
    globalWarnings: list[str] = Field(default_factory=list)


class EndpointExplanationOutput(StrictDiscoveryModel):
    whyFound: list[str] = Field(default_factory=list)
    whyNotPromoted: list[str] = Field(default_factory=list)
    missingEvidence: list[str] = Field(default_factory=list)
    deterministicPolicyResult: dict[str, Any] = Field(default_factory=dict)
    nextBestAction: str = "review"


class RunDiagnosisOutput(StrictDiscoveryModel):
    diagnosis: list[dict[str, Any]] = Field(default_factory=list)
    repairPlan: list[dict[str, Any]] = Field(default_factory=list)
    shouldRerun: bool = False
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class ConfigSimplificationOutput(StrictDiscoveryModel):
    title: str
    description: str | None = None
    seedTopics: list[str] = Field(default_factory=list)
    seedEntities: list[str] = Field(default_factory=list)
    seedGeos: list[str] = Field(default_factory=list)
    seedLanguages: list[str] = Field(default_factory=list)
    autopilotProfile: str = "balanced"
    policyHints: dict[str, Any] = Field(default_factory=dict)
    assumptions: list[AssumptionItem] = Field(default_factory=list)
