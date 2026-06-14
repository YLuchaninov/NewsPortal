import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_CREATE_PROVIDER_TYPES,
  BETA_INGEST_PROVIDER_TYPES,
  BULK_IMPORT_PROVIDER_TYPES,
  SIGNALOPS_PROVIDER_CAPABILITIES,
  formatProviderCapabilityLabel,
  getProviderCapability,
  isBetaIngestProviderType,
} from "../../../runtime/node/packages/contracts/src/index.ts";
import {
  ADMIN_CHANNEL_PROVIDER_TYPES,
  formatAdminChannelProviderLabel,
} from "../../../runtime/node/packages/control-plane/src/channel-providers.ts";

test("provider capability matrix defines Public Beta ingest and non-ingest lanes", () => {
  assert.deepEqual(BETA_INGEST_PROVIDER_TYPES, ["rss", "website", "api", "email_imap"]);
  assert.deepEqual(ADMIN_CREATE_PROVIDER_TYPES, BETA_INGEST_PROVIDER_TYPES);
  assert.deepEqual(BULK_IMPORT_PROVIDER_TYPES, BETA_INGEST_PROVIDER_TYPES);

  assert.deepEqual(
    Object.fromEntries(
      SIGNALOPS_PROVIDER_CAPABILITIES.map((item) => [item.providerType, item.status])
    ),
    {
      rss: "beta_runtime",
      website: "beta_runtime",
      api: "beta_runtime",
      email_imap: "beta_runtime",
      telegram: "delivery_only",
      youtube: "future_hidden",
    }
  );
  assert.equal(getProviderCapability("telegram").ingestRuntime, false);
  assert.equal(getProviderCapability("youtube").adminCreateVisible, false);
  assert.equal(getProviderCapability("youtube").diagnosticOnly, true);
  assert.deepEqual(
    SIGNALOPS_PROVIDER_CAPABILITIES.filter((item) => item.ingestRuntime).map(
      (item) => item.providerType
    ),
    BETA_INGEST_PROVIDER_TYPES
  );
});

test("admin provider helpers derive visible providers from the shared matrix", () => {
  assert.deepEqual(ADMIN_CHANNEL_PROVIDER_TYPES, ["rss", "website", "api", "email_imap"]);
  assert.equal(isBetaIngestProviderType("youtube"), false);
  assert.equal(formatProviderCapabilityLabel("email_imap"), "Email IMAP");
  assert.equal(formatAdminChannelProviderLabel("website"), "Website");
});
