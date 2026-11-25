import React, { useState } from "react";
import { Bell, MessageCircle, Send } from "lucide-react";
import { Modal } from "./ui.jsx";
import { rpc } from "./store.js";
import "./feedback.css";

export function feedbackEntries(rows) {
  return Object.entries(rows)
    .filter(([key]) => key.startsWith("feedback:"))
    .map(([id, row]) => ({ id, ...row.data }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function Feedback({
  room,
  identity,
  manager,
  entries,
  open,
  close,
  target,
  show,
}) {
  const storageKey = "radio.feedback.read." + room.id + "." + identity;
  const [seen, setSeen] = useState(() =>
    JSON.parse(localStorage.getItem(storageKey) || "[]"),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const unread = manager
    ? []
    : entries.filter((entry) => entry.important && !seen.includes(entry.id));
  const items = target
    ? entries.filter((entry) => entry.block === target)
    : entries;
  function markRead() {
    const read = [...seen, ...unread.map((entry) => entry.id)];
    localStorage.setItem(storageKey, JSON.stringify(read));
    setSeen(read);
  }
  async function send(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    if (!data.get("message").trim()) return;
    setBusy(true);
    setError("");
    try {
      await room.sync();
      await rpc("add_feedback", {
        p_room: room.id,
        p_block: target || null,
        p_text: data.get("message"),
        p_important: data.has("important"),
      });
      await room.sync();
      form.reset();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="feedback">
      {unread.length > 0 && (
        <div className="feedback-alert" role="alert">
          <Bell size={21} aria-hidden="true" />
          <div>
            <strong>
              {unread.length > 1
                ? unread.length + " messages importants"
                : "Message important de l’enseignant"}
            </strong>
            <p>{unread[0].text}</p>
          </div>
          <button onClick={() => show(null)}>Lire les messages</button>
        </div>
      )}
      <button className="feedback-launch" onClick={() => show(null)}>
        <MessageCircle aria-hidden="true" />{" "}
        {manager ? "Messages à l’équipe" : "Messages de l’enseignant"}
        {!!entries.length && <small aria-hidden="true">{entries.length}</small>}
      </button>
      {open && (
        <Modal
          title={
            target
              ? "Commentaires sur la réplique"
              : manager
                ? "Messages à l’équipe"
                : "Messages de l’enseignant"
          }
          close={close}
        >
          {manager && (
            <form onSubmit={send}>
              <label>
                {target ? "Ton commentaire" : "Ton message"}
                <textarea name="message" rows={4} required maxLength={2500} />
              </label>
              <label className="feedback-important">
                <input type="checkbox" name="important" /> Marquer comme
                important
              </label>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className="primary" disabled={busy}>
                <Send />{" "}
                {target ? "Envoyer le commentaire" : "Envoyer le message"}
              </button>
            </form>
          )}
          {!items.length && (
            <p className="feedback-empty">Aucun retour pour le moment.</p>
          )}
          {!!items.length && (
            <ul className="feedback-list">
              {items.map((entry) => (
                <li key={entry.id} data-important={entry.important}>
                  <strong>
                    {entry.important ? "Important · " : ""}
                    {entry.block
                      ? "Commentaire sur une réplique"
                      : "Message à l’équipe"}
                  </strong>
                  <p>{entry.text}</p>
                </li>
              ))}
            </ul>
          )}
          {!!unread.length && (
            <button onClick={markRead}>Marquer les alertes comme lues</button>
          )}
        </Modal>
      )}
    </div>
  );
}
