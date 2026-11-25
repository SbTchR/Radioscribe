import React, {
  useEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  AudioLines,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Clock3,
  Copy,
  Ellipsis,
  FileText,
  GripVertical,
  Headphones,
  LifeBuoy,
  Mic,
  MicOff,
  Pause,
  PenLine,
  Plus,
  Radio,
  Settings,
  Square,
  Undo2,
  UsersRound,
  X,
  Compass,
  History,
  Cog,
  Users,
  Search,
  Scale,
  Sparkles,
  MessageCircle,
  Coins,
  ChartColumn,
  Trophy,
  GitCompare,
  Lightbulb,
  MessagesSquare,
  Wrench,
  Newspaper,
  Quote,
  ListChecks,
  TrendingUp,
  Shapes,
} from "lucide-react";
import bank from "./atelier.json";
import {
  uid,
  colors,
  transaction,
  sectionName,
  stats,
  time,
  insert,
  split,
  merge,
  move,
} from "./domain.js";
import { Brand, Modal, Voice, fmtCode } from "./ui.jsx";
import { Review } from "./output.jsx";
import { Drafts } from "./drafts.js";
import { models } from "./models.js";
import {
  useSpeech,
  preload,
  loadModel,
  startSpeech,
  stopSpeech,
  cancelSpeech,
} from "./speech.js";
const icons = [
  Compass,
  History,
  Cog,
  Users,
  Search,
  Scale,
  Sparkles,
  MessageCircle,
  Coins,
  ChartColumn,
  Trophy,
  GitCompare,
  Lightbulb,
  MessagesSquare,
  Wrench,
  Newspaper,
  Quote,
  ListChecks,
  TrendingUp,
  Shapes,
];
function Angles({ selected, title, save, close }) {
  const [chosen, set] = useState(selected),
    [name, setName] = useState(title);
  return (
    <Modal
      wide
      title="Quel(s) aspect(s) de votre sujet allez-vous développer ?"
      close={close}
    >
      <p>Choisissez un ou plusieurs angles pour cette partie.</p>
      <div className="angles">
        {bank.angles.map((a, i) => {
          const Icon = icons[i];
          return (
            <button
              key={a.title}
              aria-pressed={chosen.includes(i)}
              onClick={() =>
                set(
                  chosen.includes(i)
                    ? chosen.filter((k) => k !== i)
                    : [...chosen, i],
                )
              }
            >
              <Icon size={20} />
              <strong>{a.title}</strong>
              <small>{a.help.split("?")[0]} ?</small>
            </button>
          );
        })}
      </div>
      <label>
        Titre de la partie (facultatif)
        <input
          value={name}
          maxLength="120"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button
        className="primary"
        disabled={!chosen.length}
        onClick={() => save(chosen, name.trim())}
      >
        Valider les angles et rédiger la partie <ArrowRight />
      </button>
    </Modal>
  );
}
function HelpBank({ items, insertPhrase }) {
  return (
    <div className="helpbank">
      {items.map((a) => (
        <details key={a.title}>
          <summary>{a.title}</summary>
          {a.help && <p>{a.help}</p>}
          {a.phrases.map((p) => (
            <button
              key={p}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertPhrase(p)}
            >
              {p}
              <Plus size={14} />
            </button>
          ))}
        </details>
      ))}
    </div>
  );
}
export function Workspace({ room, identity, leave }) {
  const snapshot = useSyncExternalStore(room.subscribe, () => room.snapshot);
  const { rows } = snapshot,
    m = rows.meta.data;
  const [, refresh] = useReducer((x) => x + 1, 0);
  const [drafts] = useState(() => new Drafts(room, refresh));
  const [section, setSection] = useState("intro"),
    [active, setActive] = useState(null),
    [view, setView] = useState("edit"),
    [modal, setModal] = useState(""),
    [menu, setMenu] = useState(""),
    [error, setError] = useState(""),
    [msg, setMsg] = useState(""),
    [guide, setGuide] = useState(false),
    [insertAt, setInsertAt] = useState(null);
  const range = useRef({ id: null, at: 0 }),
    nodes = useRef({}),
    drag = useRef(null),
    speech = useSpeech(),
    speechRef = useRef(null);
  const sid = m.sections.includes(section) ? section : "intro",
    s = rows[sid].data;
  const working = { ...rows };
  for (const [k, d] of Object.entries(drafts.entries))
    if (rows[k])
      working[k] = { ...rows[k], data: { ...rows[k].data, text: d.text } };
  const timing = stats(working, sid),
    who = (id) => m.people.find((p) => p.id === id),
    color = (id) => colors[m.people.findIndex((p) => p.id === id)];
  const voice = (id) => <Voice name={who(id)?.name} color={color(id)} />;
  const edits = Object.keys(drafts.entries),
    conflicts = edits.filter(
      (id) =>
        !rows[id] ||
        (!drafts.jobs[id] && rows[id].rev !== drafts.entries[id].rev),
    );
  const protectedSpeech = [
    "permission",
    "recording",
    "processing",
    "preview",
  ].includes(speech.phase);
  useEffect(() => {
    preload();
    room.track(identity, null);
    drafts.flushAll().catch((e) => setError(e.message));
    return () => {
      drafts.close();
      cancelSpeech();
    };
  }, []);
  useEffect(() => {
    room.track(identity, active);
  }, [identity, active]);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(""), 3200);
    return () => clearTimeout(t);
  }, [msg]);
  async function run(fn) {
    try {
      setError("");
      return await fn();
    } catch (e) {
      setError(e.message);
      return false;
    }
  }
  function commit(data, label) {
    return run(async () => {
      await room.save(transaction(room.rows, data, label));
      return true;
    });
  }
  function focus(id, at) {
    setActive(id);
    setTimeout(() => {
      const el = nodes.current[id];
      if (el) {
        el.focus();
        const p = at ?? el.value.length;
        el.setSelectionRange(p, p);
        range.current = { id, at: p };
      }
    }, 40);
  }
  function go(id, block) {
    if (
      protectedSpeech &&
      !confirm("Quitter cette dictée et conserver le texte déjà écrit ?")
    )
      return;
    if (protectedSpeech) cancelSpeech();
    setSection(id);
    setView("edit");
    setActive(null);
    setMenu("");
    setInsertAt(null);
    setGuide(false);
    if (block) focus(block);
  }
  function action(fn) {
    setMenu("");
    return run(async () => {
      await drafts.flushAll();
      return fn(room.rows);
    });
  }
  const display = sectionName(m, sid, s);
  function add(speaker, index) {
    action(async (r) => {
      const a = insert(r, sid, speaker, index ?? r[sid].data.blocks.length);
      if (await commit(a.updates, "Ajouter une réplique")) {
        setModal("");
        setInsertAt(null);
        focus(a.id, 0);
      }
    });
  }
  function clipboard(text) {
    return run(async () => {
      await navigator.clipboard.writeText(text);
      setMsg("Copié dans le presse-papiers.");
    });
  }
  function phrase(p) {
    if (active && rows[active] && s.blocks.includes(active)) {
      const text = working[active].data.text,
        pos =
          range.current.id === active
            ? Math.min(text.length, range.current.at)
            : text.length;
      drafts.type(active, text.slice(0, pos) + p + text.slice(pos));
      setModal("");
      focus(active, pos + p.length);
    } else clipboard(p);
  }
  function anglesDone(angles, title) {
    action(async (r) => {
      const meta = r.meta.data,
        cur = r[sid].data;
      if (modal === "angles") {
        if (
          await commit(
            { [sid]: { ...cur, angles, title } },
            "Modifier les angles",
          )
        )
          setModal("");
        return;
      }
      if (
        sid === "intro" &&
        meta.sections.some((k) => r[k].data.kind === "part")
      ) {
        setModal("");
        go(meta.sections[1]);
        return;
      }
      const id = uid(),
        sections = [...meta.sections];
      sections.splice(
        sections.includes("end") ? sections.length - 1 : sections.length,
        0,
        id,
      );
      const ok = await commit(
        {
          meta: { ...meta, sections },
          [sid]: { ...cur, done: true },
          [id]: { kind: "part", title, angles, blocks: [], done: false },
        },
        "Créer une partie",
      );
      if (ok) {
        setModal("");
        go(id);
      }
    });
  }
  function validate() {
    action(async (r) => {
      if (s.kind === "intro" && m.sections.length === 1) {
        setModal("newpart");
        return;
      }
      if (
        await commit(
          { [sid]: { ...r[sid].data, done: true } },
          "Valider la section",
        )
      ) {
        if (s.kind === "intro") go(m.sections[1]);
        else if (s.kind === "end") setView("review");
      }
    });
  }
  function conclusion() {
    action(async (r) => {
      if (r.end) {
        go("end");
        return;
      }
      const meta = r.meta.data;
      if (
        await commit(
          {
            meta: { ...meta, sections: [...meta.sections, "end"] },
            end: {
              kind: "end",
              title: "Conclusion",
              angles: [],
              blocks: [],
              done: false,
            },
          },
          "Créer la conclusion",
        )
      )
        go("end");
    });
  }
  function changeSectionOrder(step) {
    action((r) => {
      const meta = r.meta.data,
        pos = meta.sections.indexOf(sid),
        parts = [...meta.sections];
      if (r[parts[pos + step]]?.data.kind !== "part") return;
      [parts[pos], parts[pos + step]] = [parts[pos + step], parts[pos]];
      return commit(
        { meta: { ...meta, sections: parts } },
        "Déplacer la partie",
      );
    });
  }
  function deleteSection() {
    action(async (r) => {
      if (!confirm("Supprimer cette partie et ses répliques ?")) return;
      const meta = r.meta.data,
        updates = {
          meta: { ...meta, sections: meta.sections.filter((k) => k !== sid) },
          [sid]: null,
        };
      for (const k of r[sid].data.blocks) updates[k] = null;
      if (await commit(updates, "Supprimer la partie")) go("intro");
    });
  }
  function remove(id) {
    action((r) => {
      if (!confirm("Supprimer cette réplique ?")) return;
      const sec = r[sid].data;
      return commit(
        {
          [sid]: { ...sec, blocks: sec.blocks.filter((k) => k !== id) },
          [id]: null,
        },
        "Supprimer la réplique",
      );
    });
  }
  const guides =
    s.kind === "intro"
      ? bank.intro
      : s.kind === "end"
        ? bank.end
        : s.angles.map((i) => bank.angles[i]);
  const saved = snapshot.status
    ? "Erreur de synchronisation"
    : conflicts.length || snapshot.recovery.length
      ? "Versions à comparer"
      : !snapshot.online
        ? "Sur cet appareil"
        : !navigator.onLine
          ? "Hors connexion · brouillon local"
          : edits.length || snapshot.pending.length
            ? "Sauvegarde en cours…"
            : "Sauvegardé";
  const recordingId = speech.target;
  function changeText(c) {
    return c.after?.data?.text ?? c.previous?.text;
  }
  function describe(c) {
    const d = c.after?.data ?? c.previous;
    if (typeof d?.text === "string") return d.text || "Réplique vide";
    if (d?.kind)
      return (
        (d.title || "Partie") + " · " + (d.blocks?.length || 0) + " réplique(s)"
      );
    if (d?.people) return d.title + " · " + d.sections.length + " section(s)";
    return d?.checked ? "Case cochée" : "Case décochée";
  }
  const command = (text, fn, disabled = false) => (
    <button disabled={disabled} onClick={fn}>
      {text}
    </button>
  );
  const statusBox = (
    <>
      {error && (
        <div role="alert" className="error">
          {error}
          <button
            className="icon"
            aria-label="Masquer le message"
            onClick={() => setError("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {msg && (
        <div className="toast" role="status">
          {msg}
        </div>
      )}
    </>
  );
  if (view === "review")
    return (
      <>
        {statusBox}
        <Review
          rows={working}
          edit={go}
          back={() => setView("edit")}
          commit={commit}
        />
      </>
    );
  return (
    <>
      <header className="mast projectmast">
        <Brand
          onClick={() =>
            action(() => {
              cancelSpeech();
              leave();
            })
          }
        />
        <span className="save" title={snapshot.status}>
          <i />
          {saved}
        </span>
        <button
          className="code"
          onClick={() => clipboard(fmtCode(snapshot.code))}
        >
          {fmtCode(snapshot.code)} <Copy size={15} />
        </button>
        <button
          className="icon"
          aria-label="Réglages"
          onClick={() => setModal("settings")}
        >
          <Settings />
        </button>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <small>Votre chronique</small>
          <h2>{m.title}</h2>
          <div className="voices">
            {m.people.map((p) => (
              <span
                key={p.id}
                title={
                  snapshot.peers.some((v) => v.person === p.id) ||
                  p.id === identity
                    ? "Connecté"
                    : "Chroniqueur"
                }
              >
                {voice(p.id)}
                {(snapshot.peers.some((v) => v.person === p.id) ||
                  p.id === identity) && <b className="online">●</b>}
              </span>
            ))}
          </div>
          <hr />
          <h3>Structure</h3>
          <nav>
            {m.sections.map((k) => (
              <button
                key={k}
                className={sid === k ? "current" : ""}
                onClick={() => go(k)}
              >
                {rows[k].data.done ? <CheckCheck /> : <FileText />}
                <span>{sectionName(m, k, rows[k].data)}</span>
                <ChevronRight size={14} />
              </button>
            ))}
          </nav>
          <button
            className="reviewlink"
            onClick={() =>
              action(() => {
                cancelSpeech();
                setView("review");
              })
            }
          >
            <BookOpen />
            Relire le script
          </button>
          <div className="sidebarbottom">
            <button onClick={() => run(() => room.undo())}>
              <Undo2 size={16} />
              Annuler ma modification
            </button>
          </div>
        </aside>
        <main className="editor">
          {statusBox}
          {snapshot.status && (
            <p className="notice">
              {snapshot.status}{" "}
              <button onClick={() => room.sync()}>Réessayer</button>
            </p>
          )}
          {(snapshot.recovery.length > 0 || conflicts.length > 0) && (
            <button className="notice" onClick={() => setModal("recover")}>
              Comparer et récupérer mes modifications (
              {snapshot.recovery.length + conflicts.length})
            </button>
          )}
          <div className="sectionhead">
            <div>
              <small className="breadcrumb">
                Rédaction <ChevronRight size={12} />{" "}
                {s.kind === "part" ? "Développement" : s.title}
              </small>
              <h1>{display}</h1>
            </div>
            <div className="actions">
              <span className="statuspill">
                {s.done ? "Validée" : "En rédaction"}
              </span>
              {s.kind === "part" && (
                <button
                  className="icon"
                  aria-label="Options de la partie"
                  onClick={() => setModal("section")}
                >
                  <Ellipsis />
                </button>
              )}
            </div>
          </div>
          <div className="aids">
            <button onClick={() => setGuide(!guide)} aria-expanded={guide}>
              <BookOpen />
              Pistes de rédaction
              <ChevronDown size={16} />
            </button>
            <button onClick={() => setModal("sos")}>
              <LifeBuoy />
              SOS rédaction
            </button>
          </div>
          {guide && (
            <div className="guide">
              {s.kind === "part" && (
                <p>
                  Vérifiez vos faits, chiffres et témoignages dans vos sources.
                </p>
              )}
              <HelpBank items={guides} insertPhrase={phrase} />
            </div>
          )}
          {s.kind === "end" && (
            <p className="notice">
              Gardez l’annonce du morceau (titre et artiste) pour la toute
              dernière phrase.
            </p>
          )}
          <div className="dialoguehead">
            <h3>Dialogue</h3>
            <small>
              {s.blocks.length} réplique{s.blocks.length > 1 ? "s" : ""}
            </small>
          </div>
          {!s.blocks.length && (
            <div className="emptydialogue">
              <Mic />
              <h3>Qui prend la parole ?</h3>
              <p>
                Choisissez un prénom pour écrire ou dicter la première réplique.
              </p>
            </div>
          )}
          {s.blocks.map((id, i) => {
            const b = working[id].data,
              live = protectedSpeech && recordingId === id;
            return (
              <article
                key={id}
                className={"block " + (active === id ? "editing" : "")}
                style={{ "--voice": color(b.speaker) }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const src = drag.current;
                  drag.current = null;
                  if (src && s.blocks.includes(src))
                    action((r) =>
                      commit(move(r, sid, sid, src, i), "Déplacer la réplique"),
                    );
                }}
              >
                <div className="blockhead">
                  {voice(b.speaker)}
                  <small>
                    {snapshot.peers
                      .filter((v) => v.editing === id && v.person !== identity)
                      .map((v) => who(v.person)?.name + " écrit…")
                      .join(", ")}
                  </small>
                  <button
                    className="icon handle"
                    draggable
                    aria-label="Faire glisser la réplique"
                    onDragStart={(e) => {
                      drag.current = id;
                      e.dataTransfer.setData("text/plain", id);
                    }}
                  >
                    <GripVertical size={18} />
                  </button>
                  <button
                    className="icon"
                    aria-label={"Options de la réplique " + (i + 1)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setActive(id);
                      setMenu(menu === id ? "" : id);
                    }}
                  >
                    <Ellipsis />
                  </button>
                </div>
                <textarea
                  ref={(el) => {
                    nodes.current[id] = el;
                  }}
                  aria-label={
                    "Réplique " + (i + 1) + " de " + who(b.speaker).name
                  }
                  value={b.text}
                  placeholder="Écris ta réplique ici…"
                  onFocus={() => setActive(id)}
                  onSelect={(e) => {
                    range.current = { id, at: e.target.selectionStart };
                  }}
                  onChange={(e) => drafts.type(id, e.target.value)}
                  onBlur={() =>
                    drafts.flush(id).catch((e) => setError(e.message))
                  }
                />
                {menu === id && (
                  <div className="blockmenu">
                    {command("Modifier", () => {
                      setMenu("");
                      focus(id);
                    })}
                    {command(
                      "Redicter",
                      () => {
                        setMenu("");
                        speechRef.current = {
                          id,
                          rev: rows[id].rev,
                          text: b.text,
                        };
                        startSpeech(id);
                      },
                      speech.phase !== "ready",
                    )}
                    {command("Diviser au curseur", () =>
                      action((r) =>
                        commit(
                          split(
                            r,
                            sid,
                            id,
                            range.current.id === id ? range.current.at : 0,
                          ),
                          "Diviser la réplique",
                        ),
                      ),
                    )}
                    {command(
                      "Fusionner avec la suivante",
                      () =>
                        action((r) =>
                          commit(merge(r, sid, id), "Fusionner les répliques"),
                        ),
                      rows[s.blocks[i + 1]]?.data.speaker !== b.speaker,
                    )}
                    {["avant", "après"].map((w, j) => (
                      <button
                        key={w}
                        onClick={() => {
                          setMenu("");
                          setInsertAt(i + j);
                          setModal("speaker");
                        }}
                      >
                        Insérer {w}
                      </button>
                    ))}
                    {command(
                      "Monter",
                      () =>
                        action((r) =>
                          commit(
                            move(r, sid, sid, id, i - 1),
                            "Monter la réplique",
                          ),
                        ),
                      i === 0,
                    )}
                    {command(
                      "Descendre",
                      () =>
                        action((r) =>
                          commit(
                            move(r, sid, sid, id, i + 1),
                            "Descendre la réplique",
                          ),
                        ),
                      i === s.blocks.length - 1,
                    )}
                    <select
                      aria-label="Réattribuer la réplique"
                      value=""
                      onChange={(e) => {
                        const speaker = e.target.value;
                        action((r) =>
                          commit(
                            { [id]: { ...r[id].data, speaker } },
                            "Réattribuer la réplique",
                          ),
                        );
                      }}
                    >
                      <option value="">Réattribuer à…</option>
                      {m.people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Déplacer vers une section"
                      value=""
                      onChange={(e) => {
                        const dest = e.target.value;
                        action((r) =>
                          commit(
                            move(r, sid, dest, id, r[dest].data.blocks.length),
                            "Changer de section",
                          ),
                        );
                      }}
                    >
                      <option value="">Déplacer vers…</option>
                      {m.sections
                        .filter((k) => k !== sid)
                        .map((k) => (
                          <option key={k} value={k}>
                            {sectionName(m, k, rows[k].data)}
                          </option>
                        ))}
                    </select>
                    {command("Supprimer", () => remove(id))}
                  </div>
                )}
                {active === id || live ? (
                  <div className="blocktools">
                    {live ? (
                      <>
                        <span>
                          {speech.message}
                          {speech.phase === "recording"
                            ? " · " + speech.seconds + " s"
                            : ""}
                        </span>
                        {speech.phase === "recording" && (
                          <button onClick={stopSpeech}>
                            <Square size={13} />
                            Arrêter et transcrire
                          </button>
                        )}
                        {speech.phase === "preview" && (
                          <>
                            <blockquote>
                              {speech.result || "Aucune parole reconnue."}
                            </blockquote>
                            <button
                              disabled={!speech.result}
                              onClick={() =>
                                run(async () => {
                                  if (!rows[id]) return;
                                  if (
                                    working[id].data.text !==
                                      speechRef.current?.text &&
                                    !confirm(
                                      "Le texte a changé pendant la dictée. Le remplacer par cette transcription ?",
                                    )
                                  )
                                    return;
                                  drafts.type(id, speech.result);
                                  cancelSpeech();
                                  focus(id);
                                })
                              }
                            >
                              Accepter la transcription
                            </button>
                          </>
                        )}
                        <button onClick={() => cancelSpeech()}>Annuler</button>
                      </>
                    ) : (
                      <>
                        <button
                          disabled={speech.phase !== "ready"}
                          onClick={() => {
                            speechRef.current = { id, text: b.text };
                            startSpeech(id);
                          }}
                        >
                          <Mic size={15} />
                          {b.text ? "Redicter" : "Enregistrer"}
                        </button>
                        <button
                          onClick={() =>
                            run(async () => {
                              await drafts.flush(id);
                              setActive(null);
                              setMsg("Réplique validée.");
                            })
                          }
                        >
                          <Check size={15} />
                          Valider la réplique
                        </button>
                      </>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
          <div className="addline">
            <small>Ajouter une réplique</small>
            <div className="actions">
              {m.people.map((p) => (
                <button key={p.id} onClick={() => add(p.id)}>
                  {voice(p.id)}
                  <Plus size={15} />
                </button>
              ))}
            </div>
          </div>
          <button className="speechstate" onClick={() => setModal("settings")}>
            <Mic size={15} />
            <span>
              {speech.phase === "error"
                ? "Dictée indisponible · voir les réglages"
                : speech.message || "Préparation de la dictée"}
            </span>
            <Settings size={14} />
          </button>
          <div className="validation">
            {s.kind === "part" && s.done ? (
              <div className="actions">
                <button onClick={() => setModal("newpart")}>
                  <Plus />
                  Ajouter une nouvelle partie
                </button>
                <button onClick={conclusion}>
                  Passer à la conclusion
                  <ArrowRight />
                </button>
              </div>
            ) : (
              <button className="primary" onClick={validate}>
                {s.kind === "intro"
                  ? m.sections.length === 1
                    ? "Valider l’introduction et créer la première partie"
                    : "Valider et ouvrir la première partie"
                  : s.kind === "part"
                    ? "Valider cette partie"
                    : "Terminer la chronique et relire le script"}
                <ArrowRight />
              </button>
            )}
          </div>
        </main>
        <aside className="meter">
          <h3>
            <Clock3 />
            Temps de parole
          </h3>
          <small>Chronique entière</small>
          <strong>{time(timing.total)}</strong>
          <div className="metersection">
            Cette section <b>{time(timing.section)}</b>
          </div>
          <div className="bar">
            {timing.people.map((p, i) => (
              <i
                key={p.id}
                style={{ width: p.percent + "%", background: colors[i] }}
              />
            ))}
          </div>
          {timing.people.map((p, i) => (
            <div className="meterperson" key={p.id}>
              {voice(p.id)}
              <span>
                {time(p.seconds)} · {Math.round(p.percent)} %
              </span>
            </div>
          ))}
          <p>Estimation à {m.speed} mots/minute, hors musique et pauses.</p>
        </aside>
      </div>
      {modal === "sos" && (
        <Modal title="SOS rédaction" close={() => setModal("")}>
          <p>
            {active
              ? "Clique sur une formulation pour l’insérer au curseur."
              : "Clique sur une formulation pour la copier."}
          </p>
          <HelpBank items={bank.sos} insertPhrase={phrase} />
        </Modal>
      )}
      {(modal === "angles" || modal === "newpart") && (
        <Angles
          selected={modal === "angles" ? s.angles : []}
          title={modal === "angles" ? s.title : ""}
          close={() => setModal("")}
          save={anglesDone}
        />
      )}
      {modal === "speaker" && (
        <Modal title="Qui prend la parole ?" close={() => setModal("")}>
          <div className="actions">
            {m.people.map((p) => (
              <button key={p.id} onClick={() => add(p.id, insertAt)}>
                {voice(p.id)}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {modal === "section" && (
        <Modal title={display} close={() => setModal("")}>
          <div className="stack">
            <button onClick={() => setModal("angles")}>
              Modifier le titre et les angles
            </button>
            {command(
              "Monter la partie",
              () => {
                changeSectionOrder(-1);
                setModal("");
              },
              m.sections.indexOf(sid) <= 1,
            )}
            {command(
              "Descendre la partie",
              () => {
                changeSectionOrder(1);
                setModal("");
              },
              rows[m.sections[m.sections.indexOf(sid) + 1]]?.data.kind !==
                "part",
            )}
            <button
              onClick={() => {
                setModal("");
                deleteSection();
              }}
            >
              Supprimer cette partie
            </button>
          </div>
        </Modal>
      )}
      {modal === "settings" && (
        <Modal title="Réglages de l’atelier" close={() => setModal("")}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.target);
              action(async (r) => {
                if (
                  await commit(
                    {
                      meta: {
                        ...r.meta.data,
                        title: f.get("title").trim() || r.meta.data.title,
                        speed: +f.get("speed"),
                      },
                    },
                    "Réglages du projet",
                  )
                )
                  setModal("");
              });
            }}
          >
            <label>
              Sujet de la chronique
              <input
                name="title"
                required
                maxLength="160"
                defaultValue={m.title}
              />
            </label>
            <label>
              Vitesse de lecture (mots/minute)
              <input
                type="number"
                name="speed"
                min="100"
                max="180"
                required
                defaultValue={m.speed}
              />
            </label>
            <button>Appliquer au projet</button>
          </form>
          <hr />
          <h3>Dictée sur cet appareil</h3>
          <label>
            Modèle de transcription
            <select
              value={speech.model}
              disabled={protectedSpeech}
              onChange={(e) => loadModel(e.target.value)}
            >
              {Object.entries(models).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <p className="notice">{speech.message}</p>
          <p>
            Le modèle se télécharge au premier usage. L’audio reste sur cet
            appareil.
          </p>
          {speech.loadMs > 0 && (
            <small>
              Chargement : {(speech.loadMs / 1000).toFixed(1)} s.{" "}
              {speech.inferenceMs > 0
                ? "Dernière transcription : " +
                  (speech.inferenceMs / 1000).toFixed(1) +
                  " s."
                : ""}
            </small>
          )}
          {!protectedSpeech && (
            <button onClick={() => loadModel()}>Recharger le modèle</button>
          )}
        </Modal>
      )}
      {modal === "recover" && (
        <Modal title="Comparer les versions" close={() => setModal("")}>
          <p>Copie le passage à reprendre ou choisis la version à conserver.</p>
          {conflicts.map((k) => (
            <section key={k}>
              <h3>Ton brouillon</h3>
              <blockquote>{drafts.entries[k].text}</blockquote>
              <h3>Version du groupe</h3>
              <blockquote>
                {rows[k]?.data.text ?? "Réplique supprimée"}
              </blockquote>
              <div className="actions">
                <button onClick={() => clipboard(drafts.entries[k].text)}>
                  Copier mon texte
                </button>
                {rows[k] && (
                  <button onClick={() => run(() => drafts.keep(k))}>
                    Garder mon texte
                  </button>
                )}
                <button onClick={() => drafts.discard(k)}>
                  Garder la version du groupe
                </button>
              </div>
            </section>
          ))}
          {snapshot.recovery.map((tx) => (
            <section key={tx.id}>
              <h3>{tx.label}</h3>
              {tx.changes.map((c) => (
                <div key={c.key}>
                  <strong>Proposition locale</strong>
                  <blockquote>{describe(c)}</blockquote>
                  <strong>Version du groupe</strong>
                  <blockquote>
                    {rows[c.key]
                      ? describe({ after: rows[c.key] })
                      : "Élément absent"}
                  </blockquote>
                  {tx.changes.length === 1 &&
                    typeof changeText(c) === "string" &&
                    rows[c.key]?.data?.speaker && (
                      <button
                        onClick={() =>
                          run(async () => {
                            const current = room.rows[c.key];
                            await room.save(
                              transaction(
                                room.rows,
                                {
                                  [c.key]: {
                                    ...current.data,
                                    text: changeText(c),
                                  },
                                },
                                "Reprendre ma version",
                              ),
                            );
                            await room.mutate((s) => {
                              s.recovery = s.recovery.filter(
                                (t) => t.id !== tx.id,
                              );
                            });
                            setMsg("Texte repris.");
                          })
                        }
                      >
                        Reprendre mon texte ici
                      </button>
                    )}
                </div>
              ))}
              <button
                onClick={() =>
                  clipboard(
                    tx.changes
                      .map(
                        (c) =>
                          c.after?.data.text ?? JSON.stringify(c.after?.data),
                      )
                      .join("\n"),
                  )
                }
              >
                Copier ma proposition
              </button>
              <button
                onClick={() =>
                  room.mutate((s) => {
                    s.recovery = s.recovery.filter((t) => t.id !== tx.id);
                  })
                }
              >
                Accepter la version du groupe
              </button>
            </section>
          ))}
        </Modal>
      )}
    </>
  );
}
