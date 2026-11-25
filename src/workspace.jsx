import React, {
  useEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  Copy,
  Ellipsis,
  FileText,
  GripVertical,
  LifeBuoy,
  Mic,
  Plus,
  Scissors,
  Settings,
  Square,
  Trash2,
  Undo2,
  UserRoundPen,
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
  insert,
  split,
  reorderReply,
} from "./domain.js";
import { Brand, Modal, Voice, fmtCode } from "./ui.jsx";
import {
  guidePrefix,
  SpeakingTime,
  WritingGuides,
  WritingSOS,
} from "./workshop-aids.jsx";
import { useReplyDrag } from "./reply-drag.js";
import { Review } from "./output.jsx";
import { Feedback, feedbackEntries } from "./feedback.jsx";
import { animationGuides } from "./animation.js";
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
function ReplyAction({ label, icon: Icon, tone, children, ...props }) {
  return (
    <button
      type="button"
      className="reply-action"
      data-tone={tone}
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon size={18} aria-hidden="true" />
      {children && <span>{children}</span>}
    </button>
  );
}
function SpeakerNames({ people, animation, save, close }) {
  const [original] = useState(people);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const names = original.map((person) => fields.get(person.id).trim());
    setBusy(true);
    setError("");
    try {
      if (names.some((name) => !name))
        throw Error("Indique un prénom pour chaque voix.");
      if (
        new Set(names.map((name) => name.toLowerCase())).size !== names.length
      )
        throw Error("Distingue les prénoms, par exemple avec une initiale.");
      await save(original, names);
      close();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={animation ? "Prénoms des animateurs" : "Prénoms des chroniqueurs"}
      close={close}
    >
      <form onSubmit={submit}>
        {original.map((person, index) => (
          <label key={person.id}>
            Prénom {index + 1}
            <input
              autoFocus={index === 0}
              required
              maxLength={40}
              name={person.id}
              defaultValue={person.name}
              style={{ borderLeft: "4px solid " + colors[index] }}
            />
          </label>
        ))}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          Enregistrer les prénoms
        </button>
      </form>
    </Modal>
  );
}

