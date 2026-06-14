import {
  assert,
  pushEvidence,
  sqlLiteral,
} from "./shared.mjs";

export async function scenarioIngressAdapterOperatorFlows(harness) {
  const evidence = [];
  const token = harness.tokens.config.token;
  const runKey = harness.runId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const adapterKey = `api.mcp_operator_${runKey}`;

  await harness.mcpToolCall(token, "ingress.adapters.list", { providerType: "api" });
  await harness.mcpToolCall(token, "ingress.adapters.read", { adapterKey: "api.generic_json_mapping" });
  const fallbackReportBefore = await harness.mcpToolCall(token, "ingress.adapters.legacy_fallback_report", {});
  assert(
    fallbackReportBefore.totals && typeof fallbackReportBefore.totals === "object",
    "ingress.adapters.legacy_fallback_report must return totals."
  );
  assert(
    Array.isArray(fallbackReportBefore.channels),
    "ingress.adapters.legacy_fallback_report must include channel-level readiness evidence."
  );
  assert(
    Number(fallbackReportBefore.totals.lastRunLegacyConfigCount ?? 0) === 0,
    "Clean MCP ingress adapter scenario expects zero legacy_config fetch-run resolutions."
  );
  const created = await harness.mcpToolCall(token, "ingress.adapters.create_declarative", {
    payload: {
      adapterKey,
      providerType: "api",
      title: `MCP operator JSON API ${harness.runId}`,
      description: "Deterministic MCP coverage adapter.",
      outputMode: "signal_candidates",
      status: "draft",
      matchRules: { urlHostContains: ["example.com"], allowAutoSelect: false },
      configSchema: {},
      recipe: {
        request: { method: "GET" },
        response: { format: "json" },
        pagination: { mode: "none", maxPagesPerPoll: 1 },
        items: "items",
        map: { title: "title", url: "url", externalId: "id" },
      },
      metadata: { scenario: "ingress-adapter-operator-flows" },
    },
  });
  assert(created.created === true, "ingress.adapters.create_declarative must create a row.");
  await harness.mcpToolCall(token, "ingress.adapters.update_declarative", {
    adapterKey,
    payload: {
      title: `MCP operator JSON API ${harness.runId} updated`,
      status: "active",
      metadata: { scenario: "ingress-adapter-operator-flows", updated: true },
    },
  });
  await harness.mcpToolCall(token, "ingress.adapters.read", { adapterKey });

  const dryRun = await harness.mcpToolCall(token, "ingress.adapters.dry_run", {
    adapterKey: "website.generic_discovery",
    providerType: "website",
  });
  assert(dryRun.status === "unsupported", "Non-API dry-run should return unsupported without writes.");

  const channel = await harness.mcpToolCall(token, "channels.create", {
    payload: {
      providerType: "api",
      name: `MCP adapter channel ${harness.runId}`,
      fetchUrl: `https://example.com/${runKey}/items.json`,
      language: "en",
      isActive: true,
      itemsPath: "items",
      titleField: "title",
      urlField: "url",
      externalIdField: "id",
    },
  });
  const channelId = String(channel.channelId ?? channel.createdChannelIds?.[0] ?? "");
  assert(channelId, "channels.create must return a channel id for ingress adapter scenario.");

  harness.addCleanup("delete-ingress-adapter-operator-flow-rows", async () => {
    await harness.queryPostgres(`
      delete from source_channel_adapter_binding where channel_id = ${sqlLiteral(channelId)};
      delete from source_channels where channel_id = ${sqlLiteral(channelId)};
      delete from ingress_adapter_catalog where adapter_key = ${sqlLiteral(adapterKey)};
    `);
  });

  const initialBinding = await harness.mcpToolCall(token, "ingress.bindings.read", { channelId });
  await harness.mcpToolCall(token, "ingress.adapters.recommend_for_channel", { channelId });
  const bindingAfterRecommend = await harness.mcpToolCall(token, "ingress.bindings.read", { channelId });
  assert(
    initialBinding.adapter_key === bindingAfterRecommend.adapter_key ||
      initialBinding.adapterKey === bindingAfterRecommend.adapterKey,
    "ingress.adapters.recommend_for_channel must not mutate the current binding."
  );

  await harness.mcpToolCall(token, "ingress.bindings.set", {
    channelId,
    adapterKey,
    config: { maxItemsPerPoll: 3 },
    selectionMode: "mcp",
    selectionReason: "deterministic MCP operator scenario",
  });
  const updatedBinding = await harness.mcpToolCall(token, "ingress.bindings.read", { channelId });
  assert(
    updatedBinding.adapter_key === adapterKey || updatedBinding.adapterKey === adapterKey,
    "ingress.bindings.set must attach the requested adapter."
  );
  await harness.mcpToolCall(token, "ingress.bindings.delete", { channelId });

  pushEvidence(evidence, "adapter-key", adapterKey);
  pushEvidence(evidence, "channel-id", channelId);
  pushEvidence(evidence, "dry-run-status", dryRun.status);
  pushEvidence(evidence, "legacy-fallback-report-status", fallbackReportBefore.status);

  return {
    key: "ingress-adapter-operator-flows",
    summary: "Covered ingress adapter catalog, binding, recommendation, and dry-run MCP operator tools.",
    evidence,
  };
}
