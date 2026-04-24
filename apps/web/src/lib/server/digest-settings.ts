import type { DigestCadence, UserDigestSettingsView } from "@newsportal/contracts";
import type { Pool } from "pg";

const DIGEST_CADENCES: DigestCadence[] = ["daily", "every_3_days", "weekly", "monthly"];

function coerceCadence(value: unknown): DigestCadence {
  const normalized = String(value ?? "").trim();
  return DIGEST_CADENCES.includes(normalized as DigestCadence)
    ? (normalized as DigestCadence)
    : "weekly";
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  if (value == null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function coerceInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
}

function parseTimeValue(value: unknown): { hour: number; minute: number } {
  const normalized = String(value ?? "").trim();
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return { hour: 9, minute: 0 };
  }
  return {
    hour: coerceInteger(match[1], 9, 0, 23),
    minute: coerceInteger(match[2], 0, 0, 59),
  };
}

function validateTimezoneName(value: unknown): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error("Timezone is required when scheduled digests are enabled.");
  }
  try {
    Intl.DateTimeFormat("en-US", { timeZone: normalized }).format(new Date());
  } catch {
    throw new Error(`Unsupported timezone "${normalized}".`);
  }
  return normalized;
}

function addMonths(date: Date, months: number): Date {
  const copy = new Date(date.getTime());
  const day = copy.getUTCDate();
  copy.setUTCDate(1);
  copy.setUTCMonth(copy.getUTCMonth() + months);
  const maxDay = new Date(Date.UTC(copy.getUTCFullYear(), copy.getUTCMonth() + 1, 0)).getUTCDate();
  copy.setUTCDate(Math.min(day, maxDay));
  return copy;
}

function computeNextDigestRunAt(input: {
  now?: Date;
  cadence: DigestCadence;
  timeZone: string;
  sendHour: number;
  sendMinute: number;
  baseRunAt?: Date | null;
}): Date {
  const now = input.now ?? new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: input.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  function toLocalParts(date: Date) {
    const parts = Object.fromEntries(
      formatter.formatToParts(date).map((part) => [part.type, part.value])
    );
    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(parts.hour),
      minute: Number(parts.minute),
      second: Number(parts.second),
    };
  }

  function toUtcDate(parts: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
  }): Date {
    const guess = new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0)
    );
    const guessLocal = toLocalParts(guess);
    const deltaMinutes =
      (guessLocal.year - parts.year) * 525600 +
      (guessLocal.month - parts.month) * 43200 +
      (guessLocal.day - parts.day) * 1440 +
      (guessLocal.hour - parts.hour) * 60 +
      (guessLocal.minute - parts.minute);
    return new Date(guess.getTime() - deltaMinutes * 60_000);
  }

  const localNow = toLocalParts(now);
  const baseLocal = input.baseRunAt ? toLocalParts(input.baseRunAt) : localNow;
  let nextParts = {
    year: baseLocal.year,
    month: baseLocal.month,
    day: baseLocal.day,
    hour: input.sendHour,
    minute: input.sendMinute,
  };

  if (!input.baseRunAt) {
    const candidate = toUtcDate(nextParts);
    if (candidate.getTime() <= now.getTime()) {
      const tomorrow = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowLocal = toLocalParts(tomorrow);
      nextParts = {
        year: tomorrowLocal.year,
        month: tomorrowLocal.month,
        day: tomorrowLocal.day,
        hour: input.sendHour,
        minute: input.sendMinute,
      };
    }
    return toUtcDate(nextParts);
  }

  const baseCandidate = toUtcDate(nextParts);
  let nextDate: Date;
  if (input.cadence === "daily") {
    nextDate = new Date(baseCandidate.getTime() + 24 * 60 * 60 * 1000);
  } else if (input.cadence === "every_3_days") {
    nextDate = new Date(baseCandidate.getTime() + 3 * 24 * 60 * 60 * 1000);
  } else if (input.cadence === "weekly") {
    nextDate = new Date(baseCandidate.getTime() + 7 * 24 * 60 * 60 * 1000);
  } else {
    nextDate = addMonths(baseCandidate, 1);
  }
  return toUtcDate({
    ...toLocalParts(nextDate),
    hour: input.sendHour,
    minute: input.sendMinute,
  });
}

type DigestSettingsRow = {
  is_enabled: boolean;
  cadence: DigestCadence;
  send_hour: number;
  send_minute: number;
  timezone: string | null;
  skip_if_empty: boolean;
  next_run_at: string | null;
  last_sent_at: string | null;
  last_delivery_status: UserDigestSettingsView["last_delivery_status"];
  last_delivery_error: string | null;
  recipient_email: string | null;
};

