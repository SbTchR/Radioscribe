import React, { useRef, useState } from "react";
import {
  ArrowRightLeft,
  AudioLines,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  Lightbulb,
  MessageCircle,
  Mic,
  Music,
  Plus,
  Radio,
  Scale,
  UsersRound,
} from "lucide-react";
import bank from "./atelier.json";
import { animationGuides } from "./animation.js";
import { colors, time } from "./domain.js";
import { Modal, Voice } from "./ui.jsx";

export function SpeakingTime({ timing, animation }) {
  return (
    <section className="meter" aria-label="Temps de parole estimé">
      <div className="meter-captions">
        <span>
          <Clock3 size={15} aria-hidden="true" /> Cette section{" "}
          <b>{time(timing.section)}</b>
        </span>
        <span>
          {animation ? "Séquence" : "Chronique entière"}{" "}
          <b>{time(timing.total)}</b>
        </span>
      </div>
      <div className="bar" aria-hidden="true">
        {timing.people.map((p, i) => (
          <i
            key={p.id}
            style={{ width: p.percent + "%", background: colors[i] }}
          />
        ))}
      </div>
      <div className="meter-voices">
        {timing.people.map((p, i) => (
          <div key={p.id}>
            <Voice name={p.name} color={colors[i]} />
            <span>
              {time(p.seconds)} · {Math.round(p.percent)} %
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export const guidePrefix = (sectionId) => "guide:" + sectionId + ":";

function GuideExamples({ title, phrases, active, insertPhrase }) {
  const [index, setIndex] = useState(0);
  const count = phrases.length;
  if (!count) return null;
  const phrase = phrases[index];
  const PhraseIcon = active ? Plus : Copy;
  const move = (step) =>
    setIndex((current) => (current + step + count) % count);
  return (
    <div
      className="guide-examples"
      role="group"
      aria-label={"Exemples pour " + title}
    >
      <button
        type="button"
        className="guide-phrase"
        title={active ? "Insérer au curseur" : "Copier dans le presse-papiers"}
        onClick={() => insertPhrase(phrase)}
      >
        <span aria-live="polite" aria-atomic="true">
          {phrase}
        </span>
        <PhraseIcon size={15} aria-hidden="true" />
      </button>
      {count > 1 && (
        <div className="guide-example-nav">
          <button
            type="button"
            aria-label="Exemple précédent"
            onClick={() => move(-1)}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <span>
            {index + 1} / {count}
          </span>
          <button
            type="button"
            aria-label="Exemple suivant"
            onClick={() => move(1)}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

export function WritingGuides({
  sectionId,
  section,
  rows,
  active,
  insertPhrase,
  commit,
}) {
  const [pending, setPending] = useState({});
  const { kind, angles } = section;
  const source =
    kind === "part" ? bank.angles : animationGuides[kind] || bank[kind];
  const indices = kind === "part" ? angles : source.map((_, i) => i);
  const guides = indices.map((i) => ({
    ...source[i],
    key: guidePrefix(sectionId) + i,
  }));
  const isChecked = (key) => pending[key] ?? !!rows[key]?.data.checked;
  const completed = guides.filter((guide) => isChecked(guide.key)).length;
  async function toggle(key, checked) {
    if (key in pending) return;
    setPending((current) => ({ ...current, [key]: checked }));
    try {
      await commit({ [key]: { checked } }, "Piste de rédaction");
    } finally {
      setPending((current) => {
        const remaining = { ...current };
        delete remaining[key];
        return remaining;
      });
    }
  }
  return (
    <aside
      className="writing-panel"
      aria-labelledby="writing-guides"
      data-kind={kind}
    >
      <div className="writing-panel-inner">
        <div className="writing-panel-heading">
          <h2 id="writing-guides" tabIndex={-1}>
            <BookOpen size={19} aria-hidden="true" /> Pistes de rédaction
          </h2>
          <span
            className="guide-count"
            aria-label={completed + " pistes rédigées sur " + guides.length}
          >
            {completed} / {guides.length}
          </span>
        </div>
        {kind === "part" && (
          <p className="guide-note">
            Vérifiez vos faits, chiffres et témoignages dans vos sources.
          </p>
        )}
        {kind === "end" && (
          <p className="guide-note">
            Gardez l’annonce du morceau (titre et artiste) pour la toute
            dernière phrase.
          </p>
        )}
        <ul className="guide-list">
          {guides.map(({ key, title, help, phrases }) => {
            const checked = isChecked(key);
            return (
              <li key={key} className="guide-card" data-checked={checked}>
                <label className="guide-label">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggle(key, e.currentTarget.checked)}
                  />
                  {title}
                </label>
                {help && <p>{help}</p>}
                <GuideExamples
                  title={title}
                  phrases={phrases}
                  active={active}
                  insertPhrase={insertPhrase}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}

const sosStyles = [
  [Mic, "rose"],
  [MessageCircle, "violet"],
  [CircleHelp, "bleu"],
  [Scale, "ocre"],
  [ArrowRightLeft, "vert"],
  [UsersRound, "indigo"],
  [Radio, "violet"],
  [AudioLines, "rose"],
  [Lightbulb, "ocre"],
  [Music, "bleu"],
];

export function WritingSOS({ close, active, insertPhrase }) {
  const [category, setCategory] = useState(null);
  const [copied, setCopied] = useState(null);
  const openTile = useRef(null);
  const chosen = bank.sos[category];
  function closePhrases() {
    setCategory(null);
    requestAnimationFrame(() => openTile.current?.focus());
  }
  return (
    <>
      <Modal title="SOS rédaction" close={close} className="sos-categories">
        <p>Choisis une catégorie pour trouver des phrases types.</p>
        <div className="sos-grid">
          {bank.sos.map(({ title }, i) => {
            const [Icon, tone] = sosStyles[i];
            return (
              <button
                type="button"
                key={title}
                className="sos-tile"
                data-tone={tone}
                onClick={(e) => {
                  openTile.current = e.currentTarget;
                  setCopied(null);
                  setCategory(i);
                }}
              >
                <span className="sos-tile-icon">
                  <Icon aria-hidden="true" />
                </span>
                <span>{title}</span>
                <ChevronRight
                  className="sos-tile-next"
                  size={16}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      </Modal>
      {chosen && (
        <Modal
          title={chosen.title}
          close={closePhrases}
          className="sos-examples"
        >
          <p>
            {active
              ? "Choisis une phrase à insérer au curseur."
              : "Choisis une phrase à copier."}
          </p>
          <div className="sos-phrases" data-tone={sosStyles[category][1]}>
            {chosen.phrases.map((phrase) => {
              const Icon = active ? Plus : copied === phrase ? Check : Copy;
              return (
                <button
                  type="button"
                  key={phrase}
                  onClick={async () => {
                    if ((await insertPhrase(phrase)) && !active)
                      setCopied(phrase);
                  }}
                >
                  <span>{phrase}</span>
                  <Icon aria-hidden="true" />
                </button>
              );
            })}
          </div>
          <div className="sos-modal-status" role="status">
            {copied && "Phrase copiée."}
          </div>
        </Modal>
      )}
    </>
  );
}
