import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { initial, insert, transaction, apply, uid } from "../src/domain.js";
test("Migration, isolation RLS, adhésion, limite de tentatives et transactions concurrentes", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('radio.test_uid',true),'')::uuid $$;
 create schema realtime;create table realtime.messages(extension text);create function realtime.topic() returns text language sql as $$ select '' $$;
 create publication supabase_realtime;`);
    for (const file of (await readdir("supabase/migrations")).sort())
      await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
    async function who(id) {
      await db.exec("reset role;set role authenticated");
      await db.query("select set_config('radio.test_uid',$1,false)", [id]);
    }
    async function q(sql, args = []) {
      return (await db.query(sql, args)).rows[0]?.v;
    }
    const a = uid(),
      b = uid(),
      outsider = uid();
    await who(a);
    const r = initial("Essai fictif", ["A", "B"]);
    const room = await q("select public.radio_create($1::jsonb) v", [
      JSON.stringify(r),
    ]);
    const read = () => q("select public.radio_read($1) v", [room.id]);
    const save = (tx) =>
      q("select public.radio_apply($1,$2,$3::jsonb) v", [
        room.id,
        tx.id,
        JSON.stringify(tx.changes),
      ]);
    await who(outsider);
    assert.equal(await read(), null);
    assert.equal(
      await q("select count(*)::int v from public.radio_changes"),
      0,
    );
    await assert.rejects(save(transaction(r, { intro: null }, "")), /refusé/);
    await assert.rejects(
      db.query("select * from radio_private.records"),
      /permission denied/,
    );
    for (let i = 0; i < 24; i++)
      assert.equal(await q("select public.radio_join($1) v", ["nope"]), null);
    assert.equal(await q("select public.radio_join($1) v", [room.code]), null);
    await who(b);
    assert.equal(
      await q("select public.radio_join($1) v", [room.code]),
      room.id,
    );
    const add = insert(r, "intro", r.meta.data.people[0].id, 0, "Bonjour"),
      tx = transaction(r, add.updates, "Ajouter");
    assert.equal(await save(tx), "ok");
    assert.equal(await save(tx), "ok");
    assert.equal((await read()).version, 1);
    const next = apply(r, tx),
      edit = transaction(
        next,
        { [add.id]: { ...next[add.id].data, text: "Bonsoir" } },
        "Écrire",
      );
    await who(a);
    assert.equal(await save(edit), "ok");
    const stale = transaction(
      next,
      { [add.id]: null, intro: { ...next.intro.data, blocks: [] } },
      "Supprimer",
    );
    assert.equal(await save(stale), "conflict");
    const snap = await read();
    assert.deepEqual(snap.rows.intro.data.blocks, [add.id]);
    assert.equal(snap.rows[add.id].data.text, "Bonsoir");
    const end = transaction(
      snap.rows,
      {
        meta: { ...r.meta.data, sections: ["intro", "end"] },
        end: { kind: "end", blocks: [] },
      },
      "Conclusion",
    );
    const concurrent = transaction(
      snap.rows,
      {
        meta: { ...r.meta.data, sections: ["intro", "end"] },
        end: { kind: "end", blocks: [] },
      },
      "Conclusion",
    );
    assert.equal(await save(end), "ok");
    await who(b);
    assert.equal(await save(concurrent), "conflict");
    await db.exec("reset role;set role anon");
    await assert.rejects(read(), /permission denied/);
  } finally {
    await db.close();
  }
});
