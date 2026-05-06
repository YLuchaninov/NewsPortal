import type { APIRoute } from "astro";

import {
  deleteChannelWithAudit,
  saveChannelFromPayload,
} from "@newsportal/control-plane";

import {
  adminActionError,
  adminActionSuccess,
  prepareAdminAction,
  readRequiredAdminText,
} from "../../../lib/server/admin-action";
import {
  assertAdminChannelPayloadMatchesSchema,
  assertAdminPayloadHasNoNestedEnvelope,
  stripAdminMetaFields,
} from "../../../lib/server/admin-payload-validation";
import { resolveAdminAppPath } from "../../../lib/server/browser-flow";
import { getPool } from "../../../lib/server/db";

export const prerender = false;

type ChannelIntent = "save" | "delete";

function resolveChannelIntent(payload: Record<string, unknown>): ChannelIntent {
  return String(payload.intent ?? "save").trim() === "delete" ? "delete" : "save";
}

function resolveChannelEditPath(request: Request, channelId: string): string {
  return resolveAdminAppPath(request, `/channels/${channelId}/edit`);
}

export const POST: APIRoute = async ({ request }) => {
  const action = await prepareAdminAction(request, {
    fallbackRedirectPath: "/channels",
    actionToken: { scope: "channels" },
  });
  if (!action.ok) {
    return action.response;
  }

  try {
    const { payload, session } = action.context;
    const pool = getPool();
    const intent = resolveChannelIntent(payload);
    assertAdminPayloadHasNoNestedEnvelope(payload, "Channel action");

    if (intent === "delete") {
      const channelId = readRequiredAdminText(
        payload,
        "channelId",
        "Channel ID is required for delete.",
      );

      const result = await deleteChannelWithAudit(pool, session.userId, channelId);

      return adminActionSuccess(action.context, {
        section: "channels",
        message:
          result.mode === "delete"
            ? `${result.providerLabel} channel deleted`
            : `${result.providerLabel} channel archived because it already has stored items`,
        redirectTo:
          result.mode === "delete"
            ? resolveAdminAppPath(request, "/channels")
            : action.context.redirectTo,
        json: {
          ok: true,
          mode: result.mode,
          storedItemCount: result.storedItemCount,
          providerType: result.providerType,
        },
      });
    }

    assertAdminChannelPayloadMatchesSchema(
      stripAdminMetaFields(payload),
      "Channel save payload",
    );
    const result = await saveChannelFromPayload(pool, session.userId, payload);
    const entityPath = result.channelId
      ? resolveChannelEditPath(request, result.channelId)
      : action.context.redirectTo;

    if (!result.created && result.channelId) {
      return adminActionSuccess(action.context, {
        section: "channels",
        message: `${result.providerLabel} channel updated`,
        redirectTo: action.context.redirectTo,
        json: {
          updated: true,
          channelId: result.channelId,
          updatedChannelIds: result.updatedChannelIds,
        },
      });
    }

    return adminActionSuccess(action.context, {
      section: "channels",
      message: `${result.providerLabel} channel created`,
      redirectTo: result.created ? entityPath : action.context.redirectTo,
      status: 201,
      json: {
        channelId: result.channelId,
        createdChannelIds: result.createdChannelIds,
      },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to update channel.";
    return adminActionError(action.context, {
      section: "channels",
      message: errorMessage,
      status: 400,
    });
  }
};
