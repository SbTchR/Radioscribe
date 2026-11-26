import React, { useEffect, useRef, useState } from "react";
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Clock3,
  Copy,
  FileText,
  KeyRound,
  MessageCircle,
  Mic,
  Music,
  Pencil,
  Plus,
  Radio,
  RotateCcw,
  UsersRound,
} from "lucide-react";
import { Brand, Modal } from "./ui.jsx";
import { time } from "./domain.js";
import { rpc } from "./store.js";
import { cueKinds, readProgram } from "./program-api.js";
import { ReadOnlyScript } from "./output.jsx";
import "./program.css";

const cueIcons = {
  chronicle: FileText,
  opening: Mic,
  transition: Mic,
  closing: Mic,
  music: Music,
  jingle: Radio,
};
const stateLabels = {
  empty: "À écrire",
  draft: "En rédaction",
  ready: "Validé",
};

function ProgramScript({ item, back }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const data = await rpc("read", { p_room: item.room });
        if (!data) throw Error("Cette partie a été retirée du conducteur.");
        if (active) {
          setRows(data.rows);
          setError("");
        }
      } catch (e) {
        if (active) {
          setError(e.message);
          setRows(null);
        }
      }
    }
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [item.room]);
  return (
    <main className="program-reading">
      <div className="program-reading-tools">
        <button onClick={back}>
          <ArrowLeft /> Conducteur de l’émission
        </button>
        <span>
          <BookOpen size={17} /> Lecture seule
        </span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {rows ? (
        <ReadOnlyScript rows={rows} />
      ) : (
        !error && <p role="status">Chargement du texte…</p>
      )}
    </main>
  );
}

