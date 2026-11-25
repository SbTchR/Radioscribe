import { createClient } from "@supabase/supabase-js";
import {
  initial,
  uid,
  apply,
  matches,
  transaction,
  shortCode,
  normalizeCode,
} from "./domain.js";

const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const cloud = url && key ? createClient(url, key) : null;
const prefix = "radioscribe.1.";
const localKey = (id) => prefix + "room." + id;
const read = (id) => JSON.parse(localStorage.getItem(localKey(id)) || "null");
const write = (id, state) =>
  localStorage.setItem(localKey(id), JSON.stringify(state));
export function recent() {
  return Object.keys(localStorage)
    .filter((k) => k.startsWith(prefix + "room."))
    .map((k) => JSON.parse(localStorage[k]))
    .sort((a, b) => b.updated - a.updated)
    .map((s) => ({
      id: s.id,
      title: visible(s).meta.data.title,
      code: s.code,
      online: s.online,
      linked: !!s.context?.showId,
    }));
}
export async function auth() {
  if (!cloud) throw Error("Le partage entre appareils nécessite Supabase.");
  const { data, error } = await cloud.auth.getSession();
  if (error) throw error;
  if (!data.session) {
    const { error } = await cloud.auth.signInAnonymously();
    if (error) throw Error("Connexion anonyme indisponible. " + error.message);
  }
}
export async function rpc(name, args) {
  const { data, error } = await cloud.rpc("radio_" + name, args);
  if (error) throw Error(error.message);
  return data;
}
function visible(s) {
  return s.pending.reduce((r, t) => (matches(r, t) ? apply(r, t) : r), s.rows);
}
function freeLocalCode() {
  const codes = new Set(recent().map((project) => project.code));
  let code;
  do {
    code = shortCode();
  } while (codes.has(code));
  return code;
}
export function upgradeLocalCodes() {
  for (const project of recent()) {
    if (project.online || project.code.length <= 5) continue;
    const state = read(project.id);
    write(project.id, {
      ...state,
      legacyCode: state.code,
      code: freeLocalCode(),
    });
  }
}
export async function createRoom(title, names, localOnly = false) {
  const rows = initial(title, names);
  const online = !!cloud && !localOnly;
  let id;
  let code;
  if (online) {
    await auth();
    ({ id, code } = await rpc("create", { p_rows: rows }));
  } else {
    id = uid();
    code = freeLocalCode();
  }
  write(id, {
    id,
    code,
    online,
    rows,
    version: 0,
    pending: [],
    recovery: [],
    updated: Date.now(),
  });
  return id;
}
export async function joinRoom(input) {
  const code = normalizeCode(input);
  const cached = recent().find(
    (p) => p.code === code || read(p.id).legacyCode === code,
  );
  if (cached && (!cached.online || !navigator.onLine)) return cached.id;
  if (!cloud)
    throw Error(
      "Ce code ne correspond à aucun projet sur cet appareil. Le partage entre appareils nécessite Supabase.",
    );
  await auth();
  const id = await rpc("join", { p_code: code });
  if (!id)
    throw Error(
      "Code inconnu ou trop de tentatives. Vérifie le code, puis réessaie.",
    );
  return openSharedRoom(id, code);
}
export async function reopenRoom(id) {
  if (!read(id)?.online || !navigator.onLine) return id;
  await auth();
  return openSharedRoom(id);
}
export async function openSharedRoom(id, fallbackCode) {
  const snap = await rpc("read", { p_room: id });
  if (!snap || snap.context?.editable === false)
    throw Error("L’accès à cette partie de l’émission est indisponible.");
  await navigator.locks.request(localKey(id), () => {
    const existing = read(id);
    if (existing && existing.version > snap.version) return;
    write(id, {
      id,
      online: true,
      pending: [],
      recovery: [],
      ...existing,
      ...snap,
      code: snap.code || existing?.code || fallbackCode,
      updated: Date.now(),
    });
  });
  return id;
}
export class Room {
  constructor(id) {
    this.id = id;
    this.listeners = new Set();
    this.undoStack = [];
    this.peers = [];
    this.status = "";
    this.editing = null;
    this.reload();
    this.storage = (e) => {
      if (e.key === localKey(id)) {
        this.reload();
        this.schedule();
      }
    };
    this.connection = () => {
      this.reload();
      this.schedule();
    };
    window.addEventListener("storage", this.storage);
    window.addEventListener("online", this.connection);
    window.addEventListener("offline", this.connection);
    if (this.state.online) {
      this.startCloud();
      this.timer = setInterval(() => this.sync(), 15000);
    }
  }
  reload = () => {
    this.state = read(this.id);
    this.rows = visible(this.state);
    this.snapshot = {
      ...this.state,
      rows: this.rows,
      peers: this.peers,
      status: this.status,
    };
    this.listeners.forEach((fn) => fn());
  };
  subscribe = (fn) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  mutate(fn) {
    return navigator.locks.request(localKey(this.id), () => {
      const s = read(this.id);
      fn(s);
      s.updated = Date.now();
      write(this.id, s);
      this.reload();
    });
  }
  async save(tx, remember = true) {
    await this.mutate((s) => {
      const rows = visible(s);
      if (!matches(rows, tx))
        throw Error(
          "Quelqu’un a modifié ce passage. Ta saisie reste dans le brouillon.",
        );
      if (s.online) s.pending.push(tx);
      else s.rows = apply(rows, tx);
    });
    if (remember) this.undoStack.push(tx);
    this.schedule();
  }
  async undo() {
    const tx = this.undoStack.at(-1);
    if (!tx) throw Error("Aucune modification locale à annuler.");
    const rows = this.rows;
    if (
      !tx.changes.every(
        (c) => (rows[c.key]?.rev ?? null) === (c.after?.rev ?? null),
      )
    )
      throw Error(
        "Ce passage a changé depuis. Annulation impossible sans écraser une modification.",
      );
    await this.save(
      transaction(
        rows,
        Object.fromEntries(tx.changes.map((c) => [c.key, c.previous])),
        "Annulation",
      ),
      false,
    );
    this.undoStack.pop();
  }
  async startCloud() {
    try {
      await auth();
      if (this.closed) return;
      this.ch = cloud.channel("radio:" + this.id, {
        config: { private: true, presence: { key: uid() } },
      });
      this.ch
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "radio_changes",
            filter: "room=eq." + this.id,
          },
          () => this.schedule(),
        )
        .on("presence", { event: "sync" }, () => {
          this.peers = Object.values(this.ch.presenceState()).flat();
          this.reload();
        })
        .subscribe((state) => {
          if (state === "SUBSCRIBED") {
            this.live = true;
            this.track();
            this.schedule();
          } else {
            this.live = false;
            this.reload();
          }
        });
      this.schedule();
    } catch (e) {
      this.status = e.message;
      this.reload();
    }
  }
  track(person = this.person, editing = this.editing) {
    this.person = person;
    this.editing = editing;
    if (this.live && person) this.ch.track({ person, editing });
  }
  schedule() {
    if (this.closed || !this.state.online) return;
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.sync(), 80);
  }
  async sync() {
    if (this.syncing) return this.syncing;
    if (this.closed || !navigator.onLine || !this.state.online) return;
    this.syncing = this.syncPending();
    try {
      await this.syncing;
    } finally {
      this.syncing = null;
    }
  }
  async syncPending() {
    try {
      await navigator.locks.request("send." + this.id, async () => {
        while (!this.closed) {
          const tx = read(this.id).pending[0];
          let result;
          if (tx)
            result = await rpc("apply", {
              p_room: this.id,
              p_id: tx.id,
              p_changes: tx.changes.map(({ key, before, after }) => ({
                key,
                before,
                after,
              })),
            });
          const fresh = await rpc("read", { p_room: this.id });
          if (!fresh)
            throw Error(
              "Accès au projet perdu. Rejoins-le à nouveau avec son code.",
            );
          const stored = read(this.id);
          if (
            tx ||
            fresh.version > stored.version ||
            (fresh.code && fresh.code !== stored.code) ||
            JSON.stringify(fresh.context) !== JSON.stringify(stored.context)
          )
            await this.mutate((s) => {
              if (fresh.version >= s.version) {
                s.rows = fresh.rows;
                s.version = fresh.version;
                s.code = fresh.code || s.code;
                s.context = fresh.context;
              }
              if (tx) {
                s.pending = s.pending.filter((t) => t.id !== tx.id);
                if (result === "conflict") s.recovery.push(tx);
              }
            });
          if (!read(this.id).pending.length) break;
        }
      });
      this.status = "";
    } catch (e) {
      this.status = e.message;
    } finally {
      if (!this.closed) this.reload();
    }
  }
  close() {
    this.closed = true;
    clearTimeout(this.debounce);
    clearInterval(this.timer);
    window.removeEventListener("storage", this.storage);
    window.removeEventListener("online", this.connection);
    window.removeEventListener("offline", this.connection);
    if (this.ch) cloud.removeChannel(this.ch);
  }
}
