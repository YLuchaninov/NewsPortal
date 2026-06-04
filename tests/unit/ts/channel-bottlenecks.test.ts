import assert from "node:assert/strict";
import test from "node:test";

import { explainChannelBottleneckWithPool } from "../../../packages/control-plane/src/channel-bottlenecks.ts";

test("channel bottleneck explain flags legacy DDGS internal bridge URLs without disabling channels", async () => {
  const pool = {
    async query() {
      return {
        rows: [
          {
            channelId: "11111111-1111-4111-8111-111111111111",
            name: "Indirect DDGS search",
            providerType: "api",
            adapterKey: "ddgs_search",
            researchMode: "research_only",
            tosRisk: "medium",
            sourceRole: "indirect_aggregator",
            fetchUrl: "http://api:8000/maintenance/discovery/search/ddgs?q=site%3Aexample.com",
            isActive: true,
            pollIntervalSeconds: 300,
            effectivePollIntervalSeconds: 300,
            maxPollIntervalSeconds: 3600,
            nextDueAt: null,
            consecutiveFailures: 0,
            consecutiveNoChangePolls: 0,
            adaptiveReason: null,
            lastOutcomeKind: "no_change",
            lastHttpStatus: null,
            lastErrorText: null,
            lastProviderMetrics: null,
            outcomeCounts24h: {},
            outcomeCounts7d: {},
            runCount24h: 0,
            failureCount24h: 0,
            fetchedItemCount24h: 0,
            newItemCount24h: 0,
            duplicateCount24h: 0,
            runCount7d: 0,
            failureCount7d: 0,
            fetchedItemCount7d: 0,
            newItemCount7d: 0,
            duplicateCount7d: 0,
            signalCandidateCount: 10,
            selectedRows: 0,
            selectedUniqueContent: 0,
            grayRows: 0,
            rejectedRows: 10,
            visibleSignalCandidates: 0,
            duplicateSignalCandidates: 0,
            webResourceCount: 0,
            projectedResourceCount: 0,
            resourceOnlyCount: 0,
            extractionFailedCount: 0,
            projectedSelectedRows: 0,
            projectedGrayRows: 0,
            projectedRejectedRows: 0,
          },
        ],
      };
    },
  };

  const result = await explainChannelBottleneckWithPool(
    pool as never,
    "11111111-1111-4111-8111-111111111111",
  );

  assert.equal(result.legacyDdgsInternalBridge, true);
  assert.match(result.legacyBridgeWarning ?? "", /Fetchers now execute ddgs_search directly/);
  assert.equal(result.diagnosis.legacyDdgsInternalBridge, true);
  assert.ok(result.nextActions.some((action) => action.tool === "channels.bulk_onboard.plan"));
});
