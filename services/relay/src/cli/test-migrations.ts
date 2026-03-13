import { randomUUID } from "node:crypto";

import { loadRelayConfig } from "../config";
import { createPgPool } from "../db";
import { applyPendingMigrations } from "../migrations";

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll("\"", "\"\"")}"`;
}

async function main(): Promise<void> {
  const config = loadRelayConfig();
  const pool = createPgPool(config);
  const schemaName = `migration_smoke_${randomUUID().replaceAll("-", "")}`;

  try {
    const appliedMigrations = await applyPendingMigrations(pool, {
      schema: schemaName
    });

    const tablesResult = await pool.query<{ table_name: string }>(
      `
        select table_name
        from information_schema.tables
        where table_schema = $1
      `,
      [schemaName]
    );
    const indexResult = await pool.query<{ indexname: string }>(
      `
        select indexname
        from pg_indexes
        where schemaname = $1
      `,
      [schemaName]
    );

    const actualTables = new Set(tablesResult.rows.map((row) => row.table_name));
    const actualIndexes = new Set(indexResult.rows.map((row) => row.indexname));

    const expectedTables = [
      "source_channels",
      "fetch_cursors",
      "articles",
      "article_external_refs",
      "outbox_events",
      "inbox_processed_events"
    ];
    const expectedIndexes = [
      "source_channels_provider_external_id_unique",
      "fetch_cursors_channel_cursor_type_unique",
      "articles_channel_source_article_id_unique",
      "articles_processing_state_idx",
      "outbox_events_status_created_at_idx"
    ];

    for (const tableName of expectedTables) {
      if (!actualTables.has(tableName)) {
        throw new Error(`Migration smoke expected table ${tableName} in schema ${schemaName}.`);
      }
    }

    for (const indexName of expectedIndexes) {
      if (!actualIndexes.has(indexName)) {
        throw new Error(`Migration smoke expected index ${indexName} in schema ${schemaName}.`);
      }
    }

    console.log(
      `Migration smoke passed in schema ${schemaName}: applied ${appliedMigrations.length} migrations and verified ${expectedTables.length} tables plus ${expectedIndexes.length} indexes.`
    );
  } finally {
    await pool.query(`drop schema if exists ${quoteIdentifier(schemaName)} cascade`);
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