export function Workspace({ room, identity, leave, openProgram }) {
  const snapshot = useSyncExternalStore(room.subscribe, () => room.snapshot);
  const { rows, context } = snapshot,
    m = rows.meta.data;
  const animation = Object.hasOwn(animationGuides, context?.kind);
  const feedback = context?.showId ? feedbackEntries(rows) : [];
  const [, refresh] = useReducer((x) => x + 1, 0);
  const [drafts] = useState(() => new Drafts(room, refresh));
  const [section, setSection] = useState("intro"),
    [active, setActive] = useState(null),
    [view, setView] = useState("edit"),
    [modal, setModal] = useState(""),
    [error, setError] = useState(""),
    [msg, setMsg] = useState(""),
    [feedbackTarget, setFeedbackTarget] = useState(null),
    [replyPicker, setReplyPicker] = useState(null);
  const nodes = useRef({}),
    structureAtOpen = useRef(null),
    replyList = useRef(null),
    speech = useSpeech(),
    speechRef = useRef(null);
  const sid = m.sections.includes(section) ? section : "intro",
    s = rows[sid].data;
  const drag = useReplyDrag(replyList, view === "edit" ? sid : null, moveReply);
  const activeReply = s.blocks.includes(active) ? active : null;
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
    room.track(identity, activeReply);
  }, [identity, activeReply]);
  useEffect(() => {
    if (protectedSpeech && speech.target && !rows[speech.target])
      cancelSpeech();
  }, [rows, protectedSpeech, speech.target]);
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
  async function saveNames(original, names) {
    const latest = room.rows.meta.data;
    if (
      latest.people.length !== original.length ||
      latest.people.some(
        (person, index) =>
          person.id !== original[index].id ||
          person.name !== original[index].name,
      )
    )
      throw Error(
        "L’équipe a changé sur un autre appareil. Rouvre les prénoms pour voir la version à jour.",
      );

    if (latest.people.every((person, index) => person.name === names[index]))
      return;
    const people = latest.people.map((person, index) => ({
      ...person,
      name: names[index],
    }));
    await room.save(
      transaction(
        room.rows,
        { meta: { ...latest, people } },
        "Renommer les voix",
      ),
    );
  }
  function focus(id, at) {
    setActive(id);
    requestAnimationFrame(() => {
      const el = nodes.current[id];
      if (el) {
        el.focus();
        const p = at ?? el.value.length;
        el.setSelectionRange(p, p);
      }
    });
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
    setReplyPicker(null);
    if (block) focus(block);
  }
  function action(fn) {
    return run(async () => {
      await drafts.flushAll();
      return fn(room.rows);
    });
  }
  function navigate(destination) {
    action(async () => {
      cancelSpeech();
      await room.sync();
      destination();
    });
  }
  function showFeedback(block) {
    setFeedbackTarget(block);
    setModal("feedback");
  }
  const display = sectionName(m, sid, s);
  function add(speaker, after = null) {
    run(async () => {
      const r = room.rows;
      const blocks = r[sid]?.data.blocks;
      if (!blocks || (after && !blocks.includes(after))) {
        setReplyPicker(null);
        throw Error("Ce passage a été supprimé.");
      }
      const a = insert(
        r,
        sid,
        speaker,
        after ? blocks.indexOf(after) + 1 : blocks.length,
      );
      if (await commit(a.updates, "Ajouter une réplique")) {
        setReplyPicker(null);
        focus(a.id, 0);
      }
    });
  }
  function assign(id, speaker) {
    run(async () => {
      await drafts.flush(id);
      const reply = room.rows[id]?.data;
      if (!reply || !room.rows[sid]?.data.blocks.includes(id)) return;
      if (
        await commit({ [id]: { ...reply, speaker } }, "Réattribuer la réplique")
      )
        setReplyPicker(null);
    });
  }
  function divide(id) {
    const editor = nodes.current[id];
    const { selectionStart: at, value: text } = editor;
    run(async () => {
      if (at <= 0 || at >= text.length) {
        focus(id, at);
        throw Error("Place le curseur entre les deux passages à séparer.");
      }
      await drafts.flush(id);
      const r = room.rows;
      if (r[id]?.data.text !== text || !r[sid]?.data.blocks.includes(id))
        throw Error(
          "Cette réplique a changé. Choisis à nouveau où la diviser.",
        );
      await commit(split(r, sid, id, at), "Diviser la réplique");
    });
  }
  function moveReply(id, neighbor, edge, handle) {
    run(async () => {
      const moved = reorderReply(room.rows, sid, id, neighbor, edge);
      if (!moved) return;
      if (await commit(moved.updates, "Déplacer la réplique")) {
        setMsg("Réplique déplacée en position " + moved.position + ".");
        if (handle) requestAnimationFrame(() => handle.focus());
      }
    });
  }
  function clipboard(text) {
    return run(async () => {
      await navigator.clipboard.writeText(text);
      setMsg("Copié dans le presse-papiers.");
      return true;
    });
  }
  function phrase(p) {
    if (!activeReply) return clipboard(p);
    return run(() => {
      const editor = nodes.current[activeReply];
      const pos = editor.selectionStart;
      const left = editor.value.slice(0, pos);
      const right = editor.value.slice(pos);
      const prefix = left && !/\s$/.test(left) ? " " : "";
      const suffix = right && !/^[\s,.!?;:…)]/.test(right) ? " " : "";
      drafts.type(activeReply, left + prefix + p + suffix + right);
      setModal("");
      focus(activeReply, pos + prefix.length + p.length + suffix.length);
      return true;
    });
  }
  function openNewPart() {
    structureAtOpen.current = room.rows.meta.data.sections.join("/");
    setModal("newpart");
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
      if (meta.sections.join("/") !== structureAtOpen.current) {
        setModal("");
        throw Error(
          "La structure a changé pendant le choix des angles. Vérifie les parties du groupe avant d’en ajouter une.",
        );
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
      if (
        s.kind === "intro" &&
        !m.sections.some((k) => rows[k].data.kind === "part")
      ) {
        openNewPart();
        return;
      }
      if (
        await commit(
          { [sid]: { ...r[sid].data, done: true } },
          "Valider la section",
        )
      ) {
        if (s.kind === "intro") go(m.sections[1]);
        else if (animation || s.kind === "end") setView("review");
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
      for (const k of Object.keys(r))
        if (k.startsWith(guidePrefix(sid))) updates[k] = null;
      if (await commit(updates, "Supprimer la partie")) go("intro");
    });
  }
  function remove(id) {
    if (!confirm("Supprimer cette réplique ?")) return;
    run(async () => {
      await drafts.flush(id);
      const sec = room.rows[sid]?.data;
      if (!sec?.blocks.includes(id)) return;
      await commit(
        {
          [sid]: { ...sec, blocks: sec.blocks.filter((k) => k !== id) },
          [id]: null,
        },
        "Supprimer la réplique",
      );
    });
  }
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
  const feedbackPanel = context?.showId && (
    <Feedback
      room={room}
      identity={identity}
      manager={context.manager}
      entries={feedback}
      target={feedbackTarget}
      open={modal === "feedback"}
      show={showFeedback}
      close={() => setModal("")}
    />
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
          animation={animation}
        />
      </>
    );
  return (
    <>
      <header className="mast projectmast">
        <Brand onClick={() => navigate(leave)} />
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
          <small>{animation ? "Votre animation" : "Votre chronique"}</small>
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
          <button
            className="edit-speakers"
            onClick={() => setModal("speakers")}
          >
            <UserRoundPen aria-hidden="true" /> Modifier les prénoms
          </button>
          <hr />
          {context?.showId && (
            <button
              className="program-back"
              onClick={() => navigate(() => openProgram(context.showId))}
            >
              <ArrowLeft /> Conducteur de l’émission
            </button>
          )}
          <h3>Structure</h3>
          <nav>
            {m.sections.map((k) => (
              <button
                key={k}
                className={sid === k ? "current" : ""}
                data-kind={rows[k].data.kind}
                aria-current={sid === k ? "true" : undefined}
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
        <main className="editor" data-kind={s.kind}>
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
                {animation
                  ? "Animation"
                  : s.kind === "part"
                    ? "Développement"
                    : s.title}
              </small>
              <h1>{display}</h1>
            </div>
            <div className="actions">
              <span className="statuspill" data-done={s.done}>
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
          <SpeakingTime timing={timing} speed={m.speed} animation={animation} />
          {feedbackPanel}
          <div className="dialoguehead">
            <div className="dialogue-label">
              <h3>Dialogue</h3>
              <small>
                {s.blocks.length} réplique{s.blocks.length === 1 ? "" : "s"}
              </small>
            </div>
            <div className="actions">
              <button
                type="button"
                className="writing-jump"
                onClick={() =>
                  document.getElementById("writing-guides")?.focus()
                }
              >
                <BookOpen aria-hidden="true" /> Pistes de rédaction
              </button>
              <button
                type="button"
                className="sos-launch"
                aria-haspopup="dialog"
                onClick={() => setModal("sos")}
              >
                <LifeBuoy aria-hidden="true" /> SOS rédaction
              </button>
            </div>
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
          <div className="reply-list" ref={replyList}>
            {s.blocks.map((id, index) => {
              const b = working[id].data;
              const live = protectedSpeech && recordingId === id;
              const comments = feedback.filter((entry) => entry.block === id);
              const recordLabel = b.text ? "Redicter" : "Enregistrer";
              const marker = drag.indicator?.drop;
              const peers = snapshot.peers
                .filter(
                  (peer) => peer.editing === id && peer.person !== identity,
                )
                .map((peer) => who(peer.person)?.name + " écrit…");
              return (
                <article
                  key={id}
                  className="block"
                  data-reply={id}
                  data-active={activeReply === id}
                  data-dragging={drag.indicator?.source === id}
                  data-drop={marker?.id === id ? marker.edge : undefined}
                  style={{ "--voice": color(b.speaker) }}
                >
                  <div className="blockhead">
                    {voice(b.speaker)}
                    <small>{peers.join(", ")}</small>
                    <button
                      type="button"
                      className="icon handle"
                      aria-label={"Déplacer la réplique " + (index + 1)}
                      aria-keyshortcuts="ArrowUp ArrowDown"
                      title="Glisser pour déplacer · ↑ et ↓ au clavier"
                      disabled={s.blocks.length < 2 || live}
                      {...drag.handle(id)}
                    >
                      <GripVertical size={20} aria-hidden="true" />
                    </button>
                  </div>
                  <textarea
                    ref={(el) => {
                      nodes.current[id] = el;
                    }}
                    aria-label={
                      "Réplique " + (index + 1) + " de " + who(b.speaker).name
                    }
                    value={b.text}
                    placeholder="Écris ta réplique ici…"
                    onFocus={() => setActive(id)}
                    onChange={(e) => drafts.type(id, e.target.value)}
                    onBlur={() =>
                      drafts.flush(id).catch((e) => setError(e.message))
                    }
                  />
                  {live && (
                    <div className="blocktools">
                      <span>
                        {speech.message}
                        {speech.phase === "recording" &&
                          " · " + speech.seconds + " s"}
                      </span>
                      {speech.phase === "recording" && (
                        <button type="button" onClick={stopSpeech}>
                          <Square size={13} /> Arrêter et transcrire
                        </button>
                      )}
                      {speech.phase === "preview" && (
                        <>
                          <blockquote>
                            {speech.result || "Aucune parole reconnue."}
                          </blockquote>
                          <button
                            type="button"
                            disabled={!speech.result}
                            onClick={() =>
                              run(() => {
                                if (!room.rows[id]) return;
                                if (
                                  nodes.current[id]?.value !==
                                    speechRef.current &&
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
                      <button type="button" onClick={() => cancelSpeech()}>
                        Annuler
                      </button>
                    </div>
                  )}
                  <div className="reply-actions">
                    <ReplyAction
                      label={recordLabel}
                      icon={Mic}
                      tone="rose"
                      disabled={speech.phase !== "ready"}
                      onClick={() => {
                        setActive(id);
                        speechRef.current = b.text;
                        startSpeech(id);
                      }}
                    >
                      {recordLabel}
                    </ReplyAction>
                    <ReplyAction
                      label="Valider la réplique"
                      icon={Check}
                      tone="vert"
                      disabled={live}
                      onClick={() =>
                        run(async () => {
                          await drafts.flush(id);
                          setActive((current) =>
                            current === id ? null : current,
                          );
                          setMsg("Réplique validée.");
                        })
                      }
                    >
                      Valider la réplique
                    </ReplyAction>
                    <ReplyAction
                      label="Diviser au curseur"
                      icon={Scissors}
                      tone="bleu"
                      disabled={live || !b.text}
                      onClick={() => divide(id)}
                    />
                    <ReplyAction
                      label="Réattribuer à…"
                      icon={UserRoundPen}
                      tone="violet"
                      disabled={live}
                      aria-haspopup="dialog"
                      onClick={() => setReplyPicker({ id, kind: "assign" })}
                    />
                    <ReplyAction
                      label="Supprimer la réplique"
                      icon={Trash2}
                      tone="rose"
                      disabled={live}
                      onClick={() => remove(id)}
                    />
                    {context?.manager && context.showId && (
                      <ReplyAction
                        label={"Commenter la réplique " + (index + 1)}
                        icon={MessageCircle}
                        tone="violet"
                        aria-haspopup="dialog"
                        onClick={() => showFeedback(id)}
                      />
                    )}
                    <ReplyAction
                      label="Insérer après cette réplique"
                      icon={Plus}
                      tone="indigo"
                      aria-haspopup="dialog"
                      onClick={() => setReplyPicker({ id, kind: "insert" })}
                    />
                  </div>
                  {!!comments.length && (
                    <ul
                      className="reply-comments"
                      aria-label="Commentaires de l’enseignant"
                    >
                      {comments.map((entry) => (
                        <li key={entry.id}>
                          <strong>
                            {entry.important
                              ? "Commentaire important"
                              : "Commentaire de l’enseignant"}
                          </strong>
                          <p>{entry.text}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>
          <div className="addline">
            <small>Ajouter une réplique</small>
            <div className="actions">
              {m.people.map((p) => (
                <button
                  key={p.id}
                  style={{ "--voice": color(p.id) }}
                  onClick={() => add(p.id)}
                >
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
                <button onClick={openNewPart}>
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
                  ? !m.sections.some((k) => rows[k].data.kind === "part")
                    ? "Valider l’introduction et créer la première partie"
                    : "Valider et ouvrir la première partie"
                  : s.kind === "part"
                    ? "Valider cette partie"
                    : animation
                      ? "Valider la séquence et relire le script"
                      : "Terminer la chronique et relire le script"}
                <ArrowRight />
              </button>
            )}
          </div>
        </main>
        <WritingGuides
          key={sid}
          sectionId={sid}
          section={s}
          rows={rows}
          active={activeReply}
          insertPhrase={phrase}
          commit={commit}
        />
      </div>
      {modal === "sos" && (
        <WritingSOS
          close={() => setModal("")}
          active={activeReply}
          insertPhrase={phrase}
        />
      )}
      {(modal === "angles" || modal === "newpart") && (
        <Angles
          selected={modal === "angles" ? s.angles : []}
          title={modal === "angles" ? s.title : ""}
          close={() => setModal("")}
          save={anglesDone}
        />
      )}
      {replyPicker && s.blocks.includes(replyPicker.id) && (
        <Modal
          title={
            replyPicker.kind === "assign"
              ? "Réattribuer la réplique"
              : "Insérer une réplique"
          }
          close={() => setReplyPicker(null)}
        >
          <p>
            {replyPicker.kind === "assign"
              ? "Qui prononcera cette réplique ?"
              : "Qui prend la parole ensuite ?"}
          </p>
          <div className="actions">
            {m.people.map((p) => (
              <button
                type="button"
                key={p.id}
                disabled={
                  replyPicker.kind === "assign" &&
                  rows[replyPicker.id].data.speaker === p.id
                }
                onClick={() =>
                  replyPicker.kind === "assign"
                    ? assign(replyPicker.id, p.id)
                    : add(p.id, replyPicker.id)
                }
              >
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
      {modal === "speakers" && (
        <SpeakerNames
          people={m.people}
          animation={animation}
          save={saveNames}
          close={() => setModal("")}
        />
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
                        title: f.get("title")?.trim() || r.meta.data.title,
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
            {!animation && (
              <label>
                Sujet de la chronique
                <input
                  name="title"
                  required
                  maxLength="160"
                  defaultValue={m.title}
                />
              </label>
            )}
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