export async function loadDigestSettings(
  pool: Pool,
  userId: string
): Promise<UserDigestSettingsView> {
  const result = await pool.query<DigestSettingsRow>(
    `
      select
        coalesce(uds.is_enabled, false) as is_enabled,
        coalesce(uds.cadence, 'weekly')::text as cadence,
        coalesce(uds.send_hour, 9) as send_hour,
        coalesce(uds.send_minute, 0) as send_minute,
        uds.timezone,
        coalesce(uds.skip_if_empty, true) as skip_if_empty,
        uds.next_run_at::text as next_run_at,
        uds.last_sent_at::text as last_sent_at,
        uds.last_delivery_status,
        uds.last_delivery_error,
        (
          select unc.config_json ->> 'email'
          from user_notification_channels unc
          where unc.user_id = $1
            and unc.channel_type = 'email_digest'
            and unc.is_enabled = true
          order by unc.created_at desc
          limit 1
        ) as recipient_email
      from users u
      left join user_digest_settings uds on uds.user_id = u.user_id
      where u.user_id = $1
      limit 1
    `,
    [userId]
  );

  const row = result.rows[0];
  return {
    is_enabled: row?.is_enabled ?? false,
    cadence: row?.cadence ?? "weekly",
    send_hour: row?.send_hour ?? 9,
    send_minute: row?.send_minute ?? 0,
    timezone: row?.timezone ?? null,
    skip_if_empty: row?.skip_if_empty ?? true,
    next_run_at: row?.next_run_at ?? null,
    last_sent_at: row?.last_sent_at ?? null,
    last_delivery_status: row?.last_delivery_status ?? null,
    last_delivery_error: row?.last_delivery_error ?? null,
    recipient_email: row?.recipient_email ?? null,
  };
}

export async function saveDigestSettings(
  pool: Pool,
  userId: string,
  payload: Record<string, unknown>
): Promise<UserDigestSettingsView> {
  const current = await loadDigestSettings(pool, userId);
  const isEnabled = coerceBoolean(payload.digestEnabled, current.is_enabled);
  const cadence = coerceCadence(payload.digestCadence ?? current.cadence);
  const timeParts = parseTimeValue(
    payload.digestTime ?? `${String(current.send_hour).padStart(2, "0")}:${String(current.send_minute).padStart(2, "0")}`
  );
  const skipIfEmpty = coerceBoolean(payload.digestSkipIfEmpty, current.skip_if_empty);
  const timezone = String(payload.digestTimezone ?? current.timezone ?? "").trim();

  if (isEnabled && !current.recipient_email) {
    throw new Error("Connect an email digest channel before enabling scheduled digests.");
  }

  const normalizedTimezone = timezone ? validateTimezoneName(timezone) : null;
  if (isEnabled && !normalizedTimezone) {
    throw new Error("Timezone is required when scheduled digests are enabled.");
  }

  const nextRunAt =
    isEnabled && normalizedTimezone
      ? computeNextDigestRunAt({
          cadence,
          timeZone: normalizedTimezone,
          sendHour: timeParts.hour,
          sendMinute: timeParts.minute,
        }).toISOString()
      : null;

  await pool.query(
    `
      insert into user_digest_settings (
        user_id,
        is_enabled,
        cadence,
        send_hour,
        send_minute,
        timezone,
        skip_if_empty,
        next_run_at,
        last_delivery_status,
        last_delivery_error
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, null, null)
      on conflict (user_id) do update
      set
        is_enabled = excluded.is_enabled,
        cadence = excluded.cadence,
        send_hour = excluded.send_hour,
        send_minute = excluded.send_minute,
        timezone = excluded.timezone,
        skip_if_empty = excluded.skip_if_empty,
        next_run_at = excluded.next_run_at,
        last_delivery_status = case
          when excluded.is_enabled = false then null
          else user_digest_settings.last_delivery_status
        end,
        last_delivery_error = case
          when excluded.is_enabled = false then null
          else user_digest_settings.last_delivery_error
        end,
        updated_at = now()
    `,
    [
      userId,
      isEnabled,
      cadence,
      timeParts.hour,
      timeParts.minute,
      normalizedTimezone,
      skipIfEmpty,
      nextRunAt,
    ]
  );

  if (normalizedTimezone) {
    await pool.query(
      `
        update user_profiles
        set
          timezone = $2,
          updated_at = now()
        where user_id = $1
      `,
      [userId, normalizedTimezone]
    );
  }

  return loadDigestSettings(pool, userId);
}
