import {
  mcpBaseUrl,
  postJson,
  assert,
  assertClientError,
  firstResultLine,
  pushEvidence,
  readJsonRpcErrorMessage,
} from "./shared.mjs";

export async function scenarioAuthAndTokenLifecycle(harness) {
  const evidence = [];
  const html = await harness.assertAdminHtml([
    "Issue bounded operator tokens for remote MCP clients",
    "Issue Token",
    "Recent MCP requests",
  ]);

  const analyst = await harness.issueToken({
    label: `analyst-${harness.runId}`,
    scopes: "read",
  });
  const automation = await harness.issueToken({
    label: `automation-${harness.runId}`,
    scopes: "read,write.sequences,write.destructive",
  });
  const discovery = await harness.issueToken({
    label: `discovery-${harness.runId}`,
    scopes: "read,write.discovery,write.channels,write.destructive",
  });
  const config = await harness.issueToken({
    label: `config-${harness.runId}`,
    scopes: "read,write.templates,write.channels,write.funnels,write.destructive",
  });
  const tokenAdmin = await harness.issueToken({
    label: `token-admin-${harness.runId}`,
    scopes: "read,admin.tokens,write.destructive",
  });
  const expired = await harness.issueToken({
    label: `expired-${harness.runId}`,
    scopes: "read",
    expiresAt: "2020-01-01T00:00:00.000Z",
  });
  const revokeCheck = await harness.issueToken({
    label: `revoke-${harness.runId}`,
    scopes: "read",
  });
  const mcpLifecycleCheck = await harness.issueToken({
    label: `mcp-lifecycle-${harness.runId}`,
    scopes: "read",
  });

  harness.tokens = {
    analyst,
    automation,
    discovery,
    config,
    tokenAdmin,
    expired,
    revokeCheck,
    mcpLifecycleCheck,
  };

  assert(html.includes(`analyst-${harness.runId}`) === false, "Pre-issue HTML should not already contain the new token labels.");

  const refreshedHtml = await harness.assertAdminHtml([
    `analyst-${harness.runId}`,
    `automation-${harness.runId}`,
    `discovery-${harness.runId}`,
    `config-${harness.runId}`,
    `token-admin-${harness.runId}`,
  ]);
  assert(
    refreshedHtml.includes("Copy this token now") === false,
    "Server-rendered token workspace must not leak token secrets after issuance."
  );

  const getMcp = await harness.getMcpSummary(analyst.token);
  assert(getMcp.status === 200, "GET /mcp should be reachable with a valid bearer token.");
  assert(Number(getMcp.json?.tools ?? 0) >= 10, "GET /mcp should expose tool summary metadata.");

  const expiredAttempt = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-expired`,
      method: "initialize",
      params: {},
    },
    {
      bearerToken: expired.token,
      expectStatus: 401,
    }
  );
  assert(
    readJsonRpcErrorMessage(expiredAttempt.json).toLowerCase().includes("expired"),
    "Expired MCP token should fail with an expiration error."
  );

  await harness.revokeToken(revokeCheck.tokenRecord.tokenId);
  const revokedAttempt = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-revoked`,
      method: "initialize",
      params: {},
    },
    {
      bearerToken: revokeCheck.token,
      expectStatus: 403,
    }
  );
  assert(
    readJsonRpcErrorMessage(revokedAttempt.json).toLowerCase().includes("revoked"),
    "Revoked MCP token should fail with a revoke error."
  );

  const mcpRevoked = await harness.mcpToolCall(tokenAdmin.token, "admin.mcp_tokens.revoke", {
    tokenId: mcpLifecycleCheck.tokenRecord.tokenId,
    reason: "deterministic MCP token lifecycle proof",
    confirm: true,
  });
  assert(
    mcpRevoked.tokenRecord?.status === "revoked",
    "admin.mcp_tokens.revoke should return a revoked sanitized token record."
  );
  const mcpRevokedAttempt = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-mcp-revoked`,
      method: "initialize",
      params: {},
    },
    {
      bearerToken: mcpLifecycleCheck.token,
      expectStatus: 403,
    }
  );
  assert(
    readJsonRpcErrorMessage(mcpRevokedAttempt.json).toLowerCase().includes("revoked"),
    "Token revoked through MCP should fail on the next request."
  );

  const mcpDeleted = await harness.mcpToolCall(
    tokenAdmin.token,
    "admin.mcp_tokens.delete_revoked",
    {
      tokenId: mcpLifecycleCheck.tokenRecord.tokenId,
      confirm: true,
    }
  );
  assert(
    mcpDeleted.tokenRecord?.tokenId === mcpLifecycleCheck.tokenRecord.tokenId,
    "admin.mcp_tokens.delete_revoked should return the deleted token record."
  );
  const tokenInventory = await harness.mcpToolCall(tokenAdmin.token, "admin.mcp_tokens.list", {});
  assert(
    !tokenInventory.items?.some(
      (item) => item.tokenId === mcpLifecycleCheck.tokenRecord.tokenId
    ),
    "Deleted revoked token should not remain in admin.mcp_tokens.list."
  );

  pushEvidence(evidence, "token-labels", {
    analyst: analyst.tokenRecord.label,
    automation: automation.tokenRecord.label,
    discovery: discovery.tokenRecord.label,
    config: config.tokenRecord.label,
    tokenAdmin: tokenAdmin.tokenRecord.label,
  });
  pushEvidence(evidence, "token-statuses", {
    expiredStatus: expiredAttempt.status,
    revokedStatus: revokedAttempt.status,
    mcpRevokedStatus: mcpRevokedAttempt.status,
    mcpDeletedTokenId: mcpDeleted.tokenRecord?.tokenId,
  });

  return {
    key: "auth-and-token-lifecycle",
    summary: "Issued scoped operator tokens, verified inventory/secret behavior, and rejected expired or revoked access over HTTP.",
    evidence,
  };
}

export async function scenarioNegativeScopeAndDestructivePolicy(harness) {
  const evidence = [];
  const validToken = harness.tokens.analyst.token;
  harness.coverage.tools.add("channels.delete");
  harness.coverage.tools.add("system_interests.delete");

  const missingBearer = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-missing-bearer`,
      method: "initialize",
      params: {},
    },
    {
      expectStatus: 401,
    }
  );
  const malformed = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-malformed-bearer`,
      method: "initialize",
      params: {},
    },
    {
      bearerToken: "npmcp_malformed.invalid",
      expectStatus: 401,
    }
  );

  const destructiveWithoutConfirm = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-missing-confirm`,
      method: "tools/call",
      params: {
        name: "channels.delete",
        arguments: {
          channelId: harness.getEntity("channelId"),
        },
      },
    },
    {
      bearerToken: harness.tokens.config.token,
      expectStatus: 400,
    }
  );

  const destructiveWithoutScope = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-missing-destructive-scope`,
      method: "tools/call",
      params: {
        name: "system_interests.delete",
        arguments: {
          interestTemplateId: harness.getEntity("interestTemplateId"),
          confirm: true,
        },
      },
    },
    {
      bearerToken: validToken,
      expectStatus: 403,
    }
  );

  const invalidPayload = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-invalid-payload`,
      method: "tools/call",
      params: {
        name: "sequences.create",
        arguments: {
          payload: [],
        },
      },
    },
    {
      bearerToken: harness.tokens.automation.token,
      expectStatus: 400,
    }
  );
  const invalidChannelPayload = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-channel-create-missing-fetch-url`,
      method: "tools/call",
      params: {
        name: "channels.create",
        arguments: {
          payload: {
            providerType: "website",
            name: `Invalid website channel ${harness.runId}`,
            websiteUrl: `https://example.com/${harness.runId}/`,
          },
        },
      },
    },
    {
      bearerToken: harness.tokens.config.token,
      expectStatus: 400,
    }
  );
  const invalidBulkOnboardSource = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-bulk-onboard-extra-field-denied`,
      method: "tools/call",
      params: {
        name: "channels.bulk_onboard.plan",
        arguments: {
          sources: [
            {
              providerType: "website",
              name: `Invalid bulk website ${harness.runId}`,
              fetchUrl: `https://example.com/${harness.runId}/bulk-invalid/`,
              websiteUrl: `https://example.com/${harness.runId}/bulk-invalid/`,
            },
          ],
        },
      },
    },
    {
      bearerToken: harness.tokens.config.token,
      expectStatus: 400,
    }
  );
  const invalidDiscoveryArtifactCreatePayload = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-discovery-artifact-nested-payload-denied`,
      method: "tools/call",
      params: {
        name: "discovery.artifacts.create",
        arguments: {
          payload: {
            payload: {
              artifactType: "DiscoveryBrief",
            },
          },
        },
      },
    },
    {
      bearerToken: harness.tokens.discovery.token,
      expectStatus: 400,
    }
  );
  const invalidDiscoveryRunCreatePayload = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-discovery-run-nested-payload-denied`,
      method: "tools/call",
      params: {
        name: "discovery.runs.create",
        arguments: {
          payload: {
            payload: {
              runKind: "full",
            },
          },
        },
      },
    },
    {
      bearerToken: harness.tokens.discovery.token,
      expectStatus: 400,
    }
  );

  const invalidDiscoveryRoutePayload = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-invalid-discovery-review-payload`,
      method: "tools/call",
      params: {
        name: "discovery.route.preview",
        arguments: {
          sourceUnderstanding: "not-an-object",
          payload: {
            reason: "cleanup",
          },
        },
      },
    },
    {
      bearerToken: harness.tokens.discovery.token,
      expectStatus: 400,
    }
  );

  const invalidDiscoveryRollbackPayload = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-invalid-discovery-rollback-payload`,
      method: "tools/call",
      params: {
        name: "discovery.rollback.apply",
        arguments: {
          rollbackGroupId: "00000000-0000-4000-8000-000000000000",
        },
      },
    },
    {
      bearerToken: harness.tokens.discovery.token,
      expectStatus: 400,
    }
  );

  const invalidDiscoveryArtifactJsonString = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-discovery-artifact-json-string-denied`,
      method: "tools/call",
      params: {
        name: "discovery.artifacts.create",
        arguments: {
          artifactType: "DiscoveryBrief",
          payload: JSON.stringify({
            name: "String payload should be rejected",
          }),
        },
      },
    },
    {
      bearerToken: harness.tokens.discovery.token,
      expectStatus: 400,
    }
  );

  const invalidDiscoveryPolicyNestedPayload = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-discovery-policy-nested-payload-denied`,
      method: "tools/call",
      params: {
        name: "discovery.policies.activate",
        arguments: {
          payload: {
            payload: {
              policyName: "bad",
            },
          },
        },
      },
    },
    {
      bearerToken: harness.tokens.discovery.token,
      expectStatus: 400,
    }
  );

  const invalidSequenceCreateExtraPayload = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-sequence-create-extra-field-denied`,
      method: "tools/call",
      params: {
        name: "sequences.create",
        arguments: {
          payload: {
            title: `Invalid sequence ${harness.runId}`,
            taskGraph: [],
            target: "interest_centroids",
          },
        },
      },
    },
    {
      bearerToken: harness.tokens.automation.token,
      expectStatus: 400,
    }
  );

  const invalidTemplateExtraPayload = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-llm-template-extra-field-denied`,
      method: "tools/call",
      params: {
        name: "llm_templates.create",
        arguments: {
          payload: {
            name: `Invalid template ${harness.runId}`,
            templateText: "Do not create.",
            model: "guessed-field",
          },
        },
      },
    },
    {
      bearerToken: harness.tokens.config.token,
      expectStatus: 400,
    }
  );

  const invalidContentPolicyExtraPayload = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-content-policy-extra-field-denied`,
      method: "tools/call",
      params: {
        name: "content_analysis_policies.create",
        arguments: {
          payload: {
            policyKey: `invalid_policy_${harness.runId.replace(/-/g, "_")}`,
            title: "Invalid policy",
            module: "ner",
            payload: {
              nested: true,
            },
          },
        },
      },
    },
    {
      bearerToken: harness.tokens.automation.token,
      expectStatus: 400,
    }
  );

  const invalidDiscoveryFeedbackPayload = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-discovery-feedback-missing-target-denied`,
      method: "tools/call",
      params: {
        name: "discovery.feedback.submit",
        arguments: {
          feedbackType: "approve",
        },
      },
    },
    {
      bearerToken: harness.tokens.discovery.token,
      expectStatus: 400,
    }
  );

  const tokenRevokeWithoutAdminScope = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-token-revoke-missing-admin-scope`,
      method: "tools/call",
      params: {
        name: "admin.mcp_tokens.revoke",
        arguments: {
          tokenId: harness.tokens.analyst.tokenRecord.tokenId,
          reason: "should be denied by scope",
          confirm: true,
        },
      },
    },
    {
      bearerToken: harness.tokens.config.token,
      expectStatus: 403,
    }
  );

  const tokenSelfRevoke = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-token-self-revoke`,
      method: "tools/call",
      params: {
        name: "admin.mcp_tokens.revoke",
        arguments: {
          tokenId: harness.tokens.tokenAdmin.tokenRecord.tokenId,
          reason: "self revoke should be denied",
          confirm: true,
        },
      },
    },
    {
      bearerToken: harness.tokens.tokenAdmin.token,
      expectStatus: 400,
    }
  );

  const systemSequenceId = firstResultLine(
    await harness.queryPostgres(`
      select sequence_id::text
      from public.sequences
      where created_by like 'migration:%'
        and status in ('active', 'draft')
      order by title
      limit 1;
    `)
  );
  assert(systemSequenceId, "Expected at least one migration-owned system sequence for archive denial proof.");
  const systemSequenceArchive = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-system-sequence-archive-denied`,
      method: "tools/call",
      params: {
        name: "sequences.archive",
        arguments: {
          sequenceId: systemSequenceId,
          confirm: true,
        },
      },
    },
    {
      bearerToken: harness.tokens.automation.token,
      expectStatus: 400,
    }
  );

  const defaultReindexSequenceId = firstResultLine(
    await harness.queryPostgres(`
      select sequence_id::text
      from public.sequences
      where title = 'Default Reindex'
        and created_by like 'migration:%'
      limit 1;
    `)
  );
  assert(defaultReindexSequenceId, "Expected migration-owned Default Reindex sequence for manual-run denial proof.");
  const defaultReindexManualRun = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-default-reindex-manual-run-denied`,
      method: "tools/call",
      params: {
        name: "sequences.run",
        arguments: {
          sequenceId: defaultReindexSequenceId,
        },
      },
    },
    {
      bearerToken: harness.tokens.automation.token,
      expectStatus: 400,
    }
  );
  const invalidSequenceRunPayload = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-sequence-run-extra-target-denied`,
      method: "tools/call",
      params: {
        name: "sequences.run",
        arguments: {
          sequenceId: defaultReindexSequenceId,
          payload: {
            target: "interest_centroids",
          },
        },
      },
    },
    {
      bearerToken: harness.tokens.automation.token,
      expectStatus: 400,
    }
  );
  const invalidReindexIndexName = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-reindex-invalid-index-denied`,
      method: "tools/call",
      params: {
        name: "maintenance.reindex.request",
        arguments: {
          payload: {
            indexName: "signal_candidates",
            jobKind: "backfill",
          },
        },
      },
    },
    {
      bearerToken: harness.tokens.automation.token,
      expectStatus: 400,
    }
  );
  const invalidReindexJobKind = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-reindex-invalid-kind-denied`,
      method: "tools/call",
      params: {
        name: "maintenance.reindex.request",
        arguments: {
          payload: {
            indexName: "interest_centroids",
            jobKind: "repair",
          },
        },
      },
    },
    {
      bearerToken: harness.tokens.automation.token,
      expectStatus: 400,
    }
  );

  const unknownMethod = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-unknown-method`,
      method: "method/unknown",
      params: {},
    },
    {
      bearerToken: validToken,
    }
  );
  const unknownTool = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-unknown-tool`,
      method: "tools/call",
      params: {
        name: "unknown.tool",
        arguments: {},
      },
    },
    {
      bearerToken: validToken,
    }
  );
  const unknownResource = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-unknown-resource`,
      method: "resources/read",
      params: {
        uri: "signalops://unknown/resource",
      },
    },
    {
      bearerToken: validToken,
    }
  );
  const unknownPrompt = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-unknown-prompt`,
      method: "prompts/get",
      params: {
        name: "unknown.prompt",
        arguments: {},
      },
    },
    {
      bearerToken: validToken,
    }
  );

  assert(readJsonRpcErrorMessage(missingBearer.json), "Missing bearer token should produce an MCP auth error.");
  assert(
    readJsonRpcErrorMessage(malformed.json).toLowerCase().includes("token"),
    "Malformed bearer token should fail with a token error."
  );
  const destructiveWithoutConfirmMessage = readJsonRpcErrorMessage(
    destructiveWithoutConfirm.json
  ).toLowerCase();
  const destructiveWithoutScopeMessage = readJsonRpcErrorMessage(
    destructiveWithoutScope.json
  ).toLowerCase();
  assertClientError(destructiveWithoutConfirm, "Destructive tool without confirm");
  assertClientError(destructiveWithoutScope, "Destructive tool without scope");
  assert(
    destructiveWithoutConfirmMessage.includes("confirm")
      || destructiveWithoutConfirmMessage.includes("destructive"),
    "Destructive tool without confirm=true should be rejected."
  );
  assert(
    Boolean(destructiveWithoutScopeMessage),
    "Destructive tool without destructive scope should be rejected."
  );
  assert(
    readJsonRpcErrorMessage(invalidPayload.json).toLowerCase().includes("payload"),
    "Invalid payload schema should be rejected."
  );
  assert(
    readJsonRpcErrorMessage(invalidChannelPayload.json).includes("payload.websiteUrl"),
    "Invalid channel create payloads should be rejected by MCP schema before control-plane 422."
  );
  assert(
    readJsonRpcErrorMessage(invalidBulkOnboardSource.json).includes("websiteUrl"),
    "Invalid bulk onboarding source rows should be rejected by MCP schema before backend/control-plane writes."
  );
  assert(
    readJsonRpcErrorMessage(invalidDiscoveryArtifactCreatePayload.json).includes("payload"),
    "Nested discovery artifact create payloads should be rejected by MCP schema before backend 422."
  );
  assert(
    readJsonRpcErrorMessage(invalidDiscoveryRunCreatePayload.json).includes("payload"),
    "Nested discovery run create payloads should be rejected by MCP schema before backend 422."
  );
  assert(
    readJsonRpcErrorMessage(invalidDiscoveryRoutePayload.json).includes("sourceUnderstanding"),
    "Invalid discovery route payloads should be rejected by MCP schema before backend 422."
  );
  assert(
    readJsonRpcErrorMessage(invalidDiscoveryRollbackPayload.json).includes("confirm"),
    "Invalid rollback payload should be rejected by MCP schema before backend 422."
  );
  assert(
    invalidDiscoveryArtifactJsonString.json?.error?.data?.path === "payload",
    "JSON-string write payloads should fail at the MCP payload boundary with data.path=payload."
  );
  assert(
    readJsonRpcErrorMessage(invalidDiscoveryPolicyNestedPayload.json).includes("payload"),
    "Nested discovery policy payloads should be rejected by MCP schema before backend 422."
  );
  assert(
    readJsonRpcErrorMessage(invalidSequenceCreateExtraPayload.json).includes("payload.target"),
    "Sequence create should reject guessed extra payload fields before backend 422."
  );
  assert(
    readJsonRpcErrorMessage(invalidTemplateExtraPayload.json).includes("payload.model"),
    "LLM template create should reject guessed extra payload fields before control-plane mutation."
  );
  assert(
    readJsonRpcErrorMessage(invalidContentPolicyExtraPayload.json).includes("payload.payload"),
    "Content analysis policy create should reject nested payload envelopes before backend 422."
  );
  assert(
    readJsonRpcErrorMessage(invalidDiscoveryFeedbackPayload.json).includes("target"),
    "Discovery feedback should require an explicit target at the MCP boundary."
  );
  assert(
    readJsonRpcErrorMessage(tokenRevokeWithoutAdminScope.json).includes("admin.tokens"),
    "MCP token revoke should require admin.tokens scope rather than encouraging direct REST bypass."
  );
  assert(
    readJsonRpcErrorMessage(tokenSelfRevoke.json).toLowerCase().includes("current mcp token"),
    "MCP token revoke should reject self-revoke through the active session."
  );
  assert(
    readJsonRpcErrorMessage(systemSequenceArchive.json).toLowerCase().includes("system sequence"),
    "MCP cleanup should reject archiving migration-owned system sequences."
  );
  assert(
    readJsonRpcErrorMessage(defaultReindexManualRun.json).includes("maintenance.reindex"),
    "MCP should reject manual Default Reindex runs without a valid reindex job/event context."
  );
  assert(
    readJsonRpcErrorMessage(invalidSequenceRunPayload.json).includes("payload.target"),
    "MCP should reject extra sequence run payload fields before backend 422 responses."
  );
  assert(
    readJsonRpcErrorMessage(invalidReindexIndexName.json).includes("payload.indexName"),
    "MCP should reject unsupported reindex indexName before creating a skipped job."
  );
  assert(
    readJsonRpcErrorMessage(invalidReindexJobKind.json).includes("payload.jobKind"),
    "MCP should reject unsupported reindex jobKind instead of coercing it to rebuild."
  );
  assertClientError(unknownMethod, "Unknown JSON-RPC method");
  assertClientError(unknownTool, "Unknown MCP tool");
  assertClientError(unknownResource, "Unknown MCP resource");
  assertClientError(unknownPrompt, "Unknown MCP prompt");
  assert(readJsonRpcErrorMessage(unknownMethod.json), "Unknown method should produce an MCP error.");
  assert(readJsonRpcErrorMessage(unknownTool.json), "Unknown tool should produce an MCP error.");
  assert(readJsonRpcErrorMessage(unknownResource.json), "Unknown resource should produce an MCP error.");
  assert(readJsonRpcErrorMessage(unknownPrompt.json), "Unknown prompt should produce an MCP error.");

  pushEvidence(evidence, "negative-statuses", {
    missingBearer: missingBearer.status,
    malformed: malformed.status,
    destructiveWithoutConfirm: destructiveWithoutConfirm.status,
    destructiveWithoutScope: destructiveWithoutScope.status,
    invalidPayload: invalidPayload.status,
    invalidChannelPayload: invalidChannelPayload.status,
    invalidBulkOnboardSource: invalidBulkOnboardSource.status,
    invalidDiscoveryArtifactCreatePayload: invalidDiscoveryArtifactCreatePayload.status,
    invalidDiscoveryRunCreatePayload: invalidDiscoveryRunCreatePayload.status,
    invalidDiscoveryRoutePayload: invalidDiscoveryRoutePayload.status,
    invalidDiscoveryRollbackPayload: invalidDiscoveryRollbackPayload.status,
    invalidDiscoveryArtifactJsonString: invalidDiscoveryArtifactJsonString.status,
    invalidDiscoveryPolicyNestedPayload: invalidDiscoveryPolicyNestedPayload.status,
    invalidSequenceCreateExtraPayload: invalidSequenceCreateExtraPayload.status,
    invalidTemplateExtraPayload: invalidTemplateExtraPayload.status,
    invalidContentPolicyExtraPayload: invalidContentPolicyExtraPayload.status,
    invalidDiscoveryFeedbackPayload: invalidDiscoveryFeedbackPayload.status,
    tokenRevokeWithoutAdminScope: tokenRevokeWithoutAdminScope.status,
    tokenSelfRevoke: tokenSelfRevoke.status,
    systemSequenceArchive: systemSequenceArchive.status,
    defaultReindexManualRun: defaultReindexManualRun.status,
    invalidSequenceRunPayload: invalidSequenceRunPayload.status,
    invalidReindexIndexName: invalidReindexIndexName.status,
    invalidReindexJobKind: invalidReindexJobKind.status,
    unknownMethod: unknownMethod.status,
    unknownTool: unknownTool.status,
    unknownResource: unknownResource.status,
    unknownPrompt: unknownPrompt.status,
  });

  return {
    key: "negative-scope-and-destructive-policy",
    summary: "Asserted real HTTP policy failures for auth, scope, destructive confirmation, invalid payloads, and unknown MCP methods.",
    evidence,
  };
}
