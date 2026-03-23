import assert from "node:assert/strict";
import test from "node:test";

import { parseNotificationChannelConfig } from "../../../apps/web/src/lib/server/notification-channels.ts";

test("parseNotificationChannelConfig validates web push subscriptions", () => {
  const config = parseNotificationChannelConfig(
    "web_push",
    {
      subscription: JSON.stringify({
        endpoint: "https://push.example.test/subscription/123",
        keys: {
          auth: "auth-key",
          p256dh: "p256dh-key"
        }
      })
    },
    null
  );

  assert.equal(
    ((config.subscription as Record<string, unknown>).keys as Record<string, unknown>).auth,
    "auth-key"
  );

  assert.throws(
    () =>
      parseNotificationChannelConfig(
        "web_push",
        {
          subscription: JSON.stringify({
            endpoint: "",
            keys: {}
          })
        },
        null
      ),
    /must include endpoint, keys\.auth, and keys\.p256dh/
  );
});

test("parseNotificationChannelConfig normalizes telegram and email digest payloads", () => {
  assert.deepEqual(
    parseNotificationChannelConfig("telegram", { chatId: "12345" }, null),
    { chat_id: "12345" }
  );
  assert.deepEqual(
    parseNotificationChannelConfig("email_digest", {}, "user@example.com"),
    { email: "user@example.com" }
  );
});
