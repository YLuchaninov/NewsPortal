import {
  readIdentifier,
  assert,
  firstResultLine,
  pushEvidence,
  sqlLiteral,
} from "./shared.mjs";

export async function scenarioFunnelAutopilotFlows(harness) {
  const evidence = [];
  const token = harness.tokens.config.token;
  const suffix = harness.runId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const idea = `large company has legacy migration backlog and wants long-term implementation support ${suffix}`;
  let funnelId = "";

  const beforeList = await harness.mcpToolCall(token, "operator.funnels.list", {
    page: 1,
    pageSize: 20,
  });
  assert(Array.isArray(beforeList.items), "operator.funnels.list must return items.");

  const created = await harness.mcpToolCall(token, "operator.funnels.create", {
    name: `MCP deterministic funnel ${suffix}`,
    goal: idea,
    status: "draft",
    createdFromIdeaJson: {
      source: "mcp-http-deterministic",
      idea,
    },
    defaultPolicyJson: {
      autopilotVersion: "2.0",
      manualTuningAllowed: true,
    },
  });
  funnelId = readIdentifier(created, ["funnelId", "funnel_id"]);
  assert(funnelId, "operator.funnels.create must return funnelId.");

  harness.addCleanup("archive-funnel-autopilot-canary", async () => {
    if (!funnelId) {
      return;
    }
    await harness.mcpToolCall(token, "operator.funnels.archive", {
      funnelId,
      confirm: true,
    }).catch(() => null);
  });

  const readCreated = await harness.mcpToolCall(token, "operator.funnels.read", { funnelId });
  assert(
    readIdentifier(readCreated, ["funnelId", "funnel_id"]) === funnelId,
    "operator.funnels.read must return the created funnel."
  );

  await harness.mcpToolCall(token, "operator.funnels.update", {
    funnelId,
    status: "active",
    defaultPolicyJson: {
      autopilotVersion: "2.0",
      deterministicProof: true,
    },
  });

  const plan = await harness.mcpToolCall(token, "operator.funnel.autoplan", {
    idea,
    funnelId,
    operatorExperience: "novice",
  });
  assert(plan?.suggestedAction === "attach_existing", "operator.funnel.autoplan should attach to the scoped funnel.");
  assert(Array.isArray(plan?.lanes) && plan.lanes.length > 0, "operator.funnel.autoplan must produce lanes.");

  const validation = await harness.mcpToolCall(token, "operator.funnel.validate_plan", {
    plan,
    expectedLiveStateHash: plan.liveStateHash,
  });
  assert(validation?.status === "ready", "operator.funnel.validate_plan should accept the deterministic hidden-intent plan.");

  const staged = await harness.mcpToolCall(token, "operator.funnel.stage_plan", {
    funnelId,
    plan,
    expectedLiveStateHash: plan.liveStateHash,
  });
  assert(staged?.status === "staged", "operator.funnel.stage_plan should stage a validated plan.");
  assert(staged?.planId, "operator.funnel.stage_plan must return planId.");
  assert(
    Array.isArray(staged?.lanes) && staged.lanes.length > 0,
    "operator.funnel.stage_plan must materialize scoped lane skeletons."
  );

  const scopedLaneId = readIdentifier(staged.lanes[0], ["laneId", "lane_id"]);
  assert(scopedLaneId, "operator.funnel.stage_plan materialized lane must include laneId.");

  const scopedDiscoveryRun = await harness.mcpToolCall(harness.tokens.discovery.token, "discovery.runs.create", {
    funnelId,
    laneId: scopedLaneId,
    changeMode: "manual_tuning",
    configurationScope: "funnel",
    verificationTarget: "source_health",
    runKind: "candidate_acquisition",
    triggerKind: "mcp",
    request: {
      source: "mcp-http-deterministic-funnel-autopilot",
      idea,
    },
    budget: {
      liveProviderExecution: false,
      maxCandidates: 0,
    },
  });
  const scopedDiscoveryRunId = readIdentifier(scopedDiscoveryRun, ["vnext_run_id", "vnextRunId", "run_id", "runId"]);
  assert(scopedDiscoveryRunId, "Scoped discovery.runs.create must return a run id.");
  assert(
    scopedDiscoveryRun?.funnelWriteContext?.funnelId === funnelId,
    "Scoped discovery.runs.create must echo funnel write context."
  );
  assert(
    Array.isArray(scopedDiscoveryRun?.funnelReadBack),
    "Scoped discovery.runs.create must include funnel read-back guidance."
  );

  const scopedInterest = await harness.mcpToolCall(token, "system_interests.create", {
    funnelId,
    laneId: scopedLaneId,
    changeMode: "manual_tuning",
    configurationScope: "funnel",
    verificationTarget: "selection",
    payload: {
      name: `MCP Funnel Scoped Interest ${suffix}`,
      description: "Deterministic funnel-scoped manual tuning interest.",
      positive_texts: ["long-term implementation partner", "legacy migration support"],
      negative_texts: ["tutorial", "vendor directory"],
      must_have_terms: "",
      must_not_have_terms: "tutorial, top vendors",
      places: "",
      languages_allowed: ["en"],
      time_window_hours: "",
      allowed_content_kinds: "editorial, document",
      short_tokens_required: "",
      short_tokens_forbidden: "",
      candidate_positive_signal_groups: [
        {
          name: "long_term_delivery_need",
          tier: "project_intent",
          cues: ["long-term implementation partner", "legacy migration support"],
        },
      ],
      candidate_negative_signal_groups: [
        {
          name: "generic_learning_content",
          tier: "context",
          cues: ["tutorial", "how to choose a vendor"],
        },
      ],
      selection_profile_signal_visibility: "hidden_intent",
      selection_profile_auto_select_mode: "llm_approved",
      selection_profile_auto_select_min_positive_groups: 2,
      selection_profile_auto_select_min_cue_hits: 3,
      selection_profile_auto_select_requires_no_noise: true,
      selection_profile_auto_select_requires_no_technical_veto: true,
      selection_profile_strictness: "balanced",
      selection_profile_unresolved_decision: "hold",
      selection_profile_llm_review_mode: "always",
      priority: "0.8",
      isActive: true,
    },
  });
  const scopedInterestTemplateId = String(scopedInterest.entityId ?? scopedInterest.interestTemplateId ?? "");
  assert(scopedInterestTemplateId, "Scoped system_interests.create must return an interest template id.");
  assert(scopedInterest?.funnelBinding?.bound === true, "Scoped system_interests.create must bind to the funnel.");
  assert(
    scopedInterest.funnelBinding.laneId === scopedLaneId,
    "Scoped system_interests.create must bind to the staged lane."
  );
  assert(
    Array.isArray(scopedInterest?.funnelReadBack),
    "Scoped system_interests.create must include funnel read-back guidance."
  );
  assert(
    scopedInterest?.funnelWriteContext?.changeMode === "manual_tuning",
    "Scoped system_interests.create must echo guarded funnel write context."
  );
  harness.addCleanup("delete-funnel-scoped-system-interest", async () => {
    await harness.mcpToolCall(token, "system_interests.delete", {
      interestTemplateId: scopedInterestTemplateId,
      confirm: true,
    }).catch(() => null);
  });
  await harness.mcpToolCall(token, "system_interests.archive", {
    interestTemplateId: scopedInterestTemplateId,
    confirm: true,
  });

  const verified = await harness.mcpToolCall(token, "operator.funnel.verify", {
    funnelId,
    includeSamples: true,
  });
  assert(
    Number(verified?.counts?.funnelCount ?? verified?.counts?.funnel_count ?? 0) >= 1,
    "operator.funnel.verify must report at least the scoped funnel."
  );

  const selectionReport = await harness.mcpToolCall(token, "operator.report.verify", {
    reportKind: "selection",
    entityIds: {
      funnelIds: [funnelId],
    },
    includeSamples: true,
  });
  assert(
    Array.isArray(selectionReport?.funnelScope?.verifications),
    "operator.report.verify selection must include funnel-scoped verification when funnelIds are supplied."
  );

  const scopedSignalCandidates = await harness.mcpToolCall(token, "signal_candidates.list", {
    funnelId,
    page: 1,
    pageSize: 5,
  });
  assert(
    Array.isArray(scopedSignalCandidates?.items),
    "signal_candidates.list must accept funnelId and return a funnel-scoped item collection."
  );
  const scopedContentItems = await harness.mcpToolCall(token, "content_items.list", {
    funnelId,
    page: 1,
    pageSize: 5,
  });
  assert(
    Array.isArray(scopedContentItems?.items),
    "content_items.list must accept funnelId and return a funnel-scoped item collection."
  );

  const targetReplayDocId = firstResultLine(
    await harness.queryPostgres(`
      select doc_id::text
      from public.signal_candidates
      order by created_at desc
      limit 1;
    `)
  );
  assert(targetReplayDocId, "funnel scoped replay proof needs one existing signal_candidate docId.");

  const scopedReindexPlan = await harness.mcpToolCall(token, "operator.selection.reindex_plan", {
    funnelId,
    laneId: scopedLaneId,
    funnelPlanId: staged.planId,
    planFingerprint: staged.planFingerprint,
    chunkSize: 1,
    maxDocIds: 1,
    includeSamples: true,
    reason: "deterministic funnel-scoped replay proof",
  });
  assert(
    JSON.stringify(scopedReindexPlan).includes("maintenance.reindex.request") &&
      JSON.stringify(scopedReindexPlan).includes(funnelId),
    "operator.selection.reindex_plan must produce funnel-scoped reindex request templates."
  );

  const scopedReplay = await harness.mcpToolCall(
    harness.tokens.automation.token,
    "maintenance.reindex.request",
    {
      funnelId,
      laneId: scopedLaneId,
      funnelPlanId: staged.planId,
      planFingerprint: staged.planFingerprint,
      changeMode: "manual_tuning",
      configurationScope: "funnel",
      verificationTarget: "replay",
      payload: {
        indexName: "interest_centroids",
        jobKind: "backfill",
        options: {
          docIds: [targetReplayDocId],
          reason: "deterministic funnel-scoped replay proof",
        },
      },
    }
  );
  const scopedReplayJobId = String(scopedReplay.reindexJobId ?? scopedReplay.reindex_job_id ?? "");
  assert(scopedReplayJobId, "Scoped maintenance.reindex.request must return a reindex job id.");
  assert(scopedReplay?.funnelReplayBinding?.bound === true, "Scoped replay must bind the reindex job to the funnel.");
  assert(
    Array.isArray(scopedReplay?.funnelReadBack),
    "Scoped replay must include funnel read-back guidance."
  );
  const replayBindingCount = Number(
    firstResultLine(
      await harness.queryPostgres(`
        select count(*)::int
        from public.funnel_reindex_job_bindings
        where funnel_id = ${sqlLiteral(funnelId)}::uuid
          and reindex_job_id = ${sqlLiteral(scopedReplayJobId)}::uuid;
      `)
    ) ?? 0
  );
  assert(replayBindingCount === 1, "Scoped replay binding row must exist.");

  const overlap = await harness.mcpToolCall(token, "operator.funnels.overlap.audit", {
    funnelIds: [funnelId],
    includeSamples: true,
  });
  assert(
    Array.isArray(overlap?.sharedSystemInterests),
    "operator.funnels.overlap.audit must return sharedSystemInterests."
  );

  const archived = await harness.mcpToolCall(token, "operator.funnels.archive", {
    funnelId,
    confirm: true,
  });
  assert(
    readIdentifier(archived, ["funnelId", "funnel_id"]) === funnelId,
    "operator.funnels.archive must return the archived funnel."
  );

  pushEvidence(evidence, "funnel-autopilot-canary", {
    funnelId,
    laneTypes: plan.lanes.map((lane) => lane.laneType),
    stagedLaneCount: staged.lanes.length,
    planId: staged.planId,
    validationStatus: validation.status,
    scopedDiscoveryRunId,
    scopedInterestTemplateId,
    scopedInterestBindingRole: scopedInterest.funnelBinding.bindingRole,
    scopedReplayJobId,
    replayBindingCount,
    verifyCounts: verified.counts,
    reportFunnelVerificationCount: selectionReport.funnelScope.verifications.length,
    scopedSignalCandidateCount: Number(scopedSignalCandidates.total ?? 0),
    scopedContentItemCount: Number(scopedContentItems.total ?? 0),
    sharedSystemInterestCount: overlap.sharedSystemInterests.length,
  });

  return {
    key: "funnel-autopilot-flows",
    summary: "Covered Funnel Autopilot 2.0 MCP list/read/create/update/archive plus autoplan, lane staging, guarded scoped discovery provenance, guarded scoped manual tuning, scoped content reads, scoped bounded replay, selection report verify and overlap audit.",
    evidence,
  };
}
