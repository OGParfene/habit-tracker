import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
test("database isolates users, merges stale edits and keeps deletion tombstones", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated; insert into auth.users values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');`,
  );
  await db.exec(
    await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8"),
  );
  await db.exec(
    `set role authenticated; set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';`,
  );
  const sync = async (value, stamp = "2026-01-02T00:00:00Z") =>
    db.query("select * from public.sync_habit_records($1::jsonb)", [
      JSON.stringify([
        { key: "entry/2026-01-01/reading", value, updated_at: stamp },
      ]),
    ]);
  await sync({ status: "done", amount: 15 });
  let result = await sync({ status: "miss" }, "2026-01-01T00:00:00Z");
  assert.equal(result.rows[0].value.status, "done");
  await sync(null, "2026-01-03T00:00:00Z");
  result = await sync({ status: "done" });
  assert.equal(result.rows[0].value, null);
  await db.exec(
    `set request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';`,
  );
  assert.equal((await db.query("select * from habit_records")).rows.length, 0);
  await assert.rejects(
    db.exec(
      `insert into habit_records(user_id,key,value) values ('00000000-0000-4000-8000-000000000001','habit/a','{}');`,
    ),
    /row-level security/,
  );
  await db.exec("set role anon");
  await assert.rejects(
    db.query("select * from public.sync_habit_records('[]'::jsonb)"),
    /permission denied/,
  );
  await assert.rejects(
    db.query("select * from habit_records"),
    /permission denied/,
  );
  await db.close();
});
