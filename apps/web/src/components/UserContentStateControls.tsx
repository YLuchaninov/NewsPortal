import { useState } from "react";
import type { UserContentStateView } from "@newsportal/contracts";

interface UserContentStateControlsProps {
  contentItemId: string;
  contentStatePath: string;
  storyFollowPath?: string;
  initialUserState: UserContentStateView;
  onUserStateChange?: (nextState: UserContentStateView) => void;
  compact?: boolean;
  showArchiveButton?: boolean;
  showFollowButton?: boolean;
}

async function postAction(
  path: string,
  body: Record<string, string>
): Promise<UserContentStateView> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
    credentials: "same-origin",
  });

  const payload = (await response.json()) as {
    error?: string;
    userState?: UserContentStateView;
  };
  if (!response.ok || !payload.userState) {
    throw new Error(payload.error ?? `Request failed with ${response.status}.`);
  }
  return payload.userState;
}

export function UserContentStateControls({
  contentItemId,
  contentStatePath,
  storyFollowPath,
  initialUserState,
  onUserStateChange,
  compact = false,
  showArchiveButton = true,
  showFollowButton = false,
}: UserContentStateControlsProps) {
  const [userState, setUserState] = useState(initialUserState);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  async function runContentAction(action: string): Promise<void> {
    setPendingAction(action);
    try {
      const nextState = await postAction(contentStatePath, {
        contentItemId,
        action,
      });
      setUserState(nextState);
      onUserStateChange?.(nextState);
    } finally {
      setPendingAction(null);
    }
  }

  async function runStoryAction(action: "follow" | "unfollow"): Promise<void> {
    if (!storyFollowPath) {
      return;
    }
    setPendingAction(action);
    try {
      const nextState = await postAction(storyFollowPath, {
        contentItemId,
        action,
      });
      setUserState(nextState);
      onUserStateChange?.(nextState);
    } finally {
      setPendingAction(null);
    }
  }

  const buttonClassName = compact
    ? "inline-flex h-7 items-center rounded-md border border-input px-2.5 text-[11px] font-medium transition-colors hover:bg-accent disabled:opacity-50"
    : "inline-flex h-9 items-center rounded-md border border-input px-3 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50";
  const stackClassName = compact ? "flex flex-wrap gap-2" : "flex flex-wrap gap-3";

  return (
    <div className={stackClassName}>
      <button
        type="button"
        disabled={pendingAction !== null}
        onClick={() => {
          void runContentAction(userState.is_seen ? "mark_unread" : "mark_seen");
        }}
        className={buttonClassName}
      >
        {pendingAction === "mark_seen" || pendingAction === "mark_unread"
          ? "Saving..."
          : userState.is_seen
            ? "Mark unread"
            : "Mark seen"}
      </button>

      <button
        type="button"
        disabled={pendingAction !== null}
        onClick={() => {
          void runContentAction(userState.saved_state === "saved" ? "unsave" : "save");
        }}
        className={buttonClassName}
      >
        {pendingAction === "save" || pendingAction === "unsave"
          ? "Saving..."
          : userState.saved_state === "saved"
            ? "Unsave"
            : "Save"}
      </button>

      {showArchiveButton && userState.saved_state === "saved" && (
        <button
          type="button"
          disabled={pendingAction !== null}
          onClick={() => {
            void runContentAction("archive");
          }}
          className={buttonClassName}
        >
          {pendingAction === "archive" ? "Saving..." : "Archive"}
        </button>
      )}

      {showFollowButton && userState.story_followable && storyFollowPath && (
        <button
          type="button"
          disabled={pendingAction !== null}
          onClick={() => {
            void runStoryAction(userState.is_following_story ? "unfollow" : "follow");
          }}
          className={buttonClassName}
        >
          {pendingAction === "follow" || pendingAction === "unfollow"
            ? "Saving..."
            : userState.is_following_story
              ? "Following"
              : "Follow story"}
        </button>
      )}
    </div>
  );
}
