import test from "node:test";
import assert from "node:assert/strict";
import bank from "../src/atelier.json" with { type: "json" };
import { animationGuides } from "../src/animation.js";
import {
  initial,
  insert,
  split,
  reorderReply,
  apply,
  transaction,
  matches,
  stats,
  words,
  record,
} from "../src/domain.js";
test("Chaque piste de rédaction propose au moins sept phrases distinctes", () => {
  const categories = [
    bank.intro,
    bank.angles,
    bank.end,
    bank.sos,
    ...Object.values(animationGuides),
  ];
  for (const { title, phrases } of categories.flat()) {
    const choices = phrases.map((phrase) => phrase.trim());
    assert.ok(choices.every(Boolean), title);
    assert.equal(new Set(choices).size, choices.length, title);
    assert.ok(choices.length >= 7, title);
  }
});
for (const n of [2, 3, 4])
  test("Création avec " + n + " chroniqueurs", () => {
    const r = initial("Sujet", ["Léa", "Noah", "Rose", "Luc"].slice(0, n));
    assert.equal(new Set(r.meta.data.people.map((p) => p.id)).size, n);
    assert.deepEqual(r.meta.data.sections, ["intro"]);
    assert.equal(stats(r).total, 0);
  });
test("Division, insertion et déplacement conservent le dialogue", () => {
  let r = initial("Sujet", ["Léa", "Noah"]),
    [a, b] = r.meta.data.people;
  const save = (u) => {
    r = apply(r, transaction(r, u, "essai"));
  };
  const original = "Le sport est né en Angleterre. Puis il a voyagé.";
  const first = insert(r, "intro", a.id, 0, original);
  save(first.updates);
  save(split(r, "intro", first.id, original.indexOf(" Puis")));
  const second = r.intro.data.blocks[1];
  const other = insert(r, "intro", b.id, 1, "Ah bon ?");
  save(other.updates);
  assert.deepEqual(r.intro.data.blocks, [first.id, other.id, second]);
  assert.equal(reorderReply(r, "intro", other.id, second, "before"), null);
  assert.equal(reorderReply(r, "intro", other.id, "deleted", "after"), null);
  const moved = reorderReply(r, "intro", other.id, second, "after");
  assert.equal(moved.position, 3);
  save(moved.updates);
  assert.deepEqual(r.intro.data.blocks, [first.id, second, other.id]);
  assert.equal(r[first.id].data.text + r[second].data.text, original);
  assert.equal(r[other.id].data.text, "Ah bon ?");
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
