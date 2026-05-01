import { loadRelayConfig } from "../../../services/relay/src/config";
import { createPgPool } from "../../../services/relay/src/db";
import { insertFoundationSmokeEvent } from "../../../services/relay/src/outbox";

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
