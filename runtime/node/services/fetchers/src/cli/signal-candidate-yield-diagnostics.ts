import path from "node:path";

import {
  collectSignalCandidateYieldSnapshot,
  createSignalCandidateYieldPackRoot,
  createConfiguredPoolFromLocalEnv
} from "./signal-candidate-yield-shared";
import { writeSnapshotPack } from "./signal-candidate-yield-pack";

async function main(): Promise<void> {
  const pool = await createConfiguredPoolFromLocalEnv();
  try {
    const snapshot = await collectSignalCandidateYieldSnapshot(pool);
    const packRoot = await createSignalCandidateYieldPackRoot();
    await writeSnapshotPack(snapshot, packRoot);

    console.log(
      JSON.stringify(
        {
          packRoot,
          summary: {
            activeRssChannels: snapshot.baseline.activeRssChannels,
            fetchRuns: snapshot.baseline.fetchRuns,
            signalCandidateRows: snapshot.baseline.signalCandidateRows,
            distinctUrls: snapshot.baseline.distinctUrls,
            eligibleRows: snapshot.baseline.eligibleRows,
            filteredRows: snapshot.baseline.filteredRows,
            pendingSignalCandidateIngestRuns: snapshot.baseline.pendingSignalCandidateIngestRuns,
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
