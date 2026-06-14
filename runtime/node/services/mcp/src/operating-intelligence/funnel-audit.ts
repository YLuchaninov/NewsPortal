import type { Pool } from "pg";
import { readOptionalString } from "../protocol";
import type { McpToolContext } from "../tools/shared";
import { compactStringList, normalizeText, uniqueStrings } from "./shared";

function hasAnyText(text: string, needles: readonly string[]): boolean {
  const normalized = normalizeText(text);
  return needles.some((needle) => normalized.includes(normalizeText(needle)));
}

function buildReferenceFunnelSpec(args: Record<string, unknown>) {
  const objective = readOptionalString(args.objective) ?? "calibrated rare-signal funnel";
  const referenceEvidenceKind = readOptionalString(args.referenceEvidenceKind) ?? "reference_text";
  const referenceBundleKey = normalizeText(args.referenceBundleKey);
  const referenceText = [
    readOptionalString(args.referenceText) ?? "",
    referenceBundleKey,
  ].join(" ");
  const reference = normalizeText(referenceText);
  const rareSignal = hasAnyText(reference, [
    "rare",
    "hidden",
    "crumb",
    "low-yield",
    "buyer-side",
    "procurement",
    "marketplace project",
  ]);
  const contentKinds = uniqueStrings([
    "editorial",
    "listing",
    ...(hasAnyText(reference, ["procurement", "tender", "contract notice", "document"]) ? ["document"] : []),
    ...(hasAnyText(reference, ["api_payload", "api-like", "api payload"]) ? ["api_payload"] : []),
    ...(hasAnyText(reference, ["data_file", "dataset", "csv"]) ? ["data_file"] : []),
  ]);
  const guardrails = [
    {
      key: "direct_request_over_wrapper",
      requiredWhenReferenceMentions: ["marketplace", "wrapper", "project card"],
      phraseHints: ["wrapper", "marketplace", "direct buyer", "primary signal"],
    },
    {
      key: "seller_authored_rejection",
      requiredWhenReferenceMentions: ["seller", "agency", "vendor landing", "profile"],
      phraseHints: ["seller", "self-promotion", "agency page", "profile"],
    },
    {
      key: "formal_notice_without_exact_keyword",
      requiredWhenReferenceMentions: ["tender", "procurement", "contract notice"],
      phraseHints: ["formal", "tender", "contract notice", "procurement", "exact words"],
    },
    {
      key: "bland_title_body_evidence",
      requiredWhenReferenceMentions: ["bland", "competition", "contract notice"],
      phraseHints: ["bland", "title", "body", "procurement details"],
    },
  ].filter((guardrail) =>
    guardrail.requiredWhenReferenceMentions.some((hint) => reference.includes(normalizeText(hint)))
  );
  return {
    objective,
    referenceEvidenceKind,
    referenceBundleKey: readOptionalString(args.referenceBundleKey) ?? null,
    actorModel: rareSignal
      ? "Treat the reference as evidence for a rare-signal funnel: broad acquisition, strict independent content selection, and explicit near-miss rejection."
      : "Treat the reference as calibration evidence for a source-to-selection funnel.",
    hardGatePolicy: {
      mustHaveTermsBaseline: "empty_unless_marker_is_mandatory",
      timeWindowBaseline: "empty_or_null_for_initial_recall",
      broadHardGatesAreRisky: true,
    },
    allowedContentKinds: contentKinds,
    signalFamilies: [
      "direct buyer ask or project request",
      "formal procurement, tender, RFP/RFQ, award, or implementation notice",
      "delivery pressure with concrete implementation, migration, integration, or takeover object",
      "context signal that creates a follow-up hypothesis but is not enough for final selection alone",
    ],
    nearMissNegativeFamilies: [
      "seller-authored marketing, profile, ranking, case study, or award",
      "portal shell, navigation, index, category, or search page without a concrete item",
      "internal hiring or recruiter content",
      "generic topic commentary without an active sourcing event",
    ],
    sourceRoleMatrix: [
      "direct-intent source",
      "context source",
      "community or hidden-signal source",
      "directory or replacement source",
      "adapter-required source",
    ],
    promptGuardrails: guardrails,
    adapterPolicy:
      "API-like, ATS, marketplace, repository, or authenticated sources require adapter/mapping status and must not be disguised as RSS/website.",
    proofGates: [
      "operator.funnel.audit before writes",
      "system_interests.read and llm_templates.read after config changes",
      "maintenance.reindex.request bounded docIds chunks for existing content",
      "operator.report.verify reportKind=funnel_calibration and reportKind=selection after replay",
      "content_items.list for web-visible selected content",
    ],
  };
}

