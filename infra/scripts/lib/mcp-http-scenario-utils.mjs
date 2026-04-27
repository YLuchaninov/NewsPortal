import { extractFirstObjectRow } from "./mcp-http-testkit.mjs";

export { extractFirstObjectRow };

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function readJsonRpcErrorMessage(payload) {
  return String(payload?.error?.message ?? payload?.error ?? "").trim();
}

export function assertClientError(response, label) {
  assert(
    Number(response?.status ?? 0) >= 400 && Number(response?.status ?? 0) < 500,
    `${label} should fail with a 4xx client error, got ${response?.status ?? "unknown"}.`
  );
}

export function normalizeStatus(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function hasContentArray(result) {
  return Array.isArray(result?.result?.contents) && result.result.contents.length > 0;
}

export function buildPromptArguments(name, runId) {
  switch (name) {
    case "operator.session.start":
      return {
        objective: `review article residual diagnostics ${runId}`,
        domain: "article diagnostics",
      };
    case "sequences.session.plan":
      return {
        objective: `review deterministic sequence flows ${runId}`,
      };
    case "discovery.session.plan":
      return {
        objective: `review deterministic discovery flows ${runId}`,
      };
    case "system_interests.session.plan":
      return {
        topic: `operator residual tuning ${runId}`,
      };
    case "llm_templates.session.plan":
      return {
        templateIntent: `improve residual explainability guidance ${runId}`,
      };
    case "channels.session.plan":
      return {
        source: `deterministic source ${runId}`,
      };
    case "observability.session.plan":
      return {
        question: `why did deterministic MCP coverage change for ${runId}`,
      };
    case "system_interest.create":
      return {
        topic: `MCP operator monitoring ${runId}`,
        audience: "operators",
      };
    case "system_interest.polish":
      return {
        interestName: `Operator interest ${runId}`,
        residualPattern: "semantic_rejected repeated across explainable article residuals",
      };
    case "llm_template.tune":
      return {
        templateName: `Operator template ${runId}`,
        residualPattern: "llm_review_pending repeated in gray-zone article residuals",
      };
    case "discovery.profile.tune":
      return {
        profileName: `Operator profile ${runId}`,
        residualPattern: "gray_zone_hold repeated after recall-style candidate recovery",
      };
    case "discovery.mission.review":
      return {
        missionTitle: `Review live mission ${runId}`,
        goal: "find net-new high-signal sources",
      };
    case "sequence.draft":
      return {
        objective: `validate deterministic MCP matrix ${runId}`,
      };
    case "cleanup.guidance":
      return {
        scope: `deterministic MCP HTTP proof ${runId}`,
      };
    default:
      return {};
  }
}

export function readRows(payload) {
  const row = extractFirstObjectRow(payload);
  if (!row) {
    return [];
  }
  const arrays = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") {
      return;
    }
    if (Array.isArray(value)) {
      if (value.every((entry) => entry && typeof entry === "object" && !Array.isArray(entry))) {
        arrays.push(value);
      }
      for (const entry of value) {
        visit(entry);
      }
      return;
    }
    for (const nested of Object.values(value)) {
      visit(nested);
    }
  };
  visit(payload);
  return arrays[0] ?? [];
}

export function readFirstRow(payload) {
  const rows = readRows(payload);
  return rows[0] ?? null;
}

export function pushEvidence(evidence, label, details) {
  evidence.push({
    label,
    details,
  });
}

export function sqlLiteral(value) {
  if (value === null || value === undefined) {
    return "null";
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function firstResultLine(output) {
  return String(output ?? "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)[0] ?? "";
}
