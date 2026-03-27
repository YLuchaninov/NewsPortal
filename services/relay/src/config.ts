export interface RelayConfig {
  databaseUrl: string;
  redisUrl: string;
  relayPort: number;
  outboxPollIntervalMs: number;
  outboxBatchSize: number;
  enableSequenceRouting: boolean;
}

function readNumber(name: string, fallback: number): number {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);

  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number.`);
  }

  return parsed;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const normalized = rawValue.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Environment variable ${name} must be a boolean flag.`);
}

function buildPostgresUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const user = process.env.POSTGRES_USER ?? "newsportal";
  const password = process.env.POSTGRES_PASSWORD ?? "newsportal";
  const host = process.env.POSTGRES_HOST ?? "127.0.0.1";
  const port =
    process.env.POSTGRES_PORT ??
    (host === "127.0.0.1" || host === "localhost" ? "55432" : "5432");
  const database = process.env.POSTGRES_DB ?? "newsportal";

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

function buildRedisUrl(): string {
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }

  const host = process.env.REDIS_HOST ?? "127.0.0.1";
  const port =
    process.env.REDIS_PORT ??
    (host === "127.0.0.1" || host === "localhost" ? "56379" : "6379");

  return `redis://${host}:${port}`;
}

export function loadRelayConfig(): RelayConfig {
  return {
    databaseUrl: buildPostgresUrl(),
    redisUrl: buildRedisUrl(),
    relayPort: readNumber("RELAY_PORT", 4000),
    outboxPollIntervalMs: readNumber("OUTBOX_POLL_INTERVAL_MS", 1000),
    outboxBatchSize: readNumber("OUTBOX_BATCH_SIZE", 20),
    enableSequenceRouting: readBoolean("RELAY_ENABLE_SEQUENCE_ROUTING", true)
  };
}
