import path from "node:path";

import {
  collectArticleYieldSnapshot,
  createArticleYieldPackRoot,
  createConfiguredPoolFromLocalEnv,
  writeSnapshotPack
} from "./article-yield-shared";

async function main(): Promise<void> {
  const pool = await createConfiguredPoolFromLocalEnv();
  try {
    const snapshot = await collectArticleYieldSnapshot(pool);
    const packRoot = await createArticleYieldPackRoot();
    await writeSnapshotPack(snapshot, packRoot);

    console.log(
      JSON.stringify(
        {
          packRoot,
          summary: {
            activeRssChannels: snapshot.baseline.activeRssChannels,
            fetchRuns: snapshot.baseline.fetchRuns,
            articleRows: snapshot.baseline.articleRows,
            distinctUrls: snapshot.baseline.distinctUrls,
            eligibleRows: snapshot.baseline.eligibleRows,
            filteredRows: snapshot.baseline.filteredRows,
            pendingArticleIngestRuns: snapshot.baseline.pendingArticleIngestRuns,
            transientFetchFailures: snapshot.baseline.transientFetchFailures
          },
          files: {
            analysis: path.join(packRoot, "analysis.md"),
            snapshot: path.join(packRoot, "snapshot.json")
          }
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
