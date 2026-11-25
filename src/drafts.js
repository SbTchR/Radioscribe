import { uid, transaction } from "./domain.js";
// Keep the local wording and its original revision until the versioned write succeeds.
export class Drafts {
  constructor(room, notify) {
    this.room = room;
    this.notify = notify;
    this.entries = {};
    this.jobs = {};
    this.timers = {};
    const tab = sessionStorage.getItem("radio.tab") || uid();
    sessionStorage.setItem("radio.tab", tab);
    this.key = "radio.drafts." + room.id + "." + tab;
    this.entries = JSON.parse(localStorage.getItem(this.key) || "{}");
  }
  persist() {
    localStorage.setItem(this.key, JSON.stringify(this.entries));
    this.notify();
  }
  type(id, text) {
    const old = this.entries[id],
      base = this.room.rows[id];
    this.entries[id] = { rev: old?.rev ?? base.rev, text };
    this.persist();
    clearTimeout(this.timers[id]);
    this.timers[id] = setTimeout(() => this.flush(id).catch(() => {}), 700);
  }
  async flush(id) {
    clearTimeout(this.timers[id]);
    if (this.jobs[id]) {
      await this.jobs[id];
      return this.flush(id);
    }
    const draft = this.entries[id];
    if (!draft) return;
    const row = this.room.rows[id];
    if (!row || row.rev !== draft.rev)
      throw Error(
        "Deux versions de cette réplique existent. Choisis le texte à garder.",
      );
    if (row.data.text === draft.text) {
      delete this.entries[id];
      this.persist();
      return;
    }
    const tx = transaction(
      this.room.rows,
      { [id]: { ...row.data, text: draft.text } },
      "Texte de la réplique",
    );
    this.jobs[id] = this.room
      .save(tx)
      .then(() => {
        if (this.entries[id] === draft) delete this.entries[id];
        else if (this.entries[id])
          this.entries[id].rev = tx.changes[0].after.rev;
        this.persist();
      })
      .finally(() => {
        delete this.jobs[id];
      });
    return this.jobs[id];
  }
  async flushAll() {
    for (const id of Object.keys(this.entries)) await this.flush(id);
  }
  discard(id) {
    clearTimeout(this.timers[id]);
    delete this.entries[id];
    this.persist();
  }
  keep(id) {
    const row = this.room.rows[id];
    this.entries[id].rev = row.rev;
    this.persist();
    return this.flush(id);
  }
  close() {
    Object.values(this.timers).forEach(clearTimeout);
  }
}
