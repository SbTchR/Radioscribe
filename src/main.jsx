import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  Radio,
  FolderOpen,
  UsersRound,
  Ticket,
  FileText,
  Mic,
  Printer,
} from "lucide-react";
import { Brand, Modal, Voice, fmtCode } from "./ui.jsx";
import { cloud, createRoom, joinRoom, recent, Room } from "./store.js";
import { colors } from "./domain.js";
import { Workspace } from "./workspace.jsx";
import "@fontsource-variable/dm-sans/wght.css";
import "@fontsource/barlow-condensed/latin-700.css";
import "./style.css";
function App() {
  const invite = new URLSearchParams(location.hash.slice(1)).get("code");
  const [localOnly, setLocalOnly] = useState(false);
  const [screen, setScreen] = useState(invite ? "join" : ""),
    [code, setCode] = useState(invite || ""),
    [title, setTitle] = useState(""),
    [names, setNames] = useState(["", "", "", ""]),
    [count, setCount] = useState(2),
    [room, setRoom] = useState(null),
    [identity, setIdentity] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function select(s) {
    setError("");
    setScreen(s);
  }
  function enter(id, pick) {
    const r = new Room(id);
    setRoom(r);
    if (pick) {
      select("identity");
    } else {
      identify(r, r.rows.meta.data.people[0].id);
    }
  }
  function identify(r, id) {
    sessionStorage.setItem("radio.person." + r.id, id);
    setIdentity(id);
    select("");
    history.replaceState(null, "", "#code=" + r.state.code);
  }
  function leave() {
    room?.close();
    setRoom(null);
    setIdentity(null);
    select("");
    history.replaceState(null, "", location.pathname);
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (screen === "create") {
        const group = names.slice(0, count).map((n) => n.trim());
        if (!title.trim() || group.some((n) => !n))
          throw Error("Complète le sujet et chaque prénom.");
        enter(await createRoom(title, group, localOnly), false);
      } else enter(await joinRoom(code), true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (room && identity)
    return (
      <Workspace key={room.id} room={room} identity={identity} leave={leave} />
    );
  const projects = recent();
  return (
    <>
      <header className="mast">
        <Brand onClick={leave} />
        <span className="mastnote">
          <Radio size={17} /> Atelier de chroniques radio
        </span>
      </header>
      <main className="home">
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
                <Plus />
                Créer une chronique
              </button>
              <button onClick={() => select("join")}>
                <Ticket />
                Rejoindre une chronique
              </button>
            </div>
          </div>
          <img
            src={import.meta.env.BASE_URL + "studio.jpg"}
            alt="Micro de studio illustré en sérigraphie corail et noire"
          />
        </div>
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
                onClick={() => enter(p.id, true)}
              >
                <FolderOpen />
                <strong>{p.title}</strong>
                <small>{fmtCode(p.code)}</small>
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
      {screen && (
        <Modal
          title={
            screen === "create"
              ? "Créer une chronique"
              : screen === "identity"
                ? "Qui prend la plume ?"
                : "Rejoindre une chronique"
          }
          close={() => (room ? leave() : select(""))}
        >
          {screen === "identity" ? (
            <>
              <p>
                Choisis ton prénom pour ouvrir « {room.rows.meta.data.title} ».
              </p>
              <div className="stack">
                {room.rows.meta.data.people.map((p, i) => (
                  <button key={p.id} onClick={() => identify(room, p.id)}>
                    <Voice name={p.name} color={colors[i]} />
                    <ArrowRight />
                  </button>
                ))}
              </div>
            </>
          ) : (
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
                              names.map((v, j) =>
                                j === i ? e.target.value : v,
                              ),
                            )
                          }
                        />
                      </label>
                    ))}
                  </div>
                </>
              ) : (
                <label>
                  Code de la chronique
                  <input
                    autoFocus
                    required
                    maxLength={24}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="XXXX-XXXX-XXXX"
                    autoCapitalize="characters"
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
                  navigateur. Le partage entre ordinateurs nécessite une
                  connexion à Supabase.
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
                    : "Ouvrir la chronique"}
                <ArrowRight />
              </button>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
