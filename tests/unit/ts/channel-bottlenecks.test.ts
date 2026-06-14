import assert from "node:assert/strict";
import test from "node:test";

import {
  explainChannelBottleneckWithPool,
  summarizeChannelBottlenecksWithPool,
} from "../../../runtime/node/packages/control-plane/src/channel-bottlenecks.ts";

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
            sourceClassConfig: null,
            testArtifactMarker: null,
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

test("channel bottleneck summary separates test/audit-like failures from operator-like failures", async () => {
  const rows = [
    {
      channelId: "11111111-1111-4111-8111-111111111111",
      name: "UI audit RSS",
      providerType: "rss",
      adapterKey: null,
      researchMode: null,
      tosRisk: null,
      sourceRole: null,
      sourceClassConfig: null,
      testArtifactMarker: "ui_audit",
      fetchUrl: "https://example.test/feed.xml",
      isActive: true,
      pollIntervalSeconds: 300,
      effectivePollIntervalSeconds: 300,
      maxPollIntervalSeconds: 3600,
      nextDueAt: null,
      consecutiveFailures: 3,
      consecutiveNoChangePolls: 0,
      adaptiveReason: null,
      lastOutcomeKind: "hard_failure",
      lastHttpStatus: 404,
      lastErrorText: "Not Found",
      lastProviderMetrics: null,
      outcomeCounts24h: {},
      outcomeCounts7d: {},
      runCount24h: 1,
      failureCount24h: 1,
      fetchedItemCount24h: 0,
      newItemCount24h: 0,
      duplicateCount24h: 0,
      runCount7d: 1,
      failureCount7d: 1,
      fetchedItemCount7d: 0,
      newItemCount7d: 0,
      duplicateCount7d: 0,
      signalCandidateCount: 0,
      selectedRows: 0,
      selectedUniqueContent: 0,
      grayRows: 0,
      rejectedRows: 0,
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
    {
      channelId: "22222222-2222-4222-8222-222222222222",
      name: "Operator RSS",
      providerType: "rss",
      adapterKey: null,
      researchMode: null,
      tosRisk: null,
      sourceRole: null,
      sourceClassConfig: "operator_like",
      testArtifactMarker: null,
      fetchUrl: "https://operator.example.test/feed.xml",
      isActive: true,
      pollIntervalSeconds: 300,
      effectivePollIntervalSeconds: 300,
      maxPollIntervalSeconds: 3600,
      nextDueAt: null,
      consecutiveFailures: 2,
      consecutiveNoChangePolls: 0,
      adaptiveReason: null,
      lastOutcomeKind: "hard_failure",
      lastHttpStatus: 502,
      lastErrorText: "Bad Gateway",
      lastProviderMetrics: null,
      outcomeCounts24h: {},
      outcomeCounts7d: {},
      runCount24h: 1,
      failureCount24h: 1,
      fetchedItemCount24h: 0,
      newItemCount24h: 0,
      duplicateCount24h: 0,
      runCount7d: 1,
      failureCount7d: 1,
      fetchedItemCount7d: 0,
      newItemCount7d: 0,
      duplicateCount7d: 0,
      signalCandidateCount: 0,
      selectedRows: 0,
      selectedUniqueContent: 0,
      grayRows: 0,
      rejectedRows: 0,
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
  ];
  const pool = {
    async query() {
      return { rows };
    },
  };

  const summary = await summarizeChannelBottlenecksWithPool(pool as never);

  const byClass = Object.fromEntries(summary.bySourceClass.map((entry) => [entry.sourceClass, entry]));
  assert.equal(byClass.test_or_audit_like?.technicalBottlenecks, 1);
  assert.equal(byClass.operator_like?.technicalBottlenecks, 1);
  assert.equal(byClass.test_or_audit_like?.activeChannels, 1);
  assert.equal(byClass.operator_like?.activeChannels, 1);
});
