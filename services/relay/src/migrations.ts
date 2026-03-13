import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Pool } from "pg";

const migrationsDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../database/migrations"
);

interface ApplyPendingMigrationsOptions {
  schema?: string;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll("\"", "\"\"")}"`;
}

export async function applyPendingMigrations(
  pool: Pool,
  options: ApplyPendingMigrationsOptions = {}
): Promise<string[]> {
  const schemaTableName = options.schema
    ? `${quoteIdentifier(options.schema)}.schema_migrations`
    : "schema_migrations";

  if (options.schema) {
    await pool.query(`create schema if not exists ${quoteIdentifier(options.schema)}`);
  }

  await pool.query(`
    create table if not exists ${schemaTableName} (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const appliedResult = await pool.query<{ name: string }>(
    `select name from ${schemaTableName}`
  );
  const appliedNames = new Set(appliedResult.rows.map((row) => row.name));
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((entry) => entry.endsWith(".sql"))
    .sort();

  const appliedThisRun: string[] = [];

  for (const migrationFile of migrationFiles) {
    if (appliedNames.has(migrationFile)) {
      continue;
    }

    const absolutePath = path.join(migrationsDirectory, migrationFile);
    const sql = await readFile(absolutePath, "utf8");
    const client = await pool.connect();

    try {
      await client.query("begin");
      if (options.schema) {
        await client.query(
          `set local search_path to ${quoteIdentifier(options.schema)}, public`
        );
      }
      await client.query(sql);
      await client.query(`insert into ${schemaTableName} (name) values ($1)`, [
        migrationFile
      ]);
      await client.query("commit");
      appliedThisRun.push(migrationFile);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  return appliedThisRun;
}
