import { Client } from "pg";
import type { DataSourceRecord } from "../shared/governance";

export async function discoverPostgres(source: DataSourceRecord) {
  const connectionString = process.env[source.secretEnvKey];
  if (!connectionString) return { state: "awaiting_credentials" as const, discovery: source.discovery };
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000, statement_timeout: 5000, ssl: connectionString.includes("sslmode=") || connectionString.includes("railway") ? { rejectUnauthorized: false } : undefined });
  try {
    await client.connect();
    const result = await client.query<{ schemas: string; tables: string; fields: string }>(`SELECT COUNT(DISTINCT table_schema)::text AS schemas, COUNT(DISTINCT table_name)::text AS tables, COUNT(*)::text AS fields FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog', 'information_schema')`);
    const row = result.rows[0] ?? { schemas: "0", tables: "0", fields: "0" };
    return { state: "policy_review" as const, discovery: { schemas: Number(row.schemas), tables: Number(row.tables), fields: Number(row.fields), sampledAt: new Date().toISOString() } };
  } finally {
    await client.end().catch(() => undefined);
  }
}
