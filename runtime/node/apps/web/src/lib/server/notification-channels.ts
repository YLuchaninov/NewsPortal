export type NotificationChannelType = "web_push" | "telegram" | "email_digest";

function readRequiredString(value: unknown, fieldName: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`Notification channel field "${fieldName}" is required.`);
  }
  return normalized;
}

function parseWebPushSubscription(value: unknown): Record<string, unknown> {
  const parsed =
    typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error('Notification channel field "subscription" must be a JSON object.');
  }

  const subscription = parsed as Record<string, unknown>;
  const keys =
    subscription.keys != null &&
    typeof subscription.keys === "object" &&
    !Array.isArray(subscription.keys)
      ? (subscription.keys as Record<string, unknown>)
      : null;

  if (
    typeof subscription.endpoint !== "string" ||
    !subscription.endpoint.trim() ||
    typeof keys?.auth !== "string" ||
    !keys.auth.trim() ||
    typeof keys?.p256dh !== "string" ||
    !keys.p256dh.trim()
  ) {
    throw new Error(
      'Notification channel field "subscription" must include endpoint, keys.auth, and keys.p256dh.'
    );
  }

  return subscription;
}

export function parseNotificationChannelConfig(
  channelType: NotificationChannelType,
  payload: Record<string, unknown>,
  defaultEmail: string | null
): Record<string, unknown> {
  switch (channelType) {
    case "telegram":
      return {
        chat_id: readRequiredString(payload.chatId, "chatId")
      };
    case "email_digest": {
      const email = readRequiredString(payload.email ?? defaultEmail, "email");
      if (!email.includes("@")) {
        throw new Error('Notification channel field "email" must be a valid email address.');
      }
      return { email };
    }
    case "web_push":
      return {
        subscription: parseWebPushSubscription(payload.subscription)
      };
    default:
      throw new Error(`Unsupported notification channel type "${channelType}".`);
  }
}
