export type UserContentSavedState = "none" | "saved" | "archived";
export type DigestCadence = "daily" | "every_3_days" | "weekly" | "monthly";
export type DigestDeliveryStatus = "queued" | "sent" | "skipped_empty" | "failed";

export interface UserContentStateView {
  is_new: boolean;
  is_seen: boolean;
  first_seen_at?: string | null;
  seen_at?: string | null;
  saved_state: UserContentSavedState;
  saved_at?: string | null;
  archived_at?: string | null;
  event_cluster_id?: string | null;
  story_followable: boolean;
  is_following_story: boolean;
  story_updated_since_seen: boolean;
}

export interface UserDigestSettingsView {
  is_enabled: boolean;
  cadence: DigestCadence;
  send_hour: number;
  send_minute: number;
  timezone?: string | null;
  skip_if_empty: boolean;
  next_run_at?: string | null;
  last_sent_at?: string | null;
  last_delivery_status?: DigestDeliveryStatus | null;
  last_delivery_error?: string | null;
  recipient_email?: string | null;
}
