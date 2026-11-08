import { Client, type ClientConfig } from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import { localHarness } from "../auth/local";
import { accountKeys, accounts as baseAccounts, keys as baseKeys, seed, tables, quote, type Relations } from "../domain/fixture";
import { limits } from "../../unit/server/llm/fixtures";

// Reuse the verified T-03 persisted snapshot fixture under a distinct namespace.
// The seed contains all six role identities; nothing is written to hosted services.
export const remap = (value: string) => value.replaceAll("37f00000", "38f00000");
export const accounts = Object.fromEntries(accountKeys.map(key => [key, {
  ...baseAccounts[key], id: remap(baseAccounts[key].id), email: `t04-${key.toLowerCase()}@example.test`,
}])) as typeof baseAccounts;
export const keys = Object.fromEntries(Object.entries(baseKeys).map(([key, value]) => [key, remap(value)])) as Record<keyof typeof baseKeys, string>;
export { accountKeys, limits };
export type TestHarness = Awaited<ReturnType<typeof openHarness>>;

function mapValue(value: unknown): unknown {
  if (typeof value === "string") return remap(value);
  if (Array.isArray(value)) return value.map(mapValue);
  return value;
}
export async function openHarness() {
  const local = localHarness();
  await local.db.connect();
  const connections: Client[] = [];
  const clients = {} as Record<typeof accountKeys[number], SupabaseClient>;
  const created: string[] = [];
  const relations: Relations = new Map();
  const catalog = await local.db.query<{ schema: string; name: string }>(`
    select n.nspname as schema, c.relname as name from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public','private') and c.relkind = 'r'
  `);
  for (const table of tables) {
    const row = catalog.rows.find(row => row.name === table);
    if (!row) throw new Error(`Missing established T-03 fixture table ${table}`);
    relations.set(table, row.schema);
  }
  try {
  for (const key of accountKeys) {
    const account = accounts[key];
    const { data, error } = await local.admin.auth.admin.createUser({ id: account.id,
      email: account.email, password: "t04 local fixture password", email_confirm: true,
      user_metadata: { display_name: key, role: account.role } });
    if (error || !data.user) throw new Error(`Cannot provision T-04 local account ${key}`);
    created.push(data.user.id);
    const client = local.client();
    const signIn = await client.auth.signInWithPassword({ email: account.email, password: "t04 local fixture password" });
    if (signIn.error) throw new Error(`Cannot sign in T-04 local account ${key}`);
    clients[key] = client;
  }
  await local.db.query("begin");
  try {
    const seedConnection = { query: (sql: string, values?: unknown[]) => local.db.query(sql, values?.map(mapValue)) } as Client;
    await seed(seedConnection, relations);
    await local.db.query("commit");
  } catch (error) { await local.db.query("rollback"); throw error; }
  } catch (error) { await cleanup(); throw error; }

  async function connection(role: "service_role" | "authenticated" | "anon" = "service_role", accountId?: string) {
    // A fresh physical connection per contender, using only already-validated loopback configuration.
    const db = new Client((local.db as unknown as { connectionParameters: ClientConfig }).connectionParameters);
    await db.connect(); connections.push(db);
    await db.query(`set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claims',$2,false)",
      [accountId ?? "", JSON.stringify({ sub: accountId, role })]);
    return db;
  }
  async function cleanup() {
    for (const db of connections) await db.end();
    // Committed race fixtures cannot use rollback-only cleanup. Superuser-only,
    // test-owned IDs and local session trigger suspension permit historical-row cleanup.
    await local.db.query("begin");
    try {
      await local.db.query("set local session_replication_role = replica");
      const appTables = await local.db.query<{ schema: string; name: string; columns: string[]; primary_columns: string[] }>(`
        select n.nspname as schema, c.relname as name,
          array_agg(a.attname::text) filter (where a.atttypid = 'uuid'::regtype) as columns,
          array_agg(a.attname::text) filter (where a.atttypid = 'uuid'::regtype and exists (select 1 from pg_index i where i.indrelid=c.oid and i.indisprimary and a.attnum=any(i.indkey))) as primary_columns
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
        where n.nspname in ('public','private') and c.relkind = 'r'
        group by c.oid,n.nspname,c.relname
      `);
      // Follow UUID references transitively from test-owned records so rows with
      // server-generated IDs (events/reservations) are removed as well.
      const owned = new Set(created);
      let expanded = true;
      while (expanded) {
        expanded = false;
        for (const row of appTables.rows) {
          if (!row.columns?.length) continue;
          const predicates = row.columns.map(column => `(${quote(column)}::text like '38f00000-%' or ${quote(column)}::text = any($1::text[]))`);
          predicates.push("to_jsonb(t)::text like '%t04-llm-acceptance%'");
          const found = await local.db.query(`select ${row.columns.map(quote).join(",")} from ${quote(row.schema)}.${quote(row.name)} t where ${predicates.join(" or ")}`, [[...owned]]);
          // Add only primary identities, never foreign references to shared
          // parent state. This follows descendants without absorbing outsiders.
          for (const record of found.rows) for (const column of row.primary_columns ?? []) {
            const value = record[column];
            if (typeof value === "string" && !owned.has(value)) { owned.add(value); expanded = true; }
          }
        }
      }
      for (const row of appTables.rows) {
        const predicates = (row.columns ?? []).map(column => `${quote(column)}::text = any($1::text[])`);
        predicates.push("to_jsonb(t)::text like '%t04-llm-acceptance%'");
        await local.db.query(`delete from ${quote(row.schema)}.${quote(row.name)} t where ${predicates.join(" or ")}`, [[...owned]]);
      }
      await local.db.query("commit");
    } catch (error) { await local.db.query("rollback"); throw error; }
    finally { await local.db.end(); }
    for (const id of created) {
      const { error } = await local.admin.auth.admin.deleteUser(id);
      if (error) throw new Error("Unable to remove T-04 fixture Auth account");
    }
  }
  return { ...local, clients, connection, cleanup };
}