function classifyInterestFamily(row: Record<string, unknown>): string {
  const text = normalizeText(`${row.name ?? ""} ${row.description ?? ""}`);
  if (/procurement|rfp|rfq|tender|contract|award|bid/u.test(text)) return "procurement";
  if (/fund|startup|scaleup|series|seed/u.test(text)) return "funding";
  if (/hiring|capacity|staff|contractor|freelance/u.test(text)) return "capacity";
  if (/migration|integration|implementation|replacement|takeover|legacy/u.test(text)) {
    return "implementation";
  }
  if (/security|compliance|audit|deadline|cve|eol/u.test(text)) return "compliance";
  if (/smb|sme|small business|mid.market|local|chamber|association/u.test(text)) return "smb";
  return "other";
}

function summarizeDrift(
  spec: ReturnType<typeof buildReferenceFunnelSpec>,
  live: {
    interests: Record<string, unknown>[];
    llmTemplates: Record<string, unknown>[];
    discoveryRows: Record<string, unknown>[];
    adapterRows: Record<string, unknown>[];
  }
) {
  const hardGateDrift = live.interests
    .filter((row) => {
      const mustHave = compactStringList(row.mustHaveTerms);
      const shortRequired = compactStringList(row.shortTokensRequired);
      const timeWindow = row.timeWindowHours;
      return mustHave.length > 0 || shortRequired.length > 0 || timeWindow != null;
    })
    .map((row) => ({
      interestTemplateId: row.interestTemplateId,
      name: row.name,
      mustHaveTerms: compactStringList(row.mustHaveTerms),
      shortTokensRequired: compactStringList(row.shortTokensRequired),
      timeWindowHours: row.timeWindowHours,
      risk: "Rare-signal recall-first baselines should avoid broad hard gates until replay proves they are safe.",
    }));

  const expectedKinds = spec.allowedContentKinds;
  const contentKindDrift = live.interests
    .filter((row) => {
      const actual = compactStringList(row.allowedContentKinds);
      return expectedKinds.length > 0 && !expectedKinds.every((kind) => actual.includes(kind));
    })
    .map((row) => ({
      interestTemplateId: row.interestTemplateId,
      name: row.name,
      allowedContentKinds: compactStringList(row.allowedContentKinds),
      missingContentKinds: expectedKinds.filter(
        (kind) => !compactStringList(row.allowedContentKinds).includes(kind)
      ),
    }));

  const promptGuardrailDrift = spec.promptGuardrails
    .map((guardrail) => {
      const missingTemplates = live.llmTemplates
        .filter((row) => row.isActive !== false)
        .filter((row) => !hasAnyText(String(row.templateText ?? ""), guardrail.phraseHints))
        .map((row) => ({
          promptTemplateId: row.promptTemplateId,
          name: row.name,
          scope: row.scope,
        }));
      return {
        guardrail: guardrail.key,
        phraseHints: guardrail.phraseHints,
        missingTemplateCount: missingTemplates.length,
        missingTemplates,
      };
    })
    .filter((row) => row.missingTemplateCount > 0);

  const familyGroups = new Map<string, Record<string, unknown>[]>();
  for (const row of live.interests) {
    const family = classifyInterestFamily(row);
    familyGroups.set(family, [...(familyGroups.get(family) ?? []), row]);
  }
  const duplicateInterestRisk = [...familyGroups.entries()]
    .filter(([, rows]) => rows.length > 3)
    .map(([family, rows]) => ({
      family,
      activeCount: rows.length,
      samples: rows.slice(0, 8).map((row) => ({ interestTemplateId: row.interestTemplateId, name: row.name })),
      risk: "Many active interests in one signal family can split evidence and make calibration harder; consolidate only after retained-test evidence is no longer needed.",
    }));

  const sourceRoleGap = live.discoveryRows.filter((row) => Number(row.missingRoleCount ?? 0) > 0);
  const adapterRequiredGap = live.adapterRows;

  return {
    hardGateDrift,
    contentKindDrift,
    promptGuardrailDrift,
    duplicateInterestRisk,
    sourceRoleGap,
    adapterRequiredGap,
  };
}

