import { loadRelayConfig } from "../config";
import { createPgPool } from "../db";
import { applyPendingMigrations } from "../migrations";

async function main(): Promise<void> {
  const config = loadRelayConfig();
  const pool = createPgPool(config);

  try {
    const appliedMigrations = await applyPendingMigrations(pool);

    if (appliedMigrations.length === 0) {
      console.log("No pending migrations.");
      return;
    }

    console.log(`Applied migrations: ${appliedMigrations.join(", ")}`);
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
