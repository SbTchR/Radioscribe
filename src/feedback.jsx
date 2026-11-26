import React, { useEffect, useId, useRef, useState } from "react";
import {
  Bell,
  MessageCircle,
  Mic,
  Pencil,
  Reply,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import { DictationFallback, Modal } from "./ui.jsx";
import { models } from "./models.js";
import { rpc } from "./store.js";
import {
  cancelSpeechFor,
  startSpeech,
  stopSpeech,
  useSpeech,
} from "./speech.js";
import "./feedback.css";

export const messageDictationPrefix = "message-dictation:";

export function feedbackEntries(rows) {
  return Object.entries(rows)
    .filter(([key]) => key.startsWith("feedback:"))
    .map(([id, { rev, data }]) => ({ ...data, id, rev }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function MessageDictation({ target, speech, pending, onText }) {
  const ownsSpeech = speech.target === target;
  useEffect(() => () => cancelSpeechFor(target), [target]);

  return (
    <div className="message-dictation">
      <div className="actions">
        {ownsSpeech && speech.phase === "recording" ? (
          <button type="button" onClick={stopSpeech}>
            Arrêter et transcrire
          </button>
        ) : (
          !pending && (
            <button
              type="button"
              disabled={speech.phase !== "ready"}
              onClick={() => startSpeech(target)}
            >
              <Mic size={16} aria-hidden="true" /> Dicter le message
            </button>
          )
        )}
        {ownsSpeech && pending && (
          <button type="button" onClick={() => cancelSpeechFor(target)}>
            Annuler la dictée
          </button>
        )}
        {(!pending || ownsSpeech) && <DictationFallback speech={speech} />}
      </div>
      {(!pending || ownsSpeech) && (
        <small className="message-dictation-status" role="status">
          {models[speech.model].label} · {speech.message}
          {speech.phase === "recording" && " · " + speech.seconds + " s"}
        </small>
      )}
      {pending && !ownsSpeech && <small>Une autre dictée est en cours.</small>}
      {ownsSpeech && speech.phase === "preview" && (
        <div className="message-transcript">
          <p>{speech.result || "Aucune parole reconnue."}</p>
          <button
            type="button"
            disabled={!speech.result}
            onClick={() => {
              onText(speech.result);
              cancelSpeechFor(target);
            }}
          >
            Utiliser cette transcription
          </button>
        </div>
      )}
    </div>
  );
}

function MessageForm({
  manager,
  teammates,
  block,
  parent,
  edit,
  cancel,
  save,
}) {
  const [body, setBody] = useState(edit?.text || "");
  const [important, setImportant] = useState(!!edit?.important);
  const [recipient, setRecipient] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const requestId = useRef(null);
  const input = useRef(null);
  const dictationTarget = messageDictationPrefix + useId();
  const speech = useSpeech();
  const speechPending = [
    "permission",
    "recording",
    "processing",
    "preview",
  ].includes(speech.phase);
  const dictating = speech.target === dictationTarget && speechPending;
  const showRecipient = !manager && !parent;
  const label = edit
    ? "Modifier le commentaire"
    : parent
      ? "Ta réponse"
      : block
        ? "Ton commentaire"
        : "Ton message";
  const submitLabel = edit
    ? "Enregistrer le commentaire"
    : parent
      ? "Envoyer la réponse"
      : block
        ? "Envoyer le commentaire"
        : "Envoyer le message";

  function setText(text) {
    setBody(text);
    requestId.current = null;
  }

  async function submit(event) {
    event.preventDefault();
    const text = body.trim();
    if (busy || dictating || !text || text.length > 2500) return;
    setError("");
    setBusy(true);
    requestId.current ??= crypto.randomUUID();
    try {
      await save({
        id: requestId.current,
        text,
        important,
        recipient: showRecipient && recipient ? recipient : null,
      });
      setText("");
      setImportant(false);
      setRecipient("");
      cancelSpeechFor(dictationTarget);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="message-form" onSubmit={submit}>
      {showRecipient && (
        <label className="message-recipient">
          Destinataire
          <select
            value={recipient}
            disabled={busy}
            onChange={(e) => {
              setRecipient(e.target.value);
              requestId.current = null;
            }}
          >
            <option value="">À l’enseignant</option>
            {teammates.map((p) => (
              <option key={p.id} value={p.id}>
                À {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        {label}
        <textarea
          ref={input}
          rows={edit || parent ? 2 : 3}
          autoFocus={!!(edit || parent)}
          required
          disabled={busy}
          maxLength={2500}
          value={body}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {!manager && (
        <MessageDictation
          target={dictationTarget}
          speech={speech}
          pending={speechPending}
          onText={(text) => {
            setText([body.trimEnd(), text].filter(Boolean).join("\n"));
            input.current.focus();
          }}
        />
      )}
      {manager && (
        <label className="feedback-important">
          <input
            type="checkbox"
            checked={important}
            disabled={busy}
            onChange={(e) => {
              setImportant(e.target.checked);
              requestId.current = null;
            }}
          />
          Marquer comme important
        </label>
      )}
      {body.length > 2500 && (
        <p className="error">Raccourcis le message à 2 500 caractères.</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button
          className="primary"
          type="submit"
          disabled={busy || dictating || !body.trim() || body.length > 2500}
        >
          <Send size={16} aria-hidden="true" /> {submitLabel}
        </button>
        {cancel && (
          <button type="button" onClick={cancel} disabled={busy}>
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}

function Message({ entry, name, manager, showBlock, edit, remove }) {
  const student = entry.role === "student";
  return (
    <article
      className="message"
      data-role={student ? "student" : "teacher"}
      data-important={entry.important}
    >
      <header>
        <strong>{student ? name(entry.sender) : "Enseignant"}</strong>
        {student && !entry.parent && (
          <span>
            → {entry.recipient ? name(entry.recipient) : "Enseignant"}
          </span>
        )}
        {showBlock && <span>Commentaire sur une réplique</span>}
        {entry.important && (
          <strong className="message-important">Important</strong>
        )}
        {entry.edited && !entry.deleted && <span>Modifié</span>}
        {manager && !student && !entry.deleted && (
          <div className="message-tools">
            <button
              type="button"
              className="icon"
              title="Modifier le commentaire"
              aria-label="Modifier le commentaire"
              onClick={edit}
            >
              <Pencil size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon"
              title="Supprimer le commentaire"
              aria-label="Supprimer le commentaire"
              onClick={remove}
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </header>
      {entry.deleted ? (
        <p>
          <em>Commentaire supprimé</em>
        </p>
      ) : (
        <p>{entry.text}</p>
      )}
    </article>
  );
}

function Discussion({
  room,
  version,
  identity,
  manager,
  people,
  entries,
  target,
  initialReply,
  unread,
  markRead,
  close,
}) {
  const [replyTo, setReplyTo] = useState(initialReply);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [readError, setReadError] = useState("");
  const teammates = people.filter((p) => p.id !== identity);
  const name = (id) =>
    people.find((p) => p.id === id)?.name || "Membre du groupe";
  const title = target
    ? "Commentaires sur la réplique"
    : manager
      ? "Messages à l’équipe"
      : "Messages du groupe";
  const replies = new Map();
  for (const entry of entries.toReversed()) {
    if (!entry.parent || entry.deleted) continue;
    if (!replies.has(entry.parent)) replies.set(entry.parent, []);
    replies.get(entry.parent).push(entry);
  }
  const threads = entries.filter(
    (entry) =>
      !entry.parent &&
      (!target || entry.block === target) &&
      (!entry.deleted || replies.has(entry.id)),
  );
  const latestPupilMessage = entries.find(
    (entry) => entry.role === "student",
  )?.id;

  useEffect(() => {
    if (!manager || target || !latestPupilMessage) return;
    let active = true;
    rpc("mark_feedback_read", { p_room: room.id, p_version: version })
      .then(() => {
        if (active) setReadError("");
      })
      .catch((e) => {
        if (active) setReadError(e.message);
      });
    return () => {
      active = false;
    };
  }, [room.id, manager, target, latestPupilMessage]);

  async function send({ id, text, important, recipient }, parent = null) {
    await room.sync();
    await rpc("post_message", {
      p_room: room.id,
      p_id: id,
      p_block: manager && !parent ? target : null,
      p_parent: parent,
      p_sender: manager ? null : identity,
      p_recipient: recipient,
      p_text: text,
      p_important: important,
    });
    await room.sync();
    if (parent) setReplyTo(null);
  }

  async function change(entry, text, important) {
    await rpc("change_comment", {
      p_room: room.id,
      p_entry: entry.id,
      p_rev: entry.rev,
      p_text: text,
      p_important: important,
    });
    await room.sync();
  }

  async function confirmDelete() {
    if (deletingBusy) return;
    setDeletingBusy(true);
    setDeleteError("");
    try {
      await change(deleting, null, false);
      setDeleting(null);
    } catch (e) {
      setDeleteError(e.message);
    } finally {
      setDeletingBusy(false);
    }
  }

  function renderEntry(entry) {
    return (
      <div key={entry.id}>
        {editing?.id === entry.id ? (
          <MessageForm
            manager
            edit={editing}
            cancel={() => setEditing(null)}
            save={async ({ text, important }) => {
              await change(editing, text, important);
              setEditing(null);
            }}
          />
        ) : (
          <Message
            entry={entry}
            name={name}
            manager={manager}
            showBlock={!target && !!entry.block && !entry.parent}
            edit={() => {
              setEditing(entry);
              setDeleting(null);
            }}
            remove={() => {
              setDeleteError("");
              setDeleting(entry);
            }}
          />
        )}
        {deleting?.id === entry.id && (
          <div className="message-deletion">
            <p>Supprimer ce commentaire ?</p>
            {deleteError && (
              <p className="error" role="alert">
                {deleteError}
              </p>
            )}
            <div className="actions">
              <button
                type="button"
                disabled={deletingBusy}
                onClick={confirmDelete}
              >
                Confirmer la suppression
              </button>
              <button
                type="button"
                disabled={deletingBusy}
                onClick={() => setDeleting(null)}
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <Modal title={title} close={close} wide className="feedback-dialog">
      <p className="feedback-notice">
        <Users size={18} aria-hidden="true" />
        Le groupe et l’enseignant peuvent lire tous ces échanges, y compris les
        messages adressés à un camarade.
      </p>
      {readError && (
        <p className="error" role="alert">
          {readError}
        </p>
      )}
      {(manager || !target) && (
        <MessageForm
          manager={manager}
          block={target}
          teammates={teammates}
          save={send}
        />
      )}
      {!threads.length && (
        <p className="feedback-empty">Aucun échange pour le moment.</p>
      )}
      {!!threads.length && (
        <ul className="feedback-list">
          {threads.map((thread) => (
            <li key={thread.id}>
              {renderEntry(thread)}
              {replies.has(thread.id) && (
                <div className="message-replies">
                  {replies.get(thread.id).map(renderEntry)}
                </div>
              )}
              {replyTo === thread.id ? (
                <MessageForm
                  manager={manager}
                  parent={thread.id}
                  cancel={() => setReplyTo(null)}
                  save={(message) => send(message, thread.id)}
                />
              ) : (
                <button
                  type="button"
                  className="reply-to-message"
                  onClick={() => setReplyTo(thread.id)}
                >
                  <Reply size={15} aria-hidden="true" /> Répondre
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!!unread.length && (
        <button onClick={markRead}>Marquer les alertes comme lues</button>
      )}
    </Modal>
  );
}

export function Feedback({
  room,
  version,
  identity,
  manager,
  people,
  entries,
  open,
  close,
  target,
  initialReply,
  show,
}) {
  const storageKey = "radio.feedback.read." + room.id + "." + identity;
  const [seen, setSeen] = useState(() =>
    JSON.parse(localStorage.getItem(storageKey) || "[]"),
  );
  const unread = manager
    ? []
    : entries.filter(
        (entry) =>
          entry.important &&
          !entry.deleted &&
          !seen.includes(entry.alertToken || entry.id),
      );
  const count = entries.filter((entry) => !entry.deleted).length;

  function markRead() {
    const read = [
      ...seen,
      ...unread.map((entry) => entry.alertToken || entry.id),
    ];
    localStorage.setItem(storageKey, JSON.stringify(read));
    setSeen(read);
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
        <MessageCircle aria-hidden="true" />
        {manager ? "Messages à l’équipe" : "Messages du groupe"}
        {!!count && <small aria-hidden="true">{count}</small>}
      </button>
      {open && (
        <Discussion
          room={room}
          version={version}
          identity={identity}
          manager={manager}
          people={people}
          entries={entries}
          target={target}
          initialReply={initialReply}
          unread={unread}
          markRead={markRead}
          close={close}
        />
      )}
    </div>
  );
}
