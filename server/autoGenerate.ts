import { Client } from "pg";
import { mapSemanticDefinitions } from "./semanticMapper";
import * as db from "./db"; // helper functions for data‑source CRUD
import type { DataSourceRecord } from "../shared/governance";

/**
 * Pull the full CREATE TABLE DDL for all tables in a PostgreSQL data source.
 * The function queries `information_schema` and builds a minimal, portable DDL string.
 */
export async function generateSchemaSqlFromSource(source: DataSourceRecord): Promise<string> {
  const connectionString = process.env[source.secretEnvKey];
  if (!connectionString) {
    throw new Error("Missing connection string for the selected data source");
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const tablesRes = await client.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    `);

    const statements: string[] = [];
    for (const { table_name } of tablesRes.rows) {
      const colsRes = await client.query<{
        column_name: string;
        data_type: string;
        is_nullable: string;
        column_default: string | null;
      }>(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1;
      `, [table_name]);

      const cols = colsRes.rows
        .map(col => {
          const nullable = col.is_nullable === "YES" ? "" : " NOT NULL";
          const def = col.column_default ? ` DEFAULT ${col.column_default}` : "";
          return `  ${col.column_name} ${col.data_type}${nullable}${def}`;
        })
        .join(",\n");

      statements.push(`CREATE TABLE ${table_name} (\n${cols}\n);`);
    }
    return statements.join("\n\n");
  } finally {
    await client.end();
  }
}

/**
 * Auto‑generate semantic definitions from a discovered PostgreSQL source.
 * The function returns the list of definitions (status: pending_review) and persists them.
 */
export async function autoGenerateSemanticDefinitions(sourceId: number) {
  const source = await db.getDataSource(sourceId);
  if (!source) throw new Error("Data source not found");

  const schemaSql = await generateSchemaSqlFromSource(source);
  const definitions = await mapSemanticDefinitions(schemaSql);

  // Persist the newly inferred definitions – they start in a pending_review state.
  // `bulkCreateDefinitions` is a convenience helper you may add to `db.ts`.
  // For now we simply loop and insert.
  for (const def of definitions) {
    await db.createDefinition({
      kind: def.kind,
      name: def.name,
      description: def.description,
      expression: def.expression,
      aliases: def.aliases,
      evidence: def.evidence,
      status: "pending_review",
      version: 1,
      rationale: def.rationale,
    } as any);
  }

  return definitions;
}