function buildFunnelRecommendedActions(
  drift: ReturnType<typeof summarizeDrift>,
  domainPrefix: string | null
) {
  const actions: Array<Record<string, unknown>> = [];
  if (drift.hardGateDrift.length > 0 || drift.contentKindDrift.length > 0) {
    actions.push({
      tool: "system_interests.update",
      reason:
        "Align active calibrated interests with the portable rare-signal funnel policy: broad acquisition, minimal hard gates, explicit negative cues, and enough content kinds for formal evidence.",
      scope: domainPrefix ? { domainPrefix } : "review affected interests from operator.funnel.audit findings",
      payloadGuidance: {
        must_have_terms: [],
        time_window_hours: null,
        allowed_content_kinds: "preserve current valid kinds and add missing evidence kinds only where the signal family needs them",
      },
    });
  }
  if (drift.promptGuardrailDrift.length > 0) {
    actions.push({
      tool: "llm_templates.update",
      reason:
        "Add missing LLM guardrails from the portable reference spec without changing source health or vNext routing independence.",
      payloadGuidance: {
        guardrails:
          "direct request beats wrapper noise; seller-authored pages reject; formal notices can be valid without exact keywords; bland titles can pass when body has concrete evidence",
      },
    });
  }
  if (drift.adapterRequiredGap.length > 0) {
    actions.push({
      tool: "channels.alternatives.plan",
      reason:
        "Adapter-required/API-like candidates should be repaired or mapped through alternatives/adapters, not forced into RSS/website onboarding.",
    });
  }
  actions.push(
    {
      tool: "signal_candidates.residuals.list",
      reason: "Choose bounded gray/hold docId chunks only after calibration drift is understood.",
      arguments: { selectionMode: "hold", pageSize: 100 },
    },
    {
      tool: "maintenance.reindex.request",
      reason:
        "After MCP/admin config changes, replay existing content in bounded docId chunks and verify every chunk.",
      arguments: {
        payload: {
          indexName: "interest_centroids",
          jobKind: "backfill",
          options: {
            docIds: ["<bounded-doc-id-list>"],
            batchSize: 100,
            includeEnrichment: false,
            forceEnrichment: false,
            reason: "funnel-calibration-bounded-replay",
          },
        },
      },
    },
    {
      tool: "operator.report.verify",
      arguments: { reportKind: "funnel_calibration", entityIds: {}, includeSamples: true },
      reason: "Verify DB-backed calibration state after each bounded change.",
    }
  );
  return actions;
}

