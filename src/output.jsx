import React, { useEffect, useRef, useState } from "react";
import {
  Printer,
  MonitorPlay,
  ArrowLeft,
  RotateCcw,
  Pause,
  Play,
  X,
  Check,
  PenLine,
} from "lucide-react";
import bank from "./atelier.json";
import { sectionName, stats, time, colors } from "./domain.js";
import { Modal } from "./ui.jsx";

function Script({ rows, person, size = 15, onEdit, prompter = false }) {
  const m = rows.meta.data,
    people = m.people;
  return (
    <article
      className={"script" + (prompter ? " reading" : "")}
      style={{ "--script-size": size + (prompter ? "px" : "pt") }}
    >
      <header>
        <p>
          {person
            ? "Script de " + people.find((p) => p.id === person)?.name
            : "Script commun"}
        </p>
        <h1>{m.title}</h1>
        <div>
          {people.map((p) => p.name).join("  /  ")} · {time(stats(rows).total)}
        </div>
      </header>
      {m.sections.map((sid) => (
        <section key={sid}>
          <h2>
            {sectionName(m, sid, rows[sid].data)}{" "}
            {onEdit && (
              <button
                className="icon"
                aria-label="Corriger la section"
                onClick={() => onEdit(sid)}
              >
                <PenLine size={16} />
              </button>
            )}
          </h2>
          {rows[sid].data.blocks.map((id) => {
            const b = rows[id].data,
              i = people.findIndex((p) => p.id === b.speaker);
            return (
              <div
                key={id}
                className={"line " + (person === b.speaker ? "mine" : "")}
                style={{ "--voice": colors[i] }}
              >
                <strong>{people[i].name}</strong>
                <p>{b.text || " "}</p>
                {onEdit && (
                  <button
                    className="editline icon"
                    aria-label={"Corriger la réplique de " + people[i].name}
                    onClick={() => onEdit(sid, id)}
                  >
                    <PenLine size={15} />
                  </button>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </article>
  );
}
export function ReadOnlyScript({ rows }) {
  return <Script rows={rows} />;
}
function Prompter({ rows, exit }) {
  const [font, setFont] = useState(38),
    [speed, setSpeed] = useState(36),
    [play, setPlay] = useState(false),
    [person, setPerson] = useState(""),
    scroll = useRef(null),
    wrap = useRef(null);
  useEffect(() => {
    const el = wrap.current;
    let entered = false;
    el.requestFullscreen?.()
      .then(() => {
        entered = true;
      })
      .catch(() => {});
    function key(e) {
      if (e.key === "Escape") exit();
    }
    function full() {
      if (entered && !document.fullscreenElement) exit();
    }
    document.addEventListener("keydown", key);
    document.addEventListener("fullscreenchange", full);
    scroll.current.focus();
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("fullscreenchange", full);
      if (document.fullscreenElement === el)
        document.exitFullscreen().catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!play) return;
    let frame,
      last = null,
      carry = 0;
    function step(t) {
      const el = scroll.current;
      if (last !== null) {
        carry += ((t - last) * speed) / 1000;
        const px = Math.floor(carry);
        carry -= px;
        el.scrollTop += px;
      }
      last = t;
      if (el.scrollHeight - el.clientHeight - el.scrollTop <= 1) {
        setPlay(false);
        return;
      }
      frame = requestAnimationFrame(step);
    }
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [play, speed]);
  return (
    <div className="prompter" ref={wrap}>
      <div className="prompttools">
        <button onClick={exit}>
          <X />
          Quitter
        </button>
        <button onClick={() => setPlay(!play)}>
          {play ? <Pause /> : <Play />}
          {play ? "Pause" : "Défiler"}
        </button>
        <button
          aria-label="Retour au début"
          onClick={() => {
            setPlay(false);
            scroll.current.scrollTop = 0;
          }}
        >
          <RotateCcw />
        </button>
        <label>
          Vitesse
          <input
            type="range"
            min="10"
            max="120"
            value={speed}
            onChange={(e) => setSpeed(+e.target.value)}
          />
        </label>
        <label>
          Taille
          <input
            type="range"
            min="24"
            max="76"
            value={font}
            onChange={(e) => setFont(+e.target.value)}
          />
        </label>
        <select
          aria-label="Voix à mettre en évidence"
          value={person}
          onChange={(e) => setPerson(e.target.value)}
        >
          <option value="">Toutes les voix</option>
          {rows.meta.data.people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="scrollscript" tabIndex="0" ref={scroll}>
        <Script rows={rows} person={person} size={font} prompter />
      </div>
    </div>
  );
}
export function Review({ rows, edit, commit, back, animation }) {
  const [mode, setMode] = useState("review"),
    [person, setPerson] = useState(""),
    [size, setSize] = useState(15),
    [warn, setWarn] = useState(false);
  const groups = animation
    ? [
        {
          title: "Animation",
          items: [
            "Nous avons relu le texte à voix haute.",
            "Nos annonces correspondent au conducteur de l’émission.",
          ],
        },
      ]
    : bank.checks;
  const m = rows.meta.data,
    list = groups.flatMap((g) => g.items),
    nr = list.filter((_, i) => rows["check" + i]?.data.checked).length;
  const empty = m.sections.some(
    (s) =>
      !rows[s].data.blocks.length ||
      rows[s].data.blocks.some((id) => !rows[id].data.text.trim()),
  );
  if (mode === "prompt")
    return <Prompter rows={rows} exit={() => setMode("review")} />;
  return (
    <div className="review">
      <div className="reviewtools">
        <button onClick={mode === "print" ? () => setMode("review") : back}>
          <ArrowLeft />
          {mode === "print" ? "Relecture" : "Rédaction"}
        </button>
        <h2>{mode === "print" ? "Aperçu du script" : "Relecture du script"}</h2>
        <div className="actions">
          {mode === "review" ? (
            <>
              <button onClick={() => setMode("prompt")}>
                <MonitorPlay />
                Téléprompteur
              </button>
              <button className="primary" onClick={() => setMode("print")}>
                <Printer />
                Préparer l’impression
              </button>
            </>
          ) : (
            <button
              className="primary"
              onClick={() =>
                nr < list.length || empty ? setWarn(true) : window.print()
              }
            >
              <Printer />
              Imprimer / Enregistrer en PDF
            </button>
          )}
        </div>
      </div>
      {mode === "print" && (
        <div className="printopts">
          <label>
            Version
            <select value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="">Script commun</option>
              {m.people.map((p) => (
                <option key={p.id} value={p.id}>
                  Script personnalisé — {p.name}
                </option>
              ))}
              <option value="all">Toutes les versions personnalisées</option>
            </select>
          </label>
          <label>
            Corps du texte
            <select value={size} onChange={(e) => setSize(+e.target.value)}>
              {[11, 12, 13, 14, 15, 16, 18, 20].map((s) => (
                <option key={s} value={s}>
                  {s} points
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className={"reviewgrid " + mode}>
        <div className="papers">
          {(mode === "print" && person === "all"
            ? m.people.map((p) => p.id)
            : [mode === "print" ? person : ""]
          ).map((p) => (
            <Script
              key={p}
              rows={rows}
              person={p}
              size={size}
              onEdit={mode === "review" ? edit : null}
            />
          ))}
        </div>
        {mode === "review" && (
          <aside className="checklist">
            <h3>
              Avant le studio{" "}
              <small>
                {nr} / {list.length}
              </small>
            </h3>
            {empty && (
              <p className="notice">
                Le script contient une section ou une réplique vide.
              </p>
            )}
            {groups.map((g) => (
              <fieldset key={g.title}>
                <legend>{g.title}</legend>
                {g.items.map((item) => {
                  const id = "check" + list.indexOf(item);
                  return (
                    <label key={id}>
                      <input
                        type="checkbox"
                        checked={!!rows[id]?.data.checked}
                        onChange={(e) =>
                          commit(
                            { [id]: { checked: e.target.checked } },
                            "Checklist",
                          )
                        }
                      />
                      {item}
                    </label>
                  );
                })}
              </fieldset>
            ))}
          </aside>
        )}
      </div>
      {warn && (
        <Modal title="Imprimer ce brouillon ?" close={() => setWarn(false)}>
          <p>
            {nr < list.length ? "La checklist est incomplète. " : ""}
            {empty ? "Certaines sections ou répliques sont vides." : ""}
          </p>
          <div className="actions">
            <button onClick={() => setWarn(false)}>Revenir au script</button>
            <button
              className="primary"
              onClick={() => {
                setWarn(false);
                setTimeout(() => window.print(), 50);
              }}
            >
              Imprimer quand même
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
