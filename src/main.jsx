import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  ArrowUpRight,
  FolderOpen,
  Plus,
  Radio,
  Ticket,
} from "lucide-react";
import { Brand, Modal, Voice, fmtCode } from "./ui.jsx";
import {
  cloud,
  createRoom,
  joinRoom,
  openSharedRoom,
  recent,
  reopenRoom,
  Room,
  upgradeLocalCodes,
} from "./store.js";
import { claimProgram, createProgram, recentPrograms } from "./program-api.js";
import { ProgramBoard } from "./program.jsx";
import { colors, CODE_LENGTH } from "./domain.js";
import { Workspace } from "./workspace.jsx";
import "@fontsource-variable/dm-sans/wght.css";
import "@fontsource/barlow-condensed/latin-700.css";
import "./style.css";

const initialLink = new URLSearchParams(location.hash.slice(1));
const invitation = initialLink.get("code");
const managementLink = initialLink.get("regie");

function ProgramForm({ submit, error, busy }) {
  return (
    <form onSubmit={submit}>
      <label>
        Titre de l’émission
        <input
          autoFocus
          required
          name="title"
          maxLength={160}
          placeholder="Quel est le thème de l’émission ?"
        />
      </label>
      <label>
        Nombre de chroniques
        <input
          required
          name="chronicles"
          type="number"
          defaultValue={4}
          min={1}
          max={24}
        />
      </label>
      <label className="localoption">
        <input type="checkbox" name="animated" defaultChecked /> Avec animation
      </label>
      <p>
        Tu pourras adapter l’ordre, les équipes et les parties dans le
        conducteur.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy}>
        {busy ? "Création…" : "Créer le conducteur"} <ArrowRight />
      </button>
    </form>
  );
}
function IdentityPicker({ room, identify, close }) {
  return (
    <Modal title="Qui prend la plume ?" close={close}>
      <p>Choisis ton prénom pour ouvrir « {room.rows.meta.data.title} ».</p>
      <div className="stack">
        {room.rows.meta.data.people.map((p, i) => (
          <button key={p.id} onClick={() => identify(room, p.id)}>
            <Voice name={p.name} color={colors[i]} /> <ArrowRight />
          </button>
        ))}
      </div>
    </Modal>
  );
}