async function readFunnelLiveState(
  pool: Pool,
  options: { domainPrefix: string | null; includeDiscovery: boolean; includeSamples: boolean }
) {
  const domainLike = options.domainPrefix ? `%${options.domainPrefix}%` : null;
  const interestResult = await pool.query<Record<string, unknown>>(
    `
      select
        it.interest_template_id::text as "interestTemplateId",
        it.name,
        it.description,
        it.must_have_terms as "mustHaveTerms",
        it.must_not_have_terms as "mustNotHaveTerms",
        it.short_tokens_required as "shortTokensRequired",
        it.allowed_content_kinds as "allowedContentKinds",
        it.time_window_hours as "timeWindowHours",
        it.places,
        it.languages_allowed as "languagesAllowed",
        sp.definition_json as "definitionJson",
        sp.policy_json as "policyJson",
        it.is_active as "isActive",
        it.updated_at as "updatedAt"
      from interest_templates it
      left join selection_profiles sp on sp.source_interest_template_id = it.interest_template_id
      where it.is_active = true
        and ($1::text is null or it.name ilike $1::text or it.description ilike $1::text)
      order by it.updated_at desc, it.name asc
      limit 250
    `,
    [domainLike]
  );
  const llmResult = await pool.query<Record<string, unknown>>(
    `
      select
        prompt_template_id::text as "promptTemplateId",
        name,
        scope,
        language,
        template_text as "templateText",
        is_active as "isActive",
        updated_at as "updatedAt"
      from llm_prompt_templates
      where is_active = true
        and ($1::text is null or name ilike $1::text or template_text ilike $1::text)
      order by updated_at desc, scope asc, name asc
      limit 100
    `,
    [domainLike]
  );
  const compileRows = await pool.query<Record<string, unknown>>(
    `
      select
        count(*)::int as "activeInterests",
        count(c.criterion_id)::int as "activeInterestsWithCriterion",
        count(*) filter (
          where c.enabled = true
            and c.compiled = true
            and c.compile_status = 'compiled'
            and cc.compile_status = 'compiled'
        )::int as "compiledActiveCriteria",
        count(*) filter (
          where sp.status = 'active'
        )::int as "activeSelectionProfiles"
      from interest_templates it
      left join criteria c on c.source_interest_template_id = it.interest_template_id
      left join criteria_compiled cc on cc.criterion_id = c.criterion_id
      left join selection_profiles sp on sp.source_interest_template_id = it.interest_template_id
      where it.is_active = true
        and ($1::text is null or it.name ilike $1::text or it.description ilike $1::text)
    `,
    [domainLike]
  );
  const selectionRows = await pool.query<Record<string, unknown>>(
    `
      select final_decision as "finalDecision", count(*)::int as count
      from final_selection_results
      group by final_decision
      order by final_decision
    `
  );
  const webVisibleRows = await pool.query<Record<string, unknown>>(
    `
      select
        count(*) filter (where eligible_for_feed = true)::int as "webVisibleEligible",
        count(*) filter (where decision = 'eligible')::int as "eligibleRows",
        count(*) filter (where decision = 'pending_llm')::int as "pendingLlmRows",
        count(*)::int as "systemFeedRows"
      from system_feed_results
    `
  );
  const staleRows = await pool.query<Record<string, unknown>>(
    `
      select
        count(*) filter (
          where fsr.total_filter_count = 0
            and (
              fsr.is_selected = true
              or fsr.final_decision = 'selected'
              or fsr.compat_system_feed_decision = 'pass_through'
            )
            and not exists (
              select 1
              from interest_filter_results ifr
              where ifr.doc_id = fsr.doc_id
                and ifr.filter_scope = 'system_criterion'
            )
        )::int as "stalePassThroughCount",
        count(*) filter (
          where not exists (
            select 1
            from interest_filter_results ifr
            where ifr.doc_id = fsr.doc_id
              and ifr.filter_scope = 'system_criterion'
          )
        )::int as "missingInterestFilterResults"
      from final_selection_results fsr
    `
  );
  const residualRows = await pool.query<Record<string, unknown>>(
    `
      select
        verification_state as "verificationState",
        final_decision as "finalDecision",
        count(*)::int as count
      from final_selection_results
      group by verification_state, final_decision
      order by final_decision, verification_state
    `
  );
  const discoveryRows = options.includeDiscovery
    ? await pool.query<Record<string, unknown>>(
        `
          select
            source_inventory_id::text as "sourceInventoryId",
            canonical_domain as "canonicalDomain",
            current_state as "currentState",
            current_provider_type as "providerType",
            risk_json as "riskJson",
            updated_at as "updatedAt"
          from source_inventory
          order by updated_at desc
          limit 25
        `
      )
    : { rows: [] };
  const adapterRows = options.includeDiscovery
    ? await pool.query<Record<string, unknown>>(
        `
          select
            adapter_need as "adapterNeed",
            priority,
            status,
            count(*)::int as count
          from adapter_backlog
          group by adapter_need, priority, status
          order by adapter_need, priority, status
          limit 50
        `
      )
    : { rows: [] };

  return {
    domainPrefix: options.domainPrefix,
    interests: interestResult.rows,
    llmTemplates: llmResult.rows,
    compileStatus: compileRows.rows[0] ?? {},
    selectionCounts: selectionRows.rows,
    webVisibility: webVisibleRows.rows[0] ?? {},
    staleSelection: staleRows.rows[0] ?? {},
    residualCounts: residualRows.rows,
    discoveryRows: discoveryRows.rows,
    adapterRows: adapterRows.rows,
    samples: options.includeSamples
      ? {
          interests: interestResult.rows.slice(0, 12).map((row) => ({
            interestTemplateId: row.interestTemplateId,
            name: row.name,
            mustHaveTerms: row.mustHaveTerms,
            timeWindowHours: row.timeWindowHours,
            allowedContentKinds: row.allowedContentKinds,
          })),
          llmTemplates: llmResult.rows.slice(0, 8).map((row) => ({
            promptTemplateId: row.promptTemplateId,
            name: row.name,
            scope: row.scope,
          })),
        }
      : {},
  };
}

