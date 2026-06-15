import {
  applyChannelBulkOnboardingWithPool,
  bindSourceChannelToFunnel,
  ChannelBottleneckNotFoundError,
  deleteChannelWithAudit,
  explainChannelBottleneckWithPool,
  listChannelBottlenecksWithPool,
  planChannelAlternativesWithPool,
  planChannelBulkOnboardingWithPool,
  saveChannelFromPayload,
  setChannelActiveStateWithAudit,
  summarizeChannelBottlenecksWithPool,
  verifyChannelBulkOnboardingWithPool
} from "@signalops/control-plane";

import {
  createReadTool,
  createWriteTool,
  JsonRpcError,
  mcpFunnelWriteContextPayload,
  readBooleanFlag,
  readMcpFunnelWriteContext,
  readOptionalInteger,
  readOptionalString,
  readPageArgs,
  readRequiredString,
  requireDestructiveConfirmation,
  shouldAuditMcpFunnelWriteContext,
  withMcpFunnelWriteContext,
  writeMcpMutationAudit,
  type McpToolDefinition
} from "./shared";
import {
  asMcpInvalidRequest,
  bulkOnboardApplySchema,
  bulkOnboardPlanSchema,
  bulkOnboardVerifySchema,
  channelActiveStateSchema,
  channelAlternativesPlanSchema,
  channelAlternativesStartSchema,
  channelBottlenecksExplainSchema,
  channelBottlenecksListSchema,
  channelDetailSchema,
  channelMutationSchema,
  channelSyncRequestSchema,
  outboxEventsListSchema,
  readBulkOnboardingMode,
  readChannelIds,
  readCreateChannelPayload,
  readOptionalBoundedInteger,
  readOptionalNonNegativeInteger,
  readOptionalStringArray,
  readResolvedChannelPayload,
  readSourcesArray,
  resolveChannelId,
} from "./channels-tool-helpers";

