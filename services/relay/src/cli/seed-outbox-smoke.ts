import { loadRelayConfig } from "../config";
import { createPgPool } from "../db";
import { insertFoundationSmokeEvent } from "../outbox";

async function main(): Promise<void> {
  const config = loadRelayConfig();
  const pool = createPgPool(config);

  try {
    const eventId = await insertFoundationSmokeEvent(pool);
    console.log(`Inserted outbox smoke event: ${eventId}`);
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
