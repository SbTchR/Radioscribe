// A transaction contains the records it changes and the exact revisions it read.
export const uid = () => crypto.randomUUID();
export const colors = ["#a33c33", "#286880", "#77539a", "#446c38"];
export const time = (seconds) =>
  Math.floor(seconds / 60) +
  " min " +
  String(seconds % 60).padStart(2, "0") +
  " s";
export const words = (text) =>
  (text.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) || []).length;
export function record(data) {
  return { rev: uid(), data };
}
export function initial(title, names) {
  const people = names.map((name) => ({ id: uid(), name: name.trim() }));
  return {
    meta: record({
      title: title.trim(),
      people,
      sections: ["intro"],
      speed: 130,
    }),
    intro: record({
      kind: "intro",
      title: "Introduction",
      angles: [],
      blocks: [],
      done: false,
    }),
  };
}
export function sectionName(meta, id, s) {
  if (s.kind !== "part") return s.title;
  return (
    "Partie " + meta.sections.indexOf(id) + (s.title ? " · " + s.title : "")
  );
}
export function transaction(rows, updates, label) {
  return {
    id: uid(),
    label,
    changes: Object.entries(updates).map(([key, data]) => ({
      key,
      before: rows[key]?.rev ?? null,
      after: data === null ? null : record(data),
      previous: rows[key]?.data ?? null,
    })),
  };
}
export const matches = (rows, tx) =>
  tx.changes.every((c) => (rows[c.key]?.rev ?? null) === c.before);
export function apply(rows, tx) {
  if (!matches(rows, tx))
    throw Error("Cette version a changé sur un autre poste.");
  const next = { ...rows };
  for (const { key, after } of tx.changes) {
    if (after) next[key] = after;
    else delete next[key];
  }
  return next;
}
export function insert(rows, sid, speaker, index, text = "") {
  const s = rows[sid].data,
    id = uid(),
    blocks = s.blocks.toSpliced(index, 0, id);
  return { id, updates: { [sid]: { ...s, blocks }, [id]: { speaker, text } } };
}
export function split(rows, sid, id, at) {
  const b = rows[id].data;
  if (at <= 0 || at >= b.text.length)
    throw Error("Place le curseur entre les deux passages à séparer.");
  const { updates } = insert(
    rows,
    sid,
    b.speaker,
    rows[sid].data.blocks.indexOf(id) + 1,
    b.text.slice(at),
  );
  return { ...updates, [id]: { ...b, text: b.text.slice(0, at) } };
}
export function reorderReply(rows, sid, id, neighbor, edge) {
  const section = rows[sid]?.data;
  if (
    !section?.blocks.includes(id) ||
    !section.blocks.includes(neighbor) ||
    id === neighbor
  )
    return null;
  const blocks = section.blocks.filter((key) => key !== id);
  const index = blocks.indexOf(neighbor) + (edge === "after" ? 1 : 0);
  if (section.blocks.indexOf(id) === index) return null;
  return {
    updates: { [sid]: { ...section, blocks: blocks.toSpliced(index, 0, id) } },
    position: index + 1,
  };
}
export function stats(rows, sid) {
  const meta = rows.meta.data,
    counts = Object.fromEntries(meta.people.map((p) => [p.id, 0]));
  let total = 0,
    section = 0;
  for (const key of meta.sections)
    for (const id of rows[key].data.blocks) {
      const { speaker, text } = rows[id].data,
        n = words(text);
      counts[speaker] += n;
      total += n;
      if (key === sid) section += n;
    }
  const seconds = (n) => Math.round((n * 60) / meta.speed);
  return {
    total: seconds(total),
    section: seconds(section),
    people: meta.people.map((p) => ({
      ...p,
      seconds: seconds(counts[p.id]),
      percent: total ? (100 * counts[p.id]) / total : 0,
    })),
  };
}