export const CHANNEL_MCP_TOOLS: readonly McpToolDefinition[] = [
  createReadTool(
    "channels.list",
    "List channels with optional provider filter.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        providerType: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listChannelsPage<Record<string, unknown>>({
        ...readPageArgs(args),
        providerType: readOptionalString(args.providerType) ?? undefined,
      })
  ),
  createReadTool(
    "channels.read",
    "Read one channel. Full channelId is preferred; unique UUID prefixes from reports are accepted for read-back.",
    channelDetailSchema,
    async ({ sdk, pool }, args) =>
      sdk.getChannel<Record<string, unknown>>(await resolveChannelId(pool, args.channelId))
  ),
  createReadTool(
    "fetch_runs.list",
    "List fetch runs.",
    {
      type: "object",
      properties: {
        channelId: { type: "string" },
        page: { type: "number" },
        pageSize: { type: "number" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) => {
      const page = readOptionalInteger(args.page);
      const pageSize = readOptionalInteger(args.pageSize);
      if (page || pageSize) {
        return sdk.listFetchRunsPage<Record<string, unknown>>({
          page,
          pageSize,
          channelId: readOptionalString(args.channelId) ?? undefined,
        });
      }
      return sdk.listFetchRuns<Record<string, unknown>>(
        readOptionalString(args.channelId) ?? undefined
      );
    }
  ),
  createReadTool(
    "outbox.events.list",
    "List outbox events with optional event/aggregate/status filters for read-after-write source sync proof.",
    outboxEventsListSchema,
    async ({ sdk }, args) =>
      sdk.listOutboxEvents<Record<string, unknown>[]>({
        limit: readOptionalInteger(args.limit) ?? undefined,
        eventType: readOptionalString(args.eventType) ?? undefined,
        aggregateType: readOptionalString(args.aggregateType) ?? undefined,
        aggregateId: readOptionalString(args.aggregateId) ?? undefined,
        status: readOptionalString(args.status) ?? undefined,
      })
  ),
  createReadTool(
    "channels.bottlenecks.summary",
    "Summarize source bottlenecks from the shared control-plane read model. Separates working noisy/low-yield sources from technical fetch/provider-shape failures.",
    {
      type: "object",
      properties: {
        providerType: { type: "string" },
        failureBucket: { type: "string" },
        repairLane: { type: "string" },
        q: { type: "string" },
        channelIds: { type: "array", items: { type: "string" } },
      },
      additionalProperties: false,
    },
    async ({ pool }, args) =>
      summarizeChannelBottlenecksWithPool(pool, {
        providerType: readOptionalString(args.providerType) ?? undefined,
        failureBucket: readOptionalString(args.failureBucket) ?? undefined,
        repairLane: readOptionalString(args.repairLane) ?? undefined,
        q: readOptionalString(args.q) ?? undefined,
        channelIds: readOptionalStringArray(args.channelIds, "channelIds"),
      })
  ),
  createReadTool(
    "channels.bottlenecks.list",
    "List per-channel source bottlenecks with fetch outcomes, selection/projection stats, provider-shape validation, failure bucket, and repair lane.",
    channelBottlenecksListSchema,
    async ({ pool }, args) =>
      listChannelBottlenecksWithPool(pool, {
        ...readPageArgs(args),
        providerType: readOptionalString(args.providerType) ?? undefined,
        failureBucket: readOptionalString(args.failureBucket) ?? undefined,
        repairLane: readOptionalString(args.repairLane) ?? undefined,
        q: readOptionalString(args.q) ?? undefined,
        channelIds: readOptionalStringArray(args.channelIds, "channelIds"),
      })
  ),
  createReadTool(
    "channels.bottlenecks.explain",
    "Explain one channel bottleneck and return source-health diagnosis plus MCP read-back/repair next actions.",
    channelBottlenecksExplainSchema,
    async ({ pool }, args) => {
      try {
        return await explainChannelBottleneckWithPool(
          pool,
          await resolveChannelId(pool, args.channelId)
        );
      } catch (error) {
        if (error instanceof ChannelBottleneckNotFoundError) {
          throw new JsonRpcError(-32602, error.message, {
            statusCode: 404,
            data: { path: "channelId" },
          });
        }
        throw error;
      }
    }
  ),
  createReadTool(
    "channels.bulk_onboard.plan",
    "Plan bulk channel onboarding without mutating state. Classifies each RSS/website/API/email source as create/update/duplicate/invalid/risky/override and returns a stale-safe planFingerprint.",
    bulkOnboardPlanSchema,
    async ({ pool }, args) => {
      try {
        return await planChannelBulkOnboardingWithPool(pool, readSourcesArray(args), {
          mode: readBulkOnboardingMode(args.mode),
          includeExisting: args.includeExisting === true,
        });
      } catch (error) {
        return asMcpInvalidRequest(error, "channels.bulk_onboard.plan");
      }
    }
  ),
  createReadTool(
    "channels.bulk_onboard.verify",
    "Verify bulk-onboarded channels from DB-backed state. Separates channel acquisition, website resources, projection, and downstream final selection decisions.",
    bulkOnboardVerifySchema,
    async ({ pool }, args) =>
      verifyChannelBulkOnboardingWithPool(
        pool,
        readChannelIds(args.channelIds),
        args.includeSamples === true
      )
  ),
  createReadTool(
    "channels.alternatives.plan",
    "Plan safer alternative channel candidates for broken or mismatched sources. Uses fetchers feed probing for RSS autodiscovery and never mutates channels.",
    channelAlternativesPlanSchema,
    async ({ pool }, args) => {
      try {
        return await planChannelAlternativesWithPool(pool, {
          channelIds: readOptionalStringArray(args.channelIds, "channelIds"),
          urls: readOptionalStringArray(args.urls, "urls"),
          failureKinds: readOptionalStringArray(args.failureKinds, "failureKinds"),
          includeFeedProbe: args.includeFeedProbe !== false,
          maxCandidates: readOptionalBoundedInteger(args.maxCandidates, "maxCandidates"),
        });
      } catch (error) {
        return asMcpInvalidRequest(error, "channels.alternatives.plan");
      }
    }
  ),
  createWriteTool(
    "channels.create",
    "Create a channel through the shared control-plane service.",
    "write.channels",
    channelMutationSchema,
    async ({ pool, token }, args) => {
      try {
        const funnelContext = await readMcpFunnelWriteContext(pool, token, args, {
          toolName: "channels.create",
          riskKind: "source_health",
          selectionImpacting: true,
        });
        const result = await saveChannelFromPayload(
          pool,
          token.issuedByUserId,
          readCreateChannelPayload(args)
        );
        const channelId = result.channelId ?? "";
        const funnelBinding =
          funnelContext.funnelId && channelId
            ? await bindSourceChannelToFunnel(pool, token.issuedByUserId, {
                funnelId: funnelContext.funnelId,
                laneId: funnelContext.laneId,
                channelId,
                sourceRole: readOptionalString(args.sourceRole),
                bindingRole: funnelContext.changeMode ?? "manual_tuning",
              })
            : null;
        if (shouldAuditMcpFunnelWriteContext(funnelContext)) {
          await writeMcpMutationAudit(pool, token, {
            actionType: "mcp_funnel_write_context_recorded",
            entityType: "source_channel",
            entityId: channelId,
            payloadJson: mcpFunnelWriteContextPayload(funnelContext),
          });
        }
        return withMcpFunnelWriteContext(
          { ...(result as unknown as Record<string, unknown>), ...(funnelBinding ? { funnelBinding } : {}) },
          funnelContext
        );
      } catch (error) {
        return asMcpInvalidRequest(error, "channels.create");
      }
    }
  ),
  createWriteTool(
    "channels.bulk_onboard.apply",
    "Apply a previously confirmed bulk onboarding plan. Recomputes the planFingerprint, rejects stale plans, requires confirm=true for updates, and only writes ready/explicitly-overridden rows.",
    "write.channels",
    bulkOnboardApplySchema,
    async ({ pool, token }, args) => {
      try {
        const funnelContextArgs = {
          ...args,
          planFingerprint: args.funnelPlanFingerprint,
        };
        const funnelContext = await readMcpFunnelWriteContext(pool, token, funnelContextArgs, {
          toolName: "channels.bulk_onboard.apply",
          riskKind: "source_health",
          selectionImpacting: true,
        });
        const result = await applyChannelBulkOnboardingWithPool(
          pool,
          token.issuedByUserId,
          readSourcesArray(args),
          {
            planFingerprint: readRequiredString(args.planFingerprint, "planFingerprint"),
            confirm: args.confirm === true,
            overrideReason: readOptionalString(args.overrideReason),
            mode: readBulkOnboardingMode(args.mode),
            includeExisting: args.includeExisting === true,
          }
        );
        const channelIds = [...result.createdChannelIds, ...result.updatedChannelIds];
        const funnelBindings =
          funnelContext.funnelId && channelIds.length > 0
            ? await Promise.all(
                channelIds.map((channelId) =>
                  bindSourceChannelToFunnel(pool, token.issuedByUserId, {
                    funnelId: funnelContext.funnelId as string,
                    laneId: funnelContext.laneId,
                    channelId,
                    sourceRole: readOptionalString(args.sourceRole),
                    bindingRole: funnelContext.changeMode ?? "manual_tuning",
                  })
                )
              )
            : [];
        if (shouldAuditMcpFunnelWriteContext(funnelContext)) {
          await writeMcpMutationAudit(pool, token, {
            actionType: "mcp_funnel_write_context_recorded",
            entityType: "source_channel_bulk_onboarding",
            payloadJson: mcpFunnelWriteContextPayload(funnelContext),
          });
        }
        return withMcpFunnelWriteContext(
          {
            ...(result as unknown as Record<string, unknown>),
            ...(funnelBindings.length > 0 ? { funnelBindings } : {}),
          },
          funnelContext
        );
      } catch (error) {
        return asMcpInvalidRequest(error, "channels.bulk_onboard.apply");
      }
    }
  ),
  createWriteTool(
    "channels.alternatives.start",
    "Start bounded discovery replacement runs for existing bad channels after planning alternatives. This does not create source channels; candidates must still pass bulk onboarding.",
    "write.discovery",
    channelAlternativesStartSchema,
    async ({ pool, sdk, token }, args) => {
      try {
        const targetId = readRequiredString(args.targetId, "targetId");
        const plan = await planChannelAlternativesWithPool(pool, {
          channelIds: readOptionalStringArray(args.channelIds, "channelIds"),
          urls: readOptionalStringArray(args.urls, "urls"),
          failureKinds: readOptionalStringArray(args.failureKinds, "failureKinds"),
          includeFeedProbe: args.includeFeedProbe !== false,
          maxCandidates: readOptionalBoundedInteger(args.maxCandidates, "maxCandidates"),
        });
        const channelIds = Array.from(
          new Set(
            plan.candidates
              .map((candidate) => candidate.sourceChannelId)
              .filter((value): value is string => Boolean(value))
          )
        );
        const runs: unknown[] = [];
        const skipped: Array<Record<string, unknown>> = [];
        for (const channelId of channelIds) {
          runs.push(
            await sdk.createDiscoveryVNextRun<Record<string, unknown>>({
              runKind: "candidate_acquisition",
              triggerKind: "mcp",
              request: {
                source: "channels.alternatives.start",
                targetId,
                channelId,
                maxDepth: readOptionalBoundedInteger(args.maxDepth, "maxDepth") ?? 1,
                maxHypotheses: readOptionalBoundedInteger(args.maxHypotheses, "maxHypotheses") ?? 6,
                maxSearchResults:
                  readOptionalBoundedInteger(args.maxSearchResults, "maxSearchResults") ?? 8,
                maxDomains: readOptionalBoundedInteger(args.maxDomains, "maxDomains") ?? 12,
                maxEndpoints: readOptionalBoundedInteger(args.maxEndpoints, "maxEndpoints") ?? 20,
                maxSocialItems:
                  readOptionalNonNegativeInteger(args.maxSocialItems, "maxSocialItems") ?? 0,
                providerExecutionEnabled: args.providerExecutionEnabled === true,
              },
              budget: {
                liveProviderExecution: args.providerExecutionEnabled === true,
              },
              createdBy:
                readOptionalString(args.requestedBy) ??
                `channels.alternatives.start:${token.issuedByUserId}`,
            })
          );
        }
        for (const input of plan.inputs) {
          if (input.channelId && !channelIds.includes(input.channelId)) {
            skipped.push({
              channelId: input.channelId,
              reason:
                "No bounded alternative candidate was returned for this input, so no replacement run was started.",
            });
          }
        }
        if ((readOptionalStringArray(args.urls, "urls") ?? []).length > 0) {
          skipped.push({
            reason:
              "URL-only alternatives are plan-only until an existing channelId is available for source replacement.",
          });
        }
        return {
          plan,
          runs,
          skipped,
          nextReadBack: [
            {
              tool: "operator.report.verify",
              arguments: {
                reportKind: "discovery_run",
                entityIds: { targetIds: [targetId] },
                includeSamples: true,
              },
            },
            {
              tool: "channels.bulk_onboard.plan",
              arguments: { sources: "<chosen alternatives from plan.candidates>" },
            },
          ],
        };
      } catch (error) {
        return asMcpInvalidRequest(error, "channels.alternatives.start");
      }
    }
  ),
  createWriteTool(
    "channels.update",
    "Update a channel through the shared control-plane service. This requires a complete provider-specific channel payload with providerType, name, fetchUrl, and settings. For activation/deactivation only, use channels.set_active.",
    "write.channels",
    channelMutationSchema,
    async ({ pool, token }, args) => {
      try {
        const funnelContext = await readMcpFunnelWriteContext(pool, token, args, {
          toolName: "channels.update",
          riskKind: "source_health",
          selectionImpacting: true,
        });
        const result = await saveChannelFromPayload(
          pool,
          token.issuedByUserId,
          await readResolvedChannelPayload(pool, args, { requireChannelId: true })
        );
        const channelId = result.channelId ?? "";
        const funnelBinding =
          funnelContext.funnelId && channelId
            ? await bindSourceChannelToFunnel(pool, token.issuedByUserId, {
                funnelId: funnelContext.funnelId,
                laneId: funnelContext.laneId,
                channelId,
                sourceRole: readOptionalString(args.sourceRole),
                bindingRole: funnelContext.changeMode ?? "manual_tuning",
              })
            : null;
        if (shouldAuditMcpFunnelWriteContext(funnelContext)) {
          await writeMcpMutationAudit(pool, token, {
            actionType: "mcp_funnel_write_context_recorded",
            entityType: "source_channel",
            entityId: channelId,
            payloadJson: mcpFunnelWriteContextPayload(funnelContext),
          });
        }
        return withMcpFunnelWriteContext(
          { ...(result as unknown as Record<string, unknown>), ...(funnelBinding ? { funnelBinding } : {}) },
          funnelContext
        );
      } catch (error) {
        return asMcpInvalidRequest(error, "channels.update");
      }
    }
  ),
  createWriteTool(
    "channels.set_active",
    "Activate or deactivate one existing channel by channelId without requiring the full provider-specific payload. Use this for operational cleanup of structurally failing sources.",
    "write.channels",
    channelActiveStateSchema,
    async ({ pool, token }, args) => {
      const result = await setChannelActiveStateWithAudit(
        pool,
        token.issuedByUserId,
        await resolveChannelId(pool, args.channelId),
        readBooleanFlag(args.isActive, "isActive"),
        readOptionalString(args.reason)
      );
      return {
        ...result,
        nextReadBack: [
          {
            tool: "channels.read",
            arguments: { channelId: result.channelId },
          },
          {
            tool: "operator.report.verify",
            arguments: {
              reportKind: "channel_health",
              entityIds: { channelIds: [result.channelId] },
              includeSamples: true,
            },
          },
        ],
      };
    }
  ),
  createWriteTool(
    "channels.sync.request",
    "Queue a source.channel.sync.requested outbox event for an existing source channel without mutating channel configuration.",
    "write.channels",
    channelSyncRequestSchema,
    async ({ pool, token }, args) => {
      const channelId = await resolveChannelId(pool, args.channelId);
      const result = await pool.query(
        `
        insert into outbox_events (
          event_id,
          event_type,
          aggregate_type,
          aggregate_id,
          payload_json
        )
        values (gen_random_uuid(), 'source.channel.sync.requested', 'source_channel', $1, $2::jsonb)
        returning *
        `,
        [
          channelId,
          JSON.stringify({
            channelId,
            source: "mcp.channels.sync.request",
            reason: readOptionalString(args.reason) ?? null,
          }),
        ]
      );
      await pool.query(
        `
        insert into source_channel_runtime_state (
          channel_id,
          adaptive_enabled,
          effective_poll_interval_seconds,
          max_poll_interval_seconds,
          next_due_at,
          adaptive_step,
          consecutive_no_change_polls,
          consecutive_failures,
          adaptive_reason,
          updated_at
        )
        values (
          $1,
          true,
          (select poll_interval_seconds from source_channels where channel_id = $1),
          (select least(poll_interval_seconds * 16, 604800) from source_channels where channel_id = $1),
          now(),
          0,
          0,
          0,
          'mcp_sync_request',
          now()
        )
        on conflict (channel_id)
        do update
        set
          next_due_at = now(),
          adaptive_step = 0,
          consecutive_failures = 0,
          adaptive_reason = 'mcp_sync_request',
          updated_at = now()
        `,
        [channelId]
      );
      const event = result.rows[0] as Record<string, unknown>;
      await writeMcpMutationAudit(pool, token, {
        actionType: "channel_sync_requested",
        entityType: "source_channel",
        entityId: channelId,
        payloadJson: {
          eventId: event.event_id,
          reason: readOptionalString(args.reason) ?? null,
        },
      });
      return {
        ...event,
        nextReadBack: [
          { tool: "channels.read", arguments: { channelId } },
          { tool: "fetch_runs.list", arguments: { channelId, page: 1, pageSize: 5 } },
          {
            tool: "outbox.events.list",
            arguments: {
              eventType: "source.channel.sync.requested",
              aggregateType: "source_channel",
              aggregateId: channelId,
              limit: 10,
            },
          },
        ],
      };
    }
  ),
  createWriteTool(
    "channels.delete",
    "Delete or archive a channel depending on stored items.",
    "write.channels",
    {
      type: "object",
      required: ["channelId", "confirm"],
      properties: {
        channelId: { type: "string" },
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      requireDestructiveConfirmation(token, args);
      return deleteChannelWithAudit(
        pool,
        token.issuedByUserId,
        await resolveChannelId(pool, args.channelId)
      );
    },
    true
  ),
] as const;
