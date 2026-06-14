import { isRecord, normalizeText } from "./shared";

const PROJECT_INTENT_MARKERS = [
  "request for proposal",
  "request for quote",
  "rfp",
  "rfq",
  "tender",
  "bid",
  "procurement",
  "proposal",
  "quote",
  "looking for",
  "need help",
  "seeking",
  "wanted",
  "vendor selection",
  "implementation partner",
  "migration partner",
];

const DELIVERY_OBJECT_MARKERS = [
  "implementation",
  "migration",
  "integration",
  "replacement",
  "custom app",
  "portal",
  "platform",
  "software",
  "website",
  "crm",
  "erp",
  "api",
  "automation",
  "dashboard",
  "developer",
  "contractor",
];

const COMMITMENT_MARKERS = [
  "budget",
  "fixed price",
  "deadline",
  "due date",
  "submission",
  "contact",
  "contract",
  "award",
  "posted",
  "open for proposals",
  "proposals",
  "bids",
  "scope",
];

const SELECTION_NOISE_MARKERS = [
  "how to ",
  "guide to ",
  "what is ",
  "why ",
  "top ",
  "best ",
  "directory",
  "profile",
  "case study",
  "award winner",
  "thought leadership",
  "guest post",
  "browse jobs",
  "search results",
  "tag/",
  "filters=tag",
];

function rowText(row: Record<string, unknown>): string {
  return normalizeText(
    [
      row.title,
      row.lead,
      row.url,
    ].join(" ")
  );
}

export function selectionEvidenceGroups(row: Record<string, unknown>) {
  const text = rowText(row);
  const projectMarkers = PROJECT_INTENT_MARKERS.filter((marker) => text.includes(marker));
  const deliveryMarkers = DELIVERY_OBJECT_MARKERS.filter((marker) => text.includes(marker));
  const commitmentMarkers = COMMITMENT_MARKERS.filter((marker) => text.includes(marker));
  const noiseMarkers = SELECTION_NOISE_MARKERS.filter((marker) => text.includes(marker));
  const filterReasonCounts = isRecord(row.finalSelectionExplain)
    && isRecord(row.finalSelectionExplain.semanticSignalSummary)
    && isRecord(row.finalSelectionExplain.semanticSignalSummary.filterReasonCounts)
    ? row.finalSelectionExplain.semanticSignalSummary.filterReasonCounts
    : {};
  const filterReasons = Object.keys(filterReasonCounts).filter((key) => Number(filterReasonCounts[key]) > 0);
  const selectionReason = String(row.selectionReason ?? "");
  const totalFilterCount = Number(row.totalFilterCount ?? 0);
  const matchedFilterCount = Number(row.matchedFilterCount ?? 0);
  const candidateSignalTier = String(row.candidateSignalTier ?? "");
  const professionalNetworkNoise =
    /linkedin\.[^/\s]+\/(pulse|in|jobs)\b/u.test(text)
    || (/linkedin\.[^/\s]+\/posts\b/u.test(text) && /\b(job|hiring|salary|apply now)\b/u.test(text));
  const hasProjectIntent = projectMarkers.length > 0;
  const hasDeliveryObject = deliveryMarkers.length > 0;
  const hasCommitment = commitmentMarkers.length > 0;
  const hasItemLevelEvidence = hasProjectIntent && hasDeliveryObject;
  const stalePassThrough =
    selectionReason === "pass_through" || (totalFilterCount === 0 && matchedFilterCount === 0);
  const documentShapeVeto = filterReasons.some((reason) =>
    [
      "directory_listicle_noise",
      "jobs_only_post_noise",
      "professional_network_post_noise",
      "repo_internal_change_noise",
      "wrapper_directory_noise",
    ].includes(reason)
  );
  const wrapperNoise =
    documentShapeVeto
    || professionalNetworkNoise
    || (noiseMarkers.length > 0 && !hasItemLevelEvidence);
  return {
    projectMarkers,
    deliveryMarkers,
    commitmentMarkers,
    noiseMarkers,
    filterReasons,
    professionalNetworkNoise,
    stalePassThrough,
    wrapperNoise,
    candidateSignalTier,
    hasItemLevelEvidence,
    hasStrongEvidence: hasItemLevelEvidence && hasCommitment,
  };
}

export function classifySelectionPrecisionRow(row: Record<string, unknown>) {
  const groups = selectionEvidenceGroups(row);
  const whySelected = String(row.selectionReason ?? "unknown");
  if (groups.stalePassThrough || groups.wrapperNoise) {
    return {
      outcome: "noise",
      whySelected,
      vetoMissed: groups.stalePassThrough ? "stale_pass_through" : "negative_veto_missed",
      evidence: groups,
    };
  }
  if (groups.hasStrongEvidence) {
    return {
      outcome: "strong_project_signal",
      whySelected,
      vetoMissed: null,
      evidence: groups,
    };
  }
  if (groups.hasItemLevelEvidence) {
    return {
      outcome: "probable_signal",
      whySelected,
      vetoMissed: null,
      evidence: groups,
    };
  }
  return {
    outcome: "context_only",
    whySelected,
    vetoMissed: "selected_without_item_level_buyer_project_evidence",
    evidence: groups,
  };
}