function CueForm({ item, activeItems, close, save, busy, error }) {
  const [kind, setKind] = useState(item?.kind || "chronicle");
  const spoken = kind !== "music" && kind !== "jingle";
  return (
    <Modal
      title={item ? "Modifier " + item.title : "Ajouter une partie"}
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const title = form.get("title").trim();
          const names =
            form
              .get("names")
              ?.split(/[\n,]+/)
              .map((name) => name.trim())
              .filter(Boolean) || [];
          save({
            kind,
            title,
            after: form.get("after") || null,
            names: names.length ? names : null,
            seconds: spoken
              ? 0
              : Number(form.get("minutes")) * 60 + Number(form.get("seconds")),
          });
        }}
      >
        {!item && (
          <label>
            Type de partie
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {Object.entries(cueKinds).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {kind === "chronicle" ? "Sujet de la chronique" : "Nom de la partie"}
          <input
            autoFocus
            name="title"
            required
            maxLength={160}
            defaultValue={item?.title || ""}
            placeholder={cueKinds[kind]}
          />
        </label>
        {!item && (
          <label>
            Insérer
            <select name="after" defaultValue="">
              <option value="">À la fin</option>
              {activeItems.map((cue) => (
                <option key={cue.id} value={cue.id}>
                  Après {cue.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {item && spoken && (
          <label>
            Prénoms de l’équipe
            <textarea
              name="names"
              rows={3}
              maxLength={200}
              defaultValue={item.assigned ? item.names.join("\n") : ""}
              aria-describedby="team-instructions"
            />
            <small id="team-instructions">
              Inscris {kind === "chronicle" ? "2 à 4" : "1 à 4"} prénoms, un par
              ligne.
            </small>
          </label>
        )}
        {item && !spoken && (
          <fieldset className="duration-field">
            <legend>Durée prévue</legend>
            <label>
              Minutes{" "}
              <input
                type="number"
                name="minutes"
                min={0}
                max={600}
                defaultValue={Math.floor(item.seconds / 60)}
                required
              />
            </label>
            <label>
              Secondes{" "}
              <input
                type="number"
                name="seconds"
                min={0}
                max={59}
                defaultValue={item.seconds % 60}
                required
              />
            </label>
          </fieldset>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {item ? "Enregistrer les modifications" : "Ajouter au conducteur"}{" "}
          <ArrowRight />
        </button>
      </form>
    </Modal>
  );
}

export function ProgramBoard({ id, home, enter }) {
  const [program, setProgram] = useState(null);
  const [preview, setPreview] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const request = useRef(0);

  async function refresh() {
    const current = ++request.current;
    const data = await readProgram(id);
    if (current === request.current) {
      setProgram(data);
      setError("");
    }
  }

  useEffect(() => {
    let mounted = true;
    function load() {
      refresh().catch((e) => {
        if (mounted) setError(e.message);
      });
    }
    load();
    const timer = setInterval(load, 10000);
    window.addEventListener("focus", load);
    return () => {
      mounted = false;
      request.current++;
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [id]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 3500);
    return () => clearTimeout(timer);
  }, [message]);

  function openDialog(value) {
    setFormError("");
    setDialog(value);
  }

  async function act(work, inDialog = false) {
    setBusy(true);
    setError("");
    setFormError("");
    try {
      await work();
      return true;
    } catch (e) {
      (inDialog ? setFormError : setError)(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function execute(action, parameters, fromDialog = false) {
    return act(async () => {
      await rpc("program_" + action, { p_show: id, ...parameters });
      if (fromDialog) setDialog(null);
      await refresh();
    }, fromDialog);
  }
  function submitCue(form) {
    const item = dialog.item;
    if (item)
      execute(
        "update",
        {
          p_cue: item.id,
          p_title: form.title,
          p_seconds: form.seconds,
          p_names: form.names,
        },
        true,
      );
    else
      execute(
        "add",
        { p_kind: form.kind, p_title: form.title, p_after: form.after },
        true,
      );
  }
  function copy(value, messageText) {
    return act(async () => {
      await navigator.clipboard.writeText(value);
      setMessage(messageText);
    }, !!dialog);
  }

  if (preview)
    return (
      <ProgramScript
        key={preview.id}
        item={preview}
        back={() => setPreview(null)}
      />
    );
  const activeItems = program?.items.filter((item) => !item.archived) || [];
  const archived = program?.items.filter((item) => item.archived) || [];
  const seconds = activeItems.reduce((total, item) => total + item.seconds, 0);
  const untimed = activeItems.filter((item) => !item.seconds).length;
  const openScript = (item, messages = false) =>
    item.editable
      ? act(() => enter(item.room, program.manager, messages))
      : setPreview(item);
  return (
    <>
      <header className="mast projectmast">
        <Brand onClick={home} />
        <span className="program-mode">
          <Radio size={17} />{" "}
          {program?.manager
            ? "Gestion de l’émission"
            : "Conducteur de l’émission"}
        </span>
      </header>
      <main className="program">
        {!program && !error && <p role="status">Chargement du conducteur…</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {program && (
          <>
            <div className="program-head">
              <div>
                <h1>{program.title}</h1>
                <p className="program-duration">
                  <Clock3 size={17} /> <strong>{time(seconds)}</strong> prévues
                  {untimed > 0 && (
                    <span>
                      {" "}
                      · {untimed}{" "}
                      {untimed === 1
                        ? "durée à compléter"
                        : "durées à compléter"}
                    </span>
                  )}
                </p>
              </div>
              {program.manager && (
                <div className="actions program-tools">
                  <button onClick={() => openDialog({ kind: "rename" })}>
                    <Pencil /> Renommer l’émission
                  </button>
                  <button onClick={() => openDialog({ kind: "management" })}>
                    <KeyRound /> Lien de gestion
                  </button>
                </div>
              )}
            </div>
            <div className="program-list-head">
              <h2>Conducteur de l’émission</h2>
              {program.manager && (
                <button
                  className="primary"
                  onClick={() => openDialog({ kind: "item" })}
                >
                  <Plus /> Ajouter une partie
                </button>
              )}
            </div>
            <ol className="cue-list" data-manager={program.manager}>
              {activeItems.map((item, index) => {
                const Icon = cueIcons[item.kind];
                return (
                  <li className="cue-card" data-kind={item.kind} key={item.id}>
                    <div className="cue-position">
                      <span>{index + 1}</span>
                      <Icon size={21} aria-hidden="true" />
                    </div>
                    <div className="cue-name">
                      {item.title !== cueKinds[item.kind] &&
                        !item.title.startsWith(cueKinds[item.kind] + " ") && (
                          <small>{cueKinds[item.kind]}</small>
                        )}
                      {item.room ? (
                        <h3>
                          <button
                            className="cue-title"
                            disabled={busy}
                            onClick={() => openScript(item)}
                          >
                            {item.title}
                          </button>
                        </h3>
                      ) : (
                        <h3>{item.title}</h3>
                      )}
                      {item.room && (
                        <p className="cue-team">
                          <UsersRound size={15} />{" "}
                          {item.assigned
                            ? item.names.join(", ")
                            : "Équipe à attribuer"}
                        </p>
                      )}
                    </div>
                    <div className="cue-timing">
                      {item.status && (
                        <span className="cue-state" data-state={item.status}>
                          {stateLabels[item.status]}
                        </span>
                      )}
                      <span className="cue-seconds">
                        {item.seconds ? time(item.seconds) : "Durée à préciser"}
                      </span>
                      {program.manager && item.unreadMessages > 0 && (
                        <button
                          type="button"
                          className="cue-unread"
                          disabled={busy}
                          onClick={() => openScript(item, true)}
                        >
                          <MessageCircle size={15} aria-hidden="true" />
                          {item.unreadMessages === 1
                            ? "1 nouveau message"
                            : item.unreadMessages + " nouveaux messages"}
                        </button>
                      )}
                    </div>
                    <div className="cue-actions">
                      {item.code && !item.archived && (
                        <button
                          className="cue-code"
                          title="Copier le code"
                          aria-label={"Copier le code de " + item.title}
                          onClick={() =>
                            copy(item.code, "Code " + item.code + " copié.")
                          }
                        >
                          {item.code} <Copy size={15} />
                        </button>
                      )}
                      {item.room && (
                        <button
                          className="cue-open"
                          disabled={busy}
                          onClick={() => openScript(item)}
                          aria-label={
                            (item.editable ? "Rédiger " : "Consulter ") +
                            item.title
                          }
                        >
                          {item.editable ? "Rédiger" : "Consulter"}{" "}
                          <ArrowRight />
                        </button>
                      )}
                      {program.manager && (
                        <div className="cue-management">
                          <button
                            className="icon"
                            title="Modifier"
                            aria-label={"Modifier " + item.title}
                            onClick={() => openDialog({ kind: "item", item })}
                          >
                            <Pencil />
                          </button>
                          <button
                            className="icon"
                            title="Monter"
                            aria-label={"Monter " + item.title}
                            disabled={busy || index === 0}
                            onClick={() =>
                              execute("move", { p_cue: item.id, p_step: -1 })
                            }
                          >
                            <ArrowUp />
                          </button>
                          <button
                            className="icon"
                            title="Descendre"
                            aria-label={"Descendre " + item.title}
                            disabled={busy || index === activeItems.length - 1}
                            onClick={() =>
                              execute("move", { p_cue: item.id, p_step: 1 })
                            }
                          >
                            <ArrowDown />
                          </button>
                          <button
                            className="icon archive-button"
                            title="Retirer du conducteur"
                            aria-label={"Retirer " + item.title}
                            onClick={() =>
                              openDialog({ kind: "archive", item })
                            }
                          >
                            <Archive />
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
            {!activeItems.length && (
              <p className="notice">Le conducteur est vide.</p>
            )}
            {!!archived.length && (
              <details className="cue-archive">
                <summary>Parties retirées ({archived.length})</summary>
                {archived.map((item) => (
                  <div key={item.id}>
                    <span>{item.title}</span>
                    <button
                      disabled={busy}
                      onClick={() =>
                        execute("archive", {
                          p_cue: item.id,
                          p_archived: false,
                        })
                      }
                    >
                      <RotateCcw /> Rétablir
                    </button>
                  </div>
                ))}
              </details>
            )}
          </>
        )}
      </main>
      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}
      {dialog?.kind === "item" && (
        <CueForm
          item={dialog.item}
          activeItems={activeItems}
          close={() => setDialog(null)}
          save={submitCue}
          busy={busy}
          error={formError}
        />
      )}
      {dialog?.kind === "rename" && (
        <Modal title="Renommer l’émission" close={() => setDialog(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              execute(
                "rename",
                { p_title: new FormData(e.currentTarget).get("title").trim() },
                true,
              );
            }}
          >
            <label>
              Titre de l’émission{" "}
              <input
                autoFocus
                name="title"
                defaultValue={program.title}
                maxLength={160}
                required
              />
            </label>
            {formError && (
              <p className="error" role="alert">
                {formError}
              </p>
            )}
            <button className="primary" disabled={busy}>
              Enregistrer le titre
            </button>
          </form>
        </Modal>
      )}
      {dialog?.kind === "archive" && (
        <Modal
          title={"Retirer « " + dialog.item.title + " » ?"}
          close={() => setDialog(null)}
        >
          <p>
            Tu pourras rétablir cette partie, son texte et son code depuis «
            Parties retirées ».
          </p>
          {formError && (
            <p className="error" role="alert">
              {formError}
            </p>
          )}
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              execute(
                "archive",
                { p_cue: dialog.item.id, p_archived: true },
                true,
              )
            }
          >
            Retirer du conducteur
          </button>
        </Modal>
      )}
      {dialog?.kind === "management" && (
        <Modal
          title="Lien de gestion de l’émission"
          close={() => setDialog(null)}
        >
          <p>
            Garde ce lien pour retrouver la gestion de l’émission sur un autre
            appareil. Il donne accès à toutes les parties et aux retours
            envoyés. Distribue les codes des parties aux élèves.
          </p>
          {formError && (
            <p className="error" role="alert">
              {formError}
            </p>
          )}
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              const link = new URL(location.pathname, location.origin);
              link.hash = "regie=" + id + "." + program.managerKey;
              if (await copy(link.href, "Lien de gestion copié."))
                setDialog(null);
            }}
          >
            <Copy /> Copier le lien de gestion
          </button>
        </Modal>
      )}
    </>
  );
}