function App() {
  const [localOnly, setLocalOnly] = useState(false);
  const [screen, setScreen] = useState(invitation ? "join" : "");
  const [code, setCode] = useState(invitation || "");
  const [title, setTitle] = useState("");
  const [names, setNames] = useState(["", "", "", ""]);
  const [count, setCount] = useState(2);
  const [room, setRoom] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [openMessages, setOpenMessages] = useState(false);
  const [program, setProgram] = useState(initialLink.get("emission"));
  const [busy, setBusy] = useState(!!managementLink);
  const [error, setError] = useState("");
  function select(next) {
    setError("");
    setScreen(next);
  }
  function closeRoom() {
    room?.close();
    setRoom(null);
    setIdentity(null);
    setOpenMessages(false);
  }
  function showProgram(id) {
    closeRoom();
    setProgram(id);
    select("");
    history.replaceState(null, "", "#emission=" + id);
    window.scrollTo(0, 0);
  }
  function home() {
    closeRoom();
    setProgram(null);
    select("");
    history.replaceState(null, "", location.pathname);
    window.scrollTo(0, 0);
  }
  useEffect(() => {
    if (!managementLink) return;
    claimProgram(managementLink)
      .then(showProgram)
      .catch((e) => {
        setError(e.message);
      })
      .finally(() => setBusy(false));
  }, []);

  function identify(r, id) {
    sessionStorage.setItem("radio.person." + r.id, id);
    setIdentity(id);
    select("");
    history.replaceState(null, "", "#code=" + r.state.code);
    window.scrollTo(0, 0);
  }
  function enter(id, pick, resume = false, messages = false) {
    const next = new Room(id);
    const savedIdentity = resume
      ? sessionStorage.getItem("radio.person." + id)
      : null;
    setRoom(next);
    setOpenMessages(messages);
    if (!pick) identify(next, next.rows.meta.data.people[0].id);
    else if (
      savedIdentity &&
      next.rows.meta.data.people.some((p) => p.id === savedIdentity)
    )
      identify(next, savedIdentity);
    else select("identity");
  }
  async function submit(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (screen === "create") {
        const group = names.slice(0, count).map((n) => n.trim());
        if (!title.trim() || group.some((n) => !n))
          throw Error("Complète le sujet et chaque prénom.");
        enter(await createRoom(title, group, localOnly), false);
      } else if (screen === "program") {
        showProgram(
          await createProgram(
            form.get("title").trim(),
            +form.get("chronicles"),
            form.has("animated"),
          ),
        );
      } else enter(await joinRoom(code), true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function openRecent(id) {
    setError("");
    try {
      enter(await reopenRoom(id), true);
    } catch (e) {
      setError(e.message);
    }
  }

  if (room && identity)
    return (
      <Workspace
        key={room.id}
        room={room}
        identity={identity}
        openMessages={openMessages}
        leave={() => (program ? showProgram(program) : home())}
        openProgram={showProgram}
      />
    );

  const picker = room && screen === "identity" && (
    <IdentityPicker
      room={room}
      identify={identify}
      close={() => (program ? showProgram(program) : home())}
    />
  );
  if (program)
    return (
      <>
        <ProgramBoard
          key={program}
          id={program}
          home={home}
          enter={async (id, manager, messages) =>
            enter(await openSharedRoom(id), !manager, true, messages)
          }
        />
        {picker}
      </>
    );

  const projects = recent();
  const programs = recentPrograms();
  return (
    <>
      <header className="mast">
        <Brand onClick={home} />
        <span className="mastnote">
          <Radio size={17} /> Atelier de chroniques radio
        </span>
      </header>
      <main className="home">
        {!screen && error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!screen && busy && <p role="status">Ouverture de l’émission…</p>}
        <div className="hero">
          <div className="herotext">
            <h1>
              Votre chronique
              <br />
              <em>prend la parole.</em>
            </h1>
            <p>
              Écrivez votre dialogue à plusieurs voix, répétez ensemble et
              emportez votre script au studio.
            </p>
            <div className="actions">
              <button className="primary" onClick={() => select("create")}>
                <Plus /> Créer une chronique
              </button>
              <button onClick={() => select("join")}>
                <Ticket /> Rejoindre par un code
              </button>
            </div>
            <button
              className="program-home-action"
              onClick={() => select("program")}
            >
              <Radio /> Créer une émission
            </button>
          </div>
          <img
            src={import.meta.env.BASE_URL + "studio.jpg"}
            alt="Micro de studio illustré en sérigraphie corail et noire"
          />
        </div>
        {!!programs.length && (
          <section className="recent program-recent">
            <div className="sectionhead">
              <h2>Émissions récentes</h2>
              <small>Sur cet appareil</small>
            </div>
            {programs.map((p) => (
              <button
                className="projectrow"
                key={p.id}
                onClick={() => showProgram(p.id)}
              >
                <Radio />
                <strong>{p.title}</strong>
                <small>{p.manager ? "Gestion" : "Conducteur"}</small>
                <ArrowUpRight />
              </button>
            ))}
          </section>
        )}
        <section className="recent">
          <div className="sectionhead">
            <h2>Chroniques récentes</h2>
            <small>Sur cet appareil</small>
          </div>
          {projects.length ? (
            projects.map((p) => (
              <button
                className="projectrow"
                key={p.id}
                onClick={() => openRecent(p.id)}
              >
                <FolderOpen />
                <strong>{p.title}</strong>
                <small>
                  {p.code.length <= CODE_LENGTH
                    ? fmtCode(p.code)
                    : "Code historique"}
                </small>
                <ArrowUpRight />
              </button>
            ))
          ) : (
            <div className="emptyrecent">
              <FolderOpen />
              <span>
                Vos chroniques apparaîtront ici dès la première création.
              </span>
            </div>
          )}
        </section>
        <footer>
          Radioscribe <span>Atelier d’écriture radiophonique</span>
        </footer>
      </main>
      {picker}
      {screen === "program" && (
        <Modal title="Créer une émission complète" close={() => select("")}>
          <ProgramForm submit={submit} busy={busy} error={error} />
        </Modal>
      )}
      {(screen === "create" || screen === "join") && (
        <Modal
          title={
            screen === "create"
              ? "Créer une chronique"
              : "Rejoindre par un code"
          }
          close={() => select("")}
        >
          <form onSubmit={submit}>
            {screen === "create" ? (
              <>
                <label>
                  Sujet de la chronique
                  <input
                    autoFocus
                    required
                    maxLength={160}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="De quoi allez-vous parler ?"
                  />
                </label>
                <fieldset>
                  <legend>Nombre de chroniqueurs</legend>
                  <div className="actions">
                    {[2, 3, 4].map((n) => (
                      <button
                        type="button"
                        key={n}
                        aria-pressed={n === count}
                        onClick={() => setCount(n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <div className="names">
                  {names.slice(0, count).map((n, i) => (
                    <label key={i}>
                      Prénom {i + 1}
                      <input
                        required
                        maxLength={40}
                        style={{ borderLeft: "4px solid " + colors[i] }}
                        value={n}
                        onChange={(e) =>
                          setNames(
                            names.map((v, j) => (j === i ? e.target.value : v)),
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <label>
                Code de la chronique ou de l’animation
                <input
                  autoFocus
                  required
                  maxLength={24}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ABCDE"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </label>
            )}
            {cloud && screen === "create" && (
              <label className="localoption">
                <input
                  type="checkbox"
                  checked={localOnly}
                  onChange={(e) => setLocalOnly(e.target.checked)}
                />{" "}
                Travailler uniquement sur cet appareil
              </label>
            )}
            {(!cloud || (screen === "create" && localOnly)) && (
              <p className="notice">
                Mode sur cet appareil. Les chroniques sont conservées dans ce
                navigateur. Le partage entre ordinateurs nécessite une connexion
                à Supabase.
              </p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button disabled={busy} className="primary">
              {busy
                ? "Ouverture…"
                : screen === "create"
                  ? "Ouvrir l’introduction"
                  : "Rejoindre le groupe"}{" "}
              <ArrowRight />
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

upgradeLocalCodes();
createRoot(document.getElementById("root")).render(<App />);