export async function buildFunnelAudit(
  context: McpToolContext,
  args: Record<string, unknown>
) {
  const objective = readOptionalString(args.objective) ?? "funnel calibration";
  const domainPrefix = readOptionalString(args.domainPrefix) ?? null;
  const includeDiscovery = args.includeDiscovery !== false;
  const includeSamples = args.includeSamples === true;
  const portableFunnelSpec = buildReferenceFunnelSpec({ ...args, objective });
  const live = await readFunnelLiveState(context.pool, {
    domainPrefix,
    includeDiscovery,
    includeSamples,
  });
  const drift = summarizeDrift(portableFunnelSpec, {
    interests: live.interests,
    llmTemplates: live.llmTemplates,
    discoveryRows: live.discoveryRows,
    adapterRows: live.adapterRows,
  });
  const findings = [
    {
      findingType: "hardGateDrift",
      severity: drift.hardGateDrift.length > 0 ? "warning" : "info",
      count: drift.hardGateDrift.length,
      evidence: includeSamples ? drift.hardGateDrift.slice(0, 20) : drift.hardGateDrift.slice(0, 5),
      interpretation:
        "Rare-signal funnels usually lose recall when broad must-have terms, short-token requirements, or time windows are used as early hard gates.",
    },
    {
      findingType: "contentKindDrift",
      severity: drift.contentKindDrift.length > 0 ? "warning" : "info",
      count: drift.contentKindDrift.length,
      evidence: includeSamples ? drift.contentKindDrift.slice(0, 20) : drift.contentKindDrift.slice(0, 5),
      interpretation:
        "Formal evidence may arrive as listings, documents, data files, or API payloads; content-kind gaps can hide acquisition success before selection.",
    },
    {
      findingType: "promptGuardrailDrift",
      severity: drift.promptGuardrailDrift.length > 0 ? "warning" : "info",
      count: drift.promptGuardrailDrift.length,
      evidence: drift.promptGuardrailDrift,
      interpretation:
        "LLM review should reject wrapper/seller/navigation noise while preserving direct buyer requests and concrete formal notices.",
    },
    {
      findingType: "duplicateInterestRisk",
      severity: drift.duplicateInterestRisk.length > 0 ? "info" : "info",
      count: drift.duplicateInterestRisk.length,
      evidence: drift.duplicateInterestRisk,
      interpretation:
        "Duplicate signal-family interests may be intentional retained-test evidence, but calibration should know when evidence is split across many active copies.",
    },
    {
      findingType: "sourceRoleGap",
      severity: drift.sourceRoleGap.length > 0 ? "warning" : "info",
      count: drift.sourceRoleGap.length,
      evidence: includeSamples ? drift.sourceRoleGap.slice(0, 10) : [],
      interpretation:
        "Discovery vNext inventory or adapter gaps should be handled by source expansion/repair, not by loosening final content selection.",
    },
    {
      findingType: "adapterRequiredGap",
      severity: drift.adapterRequiredGap.length > 0 ? "warning" : "info",
      count: drift.adapterRequiredGap.length,
      evidence: drift.adapterRequiredGap,
      interpretation:
        "API-like or adapter-required candidates need adapters/mapping or alternatives; they should not be forced into fake RSS/website rows.",
    },
  ];
  return {
    generatedAt: new Date().toISOString(),
    objective,
    readOnly: true,
    mutationPolicy:
      "This audit never writes configuration, starts discovery, onboards channels, or queues replay. Apply recommendations only through explicit MCP/admin writes.",
    portableFunnelSpec,
    liveStateSummary: {
      domainPrefix,
      interests: live.interests.length,
      llmTemplates: live.llmTemplates.length,
      compileStatus: live.compileStatus,
      selectionCounts: live.selectionCounts,
      webVisibility: live.webVisibility,
      staleSelection: live.staleSelection,
      residualCounts: live.residualCounts,
      discoveryCoverageRows: live.discoveryRows.length,
      adapterRequiredRows: live.adapterRows.length,
      samples: live.samples,
    },
    findings,
    drift,
    recommendedMcpActions: buildFunnelRecommendedActions(drift, domainPrefix),
    riskNotes: [
      "Reference evidence is calibration input, not canonical runtime truth.",
      "Domain vocabulary must remain in MCP/admin configuration and tests, not hardcoded selection/discovery runtime logic.",
      "Source health and vNext routing telemetry remain independent from signal_candidate selection, ranking, escalation, web visibility, and counts.",
      "If async workers are running, repeat report verification after bounded replay or fetch cycles complete.",
    ],
    nextReadBack: [
      "operator.report.verify reportKind=funnel_calibration",
      "system_interests.compile_status.list",
      "templates.duplicates.audit",
      "signal_candidates.residuals.summary",
      "content_items.list",
    ],
  };
}
