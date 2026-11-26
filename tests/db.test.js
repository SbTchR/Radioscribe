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

test("Conducteur complet, accès cloisonnés, progression et retours enseignants", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('radio.test_uid',true),'')::uuid $$;
      create schema realtime; create table realtime.messages(extension text);
      create function realtime.topic() returns text language sql as $$ select '' $$;
      create publication supabase_realtime;`);
    async function who(id) {
      await db.exec("reset role; set role authenticated");
      await db.query("select set_config('radio.test_uid',$1,false)", [id]);
    }
    async function rpc(name, ...args) {
      const placeholders = args.map((_, i) => "$" + (i + 1)).join(",");
      return (
        await db.query(
          "select public.radio_" + name + "(" + placeholders + ") v",
          args,
        )
      ).rows[0].v;
    }
    function tx(room, rows, changes) {
      const t = transaction(rows, changes, "test");
      return rpc("apply", room, t.id, JSON.stringify(t.changes));
    }
    const teacher = uid(),
      student = uid(),
      teammate = uid(),
      outsider = uid();
    const files = (await readdir("supabase/migrations")).sort();
    const moderationIndex = files.findIndex((file) =>
      file.endsWith("_radio_moderation.sql"),
    );
    await db.exec(await readFile("supabase/migrations/" + files[0], "utf8"));
    await who(teacher);
    const oldRows = initial("Ancien projet", ["A", "B"]);
    oldRows.meta.data.speed = 130;
    const old = await rpc("create", JSON.stringify(oldRows));
    await db.exec("reset role");
    for (const file of files.slice(1, moderationIndex))
      await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
    await who(student);
    assert.equal(await rpc("join", old.code.toLowerCase()), old.id);
    assert.match((await rpc("read", old.id)).code, /^[2-9A-HJ-NP-Z]{5}$/);
    assert.equal((await rpc("read", old.id)).rows.meta.data.speed, 130);

    await who(teacher);
    const show = await rpc("program_create", "Émission de classe", 4, true);
    const noAnimation = await rpc(
      "program_create",
      "Émission sans animation",
      3,
      false,
    );
    assert.deepEqual(
      (await rpc("program_read", noAnimation)).items.map((i) => i.kind),
      [
        "jingle",
        "music",
        "chronicle",
        "music",
        "chronicle",
        "music",
        "jingle",
        "chronicle",
        "music",
        "jingle",
      ],
    );
    const program = await rpc("program_read", show);
    assert.deepEqual(
      program.items.map((i) => i.kind),
      [
        "jingle",
        "opening",
        "music",
        "transition",
        "chronicle",
        "music",
        "transition",
        "chronicle",
        "music",
        "jingle",
        "transition",
        "chronicle",
        "music",
        "transition",
        "chronicle",
        "music",
        "closing",
        "jingle",
      ],
    );
    const [first, second] = program.items.filter((i) => i.kind === "chronicle");
    const opening = program.items[1];
    const music = program.items[2];
    const shortCodes = program.items.filter((i) => i.room).map((i) => i.code);
    assert.equal(new Set(shortCodes).size, shortCodes.length);
    assert.ok(shortCodes.every((c) => /^[2-9A-HJ-NP-Z]{5}$/.test(c)));
    await rpc("program_update", show, first.id, "Le relief", 0, [
      "Alice",
      "Benoît",
    ]);
    await rpc("program_update", show, music.id, "Album de classe", 125, null);
    assert.equal(
      (await rpc("program_read", show)).items.find((i) => i.id === music.id)
        .seconds,
      125,
    );
    const next = await rpc(
      "program_add",
      show,
      "music",
      "Morceau additionnel",
      first.id,
    );
    assert.equal((await rpc("program_read", show)).items[5].id, next);
    await rpc("program_move", show, next, 1);
    assert.equal((await rpc("program_read", show)).items[6].id, next);
    const firstDoc = await rpc("read", first.room);
    const block = insert(
      firstDoc.rows,
      "intro",
      firstDoc.rows.meta.data.people[0].id,
      0,
      "mot ".repeat(170),
    );
    assert.equal(await tx(first.room, firstDoc.rows, block.updates), "ok");
    await rpc(
      "add_feedback",
      first.room,
      block.id,
      "Un exemple précis aiderait.",
      true,
    );
    await rpc(
      "add_feedback",
      second.room,
      null,
      "Conseil réservé au deuxième groupe.",
      true,
    );
    const protectedThread = Object.keys(
      (await rpc("read", second.room)).rows,
    ).find((key) => key.startsWith("feedback:"));

    await who(student);
    await rpc("join", first.code);
    const legacyId = "feedback:" + uid();
    await rpc(
      "post_message",
      first.room,
      legacyId.slice("feedback:".length),
      "Un message envoyé avant la mise à jour.",
      null,
      null,
      firstDoc.rows.meta.data.people[0].id,
      null,
      false,
    );
    await db.exec("reset role");
    for (const file of files.slice(moderationIndex))
      await db.exec(await readFile("supabase/migrations/" + file, "utf8"));

    await who(teacher);
    const migrated = await rpc("program_read", show);
    const migratedFirst = migrated.items.find(({ id }) => id === first.id);
    const migratedMusic = migrated.items.find(({ id }) => id === music.id);
    assert.equal(migratedFirst.baseTitle, "Chronique 1");
    assert.equal(migratedFirst.title, "Le relief");
    assert.equal(migratedFirst.code, first.code);
    assert.equal(migratedMusic.baseTitle, "Musique 0");
    assert.equal(migratedMusic.title, "Album de classe");
    assert.equal(migratedMusic.artist, null);
    await rpc(
      "program_update_details",
      show,
      music.id,
      "Album de classe",
      125,
      null,
      "Joe Dassin",
    );
    await rpc("program_update", show, music.id, "Album de classe", 125, null);

    const freshShow = await rpc("program_create", "Nouvelle émission", 1, true);
    const fresh = await rpc("program_read", freshShow);
    assert.deepEqual(
      fresh.items.map((cue) => cue.baseTitle),
      [
        "Jingle d’ouverture",
        "Prise d’antenne",
        "Musique 0",
        "Transition 1",
        "Chronique 1",
        "Musique 1",
        "Remise d’antenne",
        "Jingle de fin",
      ],
    );
    const added = await rpc(
      "program_add_details",
      freshShow,
      "music",
      "Les Champs Elysées",
      fresh.items[2].id,
      " Joe Dassin ",
    );
    const addedView = async () =>
      (await rpc("program_read", freshShow)).items.find(
        ({ id }) => id === added,
      );
    assert.equal((await addedView()).baseTitle, "Musique 2");
    assert.equal((await addedView()).title, "Les Champs Elysées");
    assert.equal((await addedView()).artist, "Joe Dassin");
    await rpc("program_move", freshShow, added, 1);
    await rpc("program_archive", freshShow, added, true);
    await rpc("program_archive", freshShow, added, false);
    assert.equal((await addedView()).baseTitle, "Musique 2");
    await rpc("program_update_details", freshShow, added, "", 120, null, "");
    const cleared = await addedView();
    assert.equal(cleared.title, "Musique 2");
    assert.equal(cleared.artist, null);
    assert.equal(cleared.seconds, 120);
    const newChronicle = await rpc(
      "program_add_details",
      freshShow,
      "chronicle",
      "Les Grandes Découvertes",
      null,
      null,
    );
    const themed = (await rpc("program_read", freshShow)).items.find(
      ({ id }) => id === newChronicle,
    );
    assert.equal(themed.baseTitle, "Chronique 2");
    assert.equal(themed.title, "Les Grandes Découvertes");
    assert.equal(
      (await rpc("read", themed.room)).rows.meta.data.title,
      themed.title,
    );
    await rpc(
      "program_update_details",
      freshShow,
      newChronicle,
      "",
      0,
      null,
      null,
    );
    assert.equal(
      (await rpc("read", themed.room)).rows.meta.data.title,
      "Chronique 2",
    );

    await who(outsider);
    assert.equal(await rpc("program_read", show), null);
    assert.equal(await rpc("read", second.room), null);
    assert.equal(await rpc("program_claim", show, uid()), false);

    await who(student);
    assert.equal(await rpc("join", first.code), first.room);
    const studentProgram = await rpc("program_read", show);
    const firstView = studentProgram.items.find((i) => i.id === first.id);
    const secondView = studentProgram.items.find((i) => i.id === second.id);
    assert.deepEqual(firstView.names, ["Alice", "Benoît"]);
    assert.equal(firstView.title, "Le relief");
    assert.equal(firstView.seconds, 60);
    assert.equal(firstView.status, "draft");
    const pupilMusic = studentProgram.items.find(({ id }) => id === music.id);
    assert.equal(pupilMusic.baseTitle, "Musique 0");
    assert.equal(pupilMusic.artist, "Joe Dassin");
    await assert.rejects(
      rpc(
        "program_update_details",
        show,
        music.id,
        "Titre modifié",
        125,
        null,
        "Artiste",
      ),
      /enseignant/,
    );
    await assert.rejects(
      rpc(
        "program_add_details",
        show,
        "music",
        "Nouveau titre",
        null,
        "Artiste",
      ),
      /enseignant/,
    );
    assert.equal(studentProgram.managerKey, null);
    assert.equal(secondView.code, null);
    assert.equal(secondView.editable, false);
    assert.equal(firstView.editable, true);
    const secondDoc = await rpc("read", second.room);
    assert.equal(secondDoc.context.editable, false);
    assert.equal(secondDoc.code, null);
    assert.ok(
      !Object.keys(secondDoc.rows).some((id) => id.startsWith("feedback:")),
    );
    await assert.rejects(
      tx(second.room, secondDoc.rows, { intro: null }),
      /refusé/,
    );
    await assert.rejects(rpc("program_rename", show, "Non"), /enseignant/);
    await assert.rejects(
      rpc("add_feedback", first.room, null, "Tentative", true),
      /enseignant/,
    );
    const own = await rpc("read", first.room);
    assert.equal(own.rows.meta.data.speed, 170);
    const legacy = own.rows[legacyId];
    assert.equal(legacy.owned, undefined);
    const change = (key, revision, text, important = false) =>
      rpc("change_comment", first.room, key, revision, text, important);
    const unreadCount = async () =>
      (await rpc("program_read", show)).items.find(({ id }) => id === first.id)
        .unreadMessages;
    await assert.rejects(
      change(legacyId, legacy.rev, null),
      /que tu as envoyés/,
    );
    await who(teacher);
    assert.equal(await unreadCount(), 1);
    await change(legacyId, legacy.rev, null);
    assert.equal(await unreadCount(), 0);
    await who(student);
    assert.equal(
      (await rpc("read", first.room)).rows[legacyId].data.text,
      undefined,
    );
    const originalPeople = own.rows.meta.data.people;
    const renamedPeople = originalPeople.map((person, i) =>
      i === 0 ? { ...person, name: "Alicia" } : person,
    );
    await assert.rejects(
      tx(first.room, own.rows, {
        meta: { ...own.rows.meta.data, people: originalPeople.toReversed() },
      }),
      /voix de l’équipe/,
    );
    await assert.rejects(
      tx(first.room, own.rows, {
        meta: { ...own.rows.meta.data, people: originalPeople.slice(0, 1) },
      }),
      /voix de l’équipe/,
    );
    assert.equal(
      await tx(first.room, own.rows, {
        meta: { ...own.rows.meta.data, people: renamedPeople },
      }),
      "ok",
    );
    const renamedDoc = await rpc("read", first.room);
    assert.deepEqual(renamedDoc.rows.meta.data.people, renamedPeople);
    assert.equal(renamedDoc.rows[block.id].data.speaker, originalPeople[0].id);
    assert.equal(renamedDoc.code, first.code);
    assert.deepEqual(
      (await rpc("program_read", show)).items.find(
        (item) => item.id === first.id,
      ).names,
      ["Alicia", "Benoît"],
    );
    assert.ok(
      Object.values(own.rows).some(
        (r) => r.data.important && r.data.block === block.id,
      ),
    );
    await assert.rejects(
      tx(first.room, own.rows, { "feedback:forged": { text: "Conseil" } }),
      /protégé/,
    );

    const [commentId, comment] = Object.entries(own.rows).find(
      ([key, row]) =>
        key.startsWith("feedback:") && row.data.block === block.id,
    );
    const [alice, benoit] = originalPeople.map((person) => person.id);
    const otherSpeaker = secondDoc.rows.meta.data.people[0].id;
    function post(
      room,
      {
        id = uid(),
        text = "Notre réponse",
        parent = null,
        sender = alice,
        recipient = null,
        important = false,
      } = {},
    ) {
      return rpc(
        "post_message",
        room,
        id,
        text,
        null,
        parent,
        sender,
        recipient,
        important,
      );
    }
    await assert.rejects(post(second.room), /groupe refusé/);
    await assert.rejects(post(first.room, { sender: otherSpeaker }), /prénom/);
    await assert.rejects(
      post(first.room, { recipient: otherSpeaker }),
      /autre membre/,
    );
    await assert.rejects(
      post(first.room, { recipient: alice }),
      /autre membre/,
    );
    await assert.rejects(
      post(first.room, { parent: protectedThread }),
      /indisponible/,
    );
    await assert.rejects(post(first.room, { important: true }), /enseignant/);
    await assert.rejects(
      rpc(
        "change_comment",
        first.room,
        commentId,
        comment.rev,
        "Modifié par un élève",
        false,
      ),
      /enseignant/,
    );
    await assert.rejects(
      rpc("mark_feedback_read", first.room, own.version),
      /enseignant/,
    );

    const replyId = uid();
    await post(first.room, { id: replyId, parent: commentId });
    const afterReply = await rpc("read", first.room);
    const reply = afterReply.rows["feedback:" + replyId];
    assert.equal(reply.data.parent, commentId);
    assert.equal(reply.data.block, block.id);
    assert.equal(reply.data.role, "student");
    assert.equal(reply.data.sender, alice);
    assert.equal(reply.owned, true);
    assert.deepEqual(Object.keys(reply).sort(), ["data", "owned", "rev"]);
    await post(first.room, { id: replyId, parent: commentId });
    assert.equal((await rpc("read", first.room)).version, afterReply.version);

    const directId = uid();
    await post(first.room, {
      id: directId,
      text: "Peux-tu relire l’introduction ?",
      recipient: benoit,
    });
    const directKey = "feedback:" + directId;
    const directBefore = (await rpc("read", first.room)).rows[directKey];
    assert.equal(directBefore.owned, true);
    await assert.rejects(
      change(directKey, directBefore.rev, "Prioritaire", true),
      /enseignant/,
    );
    await change(
      directKey,
      directBefore.rev,
      "Relis notre introduction, s’il te plaît.",
    );
    const directEdited = (await rpc("read", first.room)).rows[directKey];
    assert.equal(directEdited.data.edited, true);
    assert.equal(directEdited.data.recipient, benoit);
    await assert.rejects(
      change(directKey, directBefore.rev, null),
      /message a changé/,
    );
    assert.equal(await unreadCount(), null);
    await who(teammate);
    await rpc("join", first.code);
    const received = (await rpc("read", first.room)).rows[directKey];
    assert.equal(received.owned, undefined);
    assert.equal(received.data.recipient, benoit);
    assert.equal(
      received.data.text,
      "Relis notre introduction, s’il te plaît.",
    );
    await assert.rejects(
      change(directKey, received.rev, "Changement par un camarade"),
      /que tu as envoyés/,
    );
    await assert.rejects(
      change(directKey, received.rev, null),
      /que tu as envoyés/,
    );
    await who(outsider);
    await rpc("join", second.code);
    const otherGroupView = await rpc("read", first.room);
    assert.ok(otherGroupView.rows[block.id]);
    assert.ok(
      !Object.keys(otherGroupView.rows).some((key) =>
        key.startsWith("feedback:"),
      ),
    );
    await assert.rejects(
      post(first.room, { parent: commentId }),
      /groupe refusé/,
    );

    await who(teacher);
    assert.equal(await unreadCount(), 2);
    await rpc("mark_feedback_read", first.room, afterReply.version);
    assert.equal(await unreadCount(), 1);
    await rpc(
      "mark_feedback_read",
      first.room,
      (await rpc("read", first.room)).version,
    );
    assert.equal(await unreadCount(), 0);
    await rpc("mark_feedback_read", first.room, afterReply.version);
    assert.equal(await unreadCount(), 0);
    await assert.rejects(
      change("feedback:" + replyId, reply.rev, "Changement par l’enseignant"),
      /supprimer ce message d’élève/,
    );
    await rpc(
      "change_comment",
      first.room,
      commentId,
      comment.rev,
      "Commentaire corrigé.",
      false,
    );
    const corrected = (await rpc("read", first.room)).rows[commentId];
    assert.equal(corrected.data.text, "Commentaire corrigé.");
    assert.equal(corrected.data.block, block.id);
    assert.equal(corrected.data.edited, true);
    await assert.rejects(
      rpc("change_comment", first.room, commentId, comment.rev, null, false),
      /message a changé/,
    );
    await rpc(
      "change_comment",
      first.room,
      commentId,
      corrected.rev,
      null,
      false,
    );
    await who(student);
    const afterDeletion = await rpc("read", first.room);
    assert.equal(afterDeletion.rows[commentId].data.deleted, true);
    assert.equal(afterDeletion.rows[commentId].data.text, undefined);
    assert.equal(
      afterDeletion.rows["feedback:" + replyId].data.text,
      "Notre réponse",
    );
    await change(directKey, directEdited.rev, null);
    assert.equal(
      (await rpc("read", first.room)).rows[directKey].data.text,
      undefined,
    );

    await who(teacher);
    await change("feedback:" + replyId, reply.rev, null);
    const moderatedReply = (await rpc("read", first.room)).rows[
      "feedback:" + replyId
    ];
    assert.equal(moderatedReply.data.deleted, true);
    assert.equal(moderatedReply.data.text, undefined);
    await rpc("program_archive", show, second.id, true);
    await who(student);
    assert.equal(await rpc("read", second.room), null);
    assert.equal(await rpc("join", second.code), null);
    assert.equal(await rpc("join", opening.code), opening.room);
    const animation = await rpc("read", opening.room);
    assert.equal(animation.rows.intro.data.kind, "opening");
    await assert.rejects(
      tx(opening.room, animation.rows, {
        meta: { ...animation.rows.meta.data, sections: ["intro", "end"] },
      }),
      /Structure/,
    );
    assert.equal(
      await tx(opening.room, animation.rows, {
        meta: {
          ...animation.rows.meta.data,
          people: animation.rows.meta.data.people.map((person, i) =>
            i === 0 ? { ...person, name: "Théo" } : person,
          ),
        },
      }),
      "ok",
    );
    const openingView = (await rpc("program_read", show)).items.find(
      (item) => item.id === opening.id,
    );
    assert.equal(openingView.assigned, true);
    assert.deepEqual(openingView.names, ["Théo", "Animateur 2"]);
    await who(outsider);
    assert.equal(await rpc("program_claim", show, program.managerKey), true);
    await rpc("program_archive", show, second.id, false);
    assert.equal(
      (await rpc("program_read", show)).items.find((i) => i.id === second.id)
        .code,
      second.code,
    );
    await assert.rejects(
      db.query("select manager_key from radio_private.shows"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
