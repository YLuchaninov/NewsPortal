import { loadFetchersConfig } from "../config";
import { createPgPool } from "../db";
import { RssFetcherService } from "../fetchers";

async function main(): Promise<void> {
  const config = loadFetchersConfig();
  const pool = createPgPool(config);
  const service = new RssFetcherService(pool, config);

  try {
    const channelId = process.argv[2];

    if (channelId) {
      await service.pollChannel(channelId);
      console.log(`Fetched RSS channel ${channelId}.`);
      return;
    }

    await service.pollOnce();
    console.log("Fetched due RSS channels once.");
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
