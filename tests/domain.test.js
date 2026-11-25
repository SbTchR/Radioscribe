import test from "node:test";
import assert from "node:assert/strict";
import {
  initial,
  insert,
  split,
  merge,
  move,
  apply,
  transaction,
  matches,
  stats,
  words,
  record,
} from "../src/domain.js";
for (const n of [2, 3, 4])
  test("Création avec " + n + " chroniqueurs", () => {
    const r = initial("Sujet", ["Léa", "Noah", "Rose", "Luc"].slice(0, n));
    assert.equal(new Set(r.meta.data.people.map((p) => p.id)).size, n);
    assert.deepEqual(r.meta.data.sections, ["intro"]);
    assert.equal(stats(r).total, 0);
  });
test("Division, insertion, déplacement et fusion conservent le dialogue", () => {
  let r = initial("Sujet", ["Léa", "Noah"]),
    [a, b] = r.meta.data.people;
  const save = (u) => {
    r = apply(r, transaction(r, u, "essai"));
  };
  const original = "Le sport est né en Angleterre. Puis il a voyagé.";
  const first = insert(r, "intro", a.id, 0, original);
  save(first.updates);
  save(split(r, "intro", first.id, original.indexOf(" Puis")));
  const other = insert(r, "intro", b.id, 1, "Ah bon ?");
  save(other.updates);
  assert.throws(() => merge(r, "intro", first.id));
  assert.equal(r.intro.data.blocks.length, 3);
  save({
    end: { kind: "end", blocks: [] },
    meta: { ...r.meta.data, sections: ["intro", "end"] },
  });
  save(move(r, "intro", "end", other.id, 0));
  save(merge(r, "intro", first.id));
  assert.equal(r[first.id].data.text, original);
  assert.equal(words("L’école — très bien ! 25"), 4);
  assert.ok(stats(r).total > 0);
  assert.equal(
    stats(r).people.reduce((sum, p) => sum + p.percent, 0),
    100,
  );
});
test("Écritures indépendantes et rejet atomique d’une révision périmée", () => {
  const r = { a: record({ text: "a" }), b: record({ text: "b" }) },
    a = transaction(r, { a: { text: "autre" } }, ""),
    b = transaction(r, { b: { text: "encore" } }, ""),
    both = transaction(r, { a: null, b: null }, "");
  const next = apply(apply(r, a), b);
  assert.equal(next.b.data.text, "encore");
  assert.equal(matches(next, both), false);
  assert.throws(() => apply(next, both));
  assert.ok(next.a && next.b);
});
