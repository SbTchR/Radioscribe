import React from "react";
import { Clock3, Minimize } from "lucide-react";
import { time } from "./domain.js";

const highlightOptions = [
  ["", "Tout"],
  ["animation", "Animations"],
  ["chronicle", "Chroniques"],
  ["music", "Musiques"],
  ["jingle", "Jingles"],
];

export function cueGroup(kind) {
  return ["opening", "transition", "closing"].includes(kind)
    ? "animation"
    : kind;
}

export function cueHighlight(item, highlight) {
  return highlight
    ? cueGroup(item.kind) === highlight
      ? "active"
      : "muted"
    : undefined;
}

function cueDetail(item) {
  const title = item.title === item.baseTitle ? "" : item.title;
  if (item.kind !== "music") return title;
  if (!title) return item.artist || "";
  return item.artist
    ? "« " + title + " » de " + item.artist
    : "« " + title + " »";
}

export function cueLabel(item) {
  const detail = cueDetail(item);
  return item.baseTitle + (detail ? " : " + detail : "");
}

export function CueName({ item }) {
  const detail = cueDetail(item);
  return (
    <span>
      <span className="cue-base">{item.baseTitle}</span>
      {detail && " : " + detail}
    </span>
  );
}

export function cueTeam(item) {
  return item.room
    ? item.assigned
      ? item.names.join(", ")
      : "Équipe à attribuer"
    : "";
}

export function ProgramDuration({ seconds, untimed }) {
  return (
    <p className="program-duration">
      <Clock3 size={17} aria-hidden="true" />
      <span>
        <strong>{time(seconds)}</strong> prévues
      </span>
      {untimed > 0 && (
        <span>
          · {untimed}{" "}
          {untimed === 1 ? "durée à compléter" : "durées à compléter"}
        </span>
      )}
    </p>
  );
}

export function ProgramHighlight({ items, highlight, onHighlight }) {
  const groups = new Set(items.map((item) => cueGroup(item.kind)));
  return (
    <div
      className="program-highlight"
      role="group"
      aria-label="Mettre en évidence"
    >
      <span className="program-highlight-label">Mettre en évidence</span>
      <div className="program-highlight-options">
        {highlightOptions.map(([group, label]) => (
          <button
            key={label}
            type="button"
            data-group={group}
            aria-pressed={highlight === group}
            disabled={!!group && !groups.has(group)}
            onClick={() => onHighlight(group)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ProgramProjection({
  title,
  items,
  seconds,
  untimed,
  highlight,
  onHighlight,
  viewport,
  close,
}) {
  const columns = Math.min(3, Math.ceil(items.length / 9));
  return (
    <main className="program-projection" aria-labelledby="projection-title">
      <header className="projection-head">
        <div>
          <p className="projection-caption">Conducteur de l’émission</p>
          <h1 id="projection-title">{title}</h1>
          <ProgramDuration seconds={seconds} untimed={untimed} />
        </div>
        <button type="button" onClick={close}>
          <Minimize aria-hidden="true" /> Quitter la projection
        </button>
      </header>
      <ProgramHighlight
        items={items}
        highlight={highlight}
        onHighlight={onHighlight}
      />
      <div
        className="projection-scroll"
        ref={viewport}
        tabIndex={0}
        role="region"
        aria-label="Ordre des parties"
      >
        {items.length ? (
          <ol
            className="projection-list"
            role="list"
            style={{ "--projection-columns": columns }}
          >
            {items.map((item, index) => (
              <li
                key={item.id}
                className="projection-cue"
                data-group={cueGroup(item.kind)}
                data-highlight={cueHighlight(item, highlight)}
              >
                <span className="projection-number">{index + 1}</span>
                <div className="projection-name">
                  <strong>
                    <CueName item={item} />
                  </strong>
                  {item.room && (
                    <span className="projection-team">{cueTeam(item)}</span>
                  )}
                </div>
                <span className="projection-time">
                  {item.seconds ? time(item.seconds) : "À préciser"}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p>Le conducteur est vide.</p>
        )}
      </div>
    </main>
  );
}

export function PrintedProgram({ title, items, seconds, untimed, highlight }) {
  return (
    <article className="program-print" aria-labelledby="program-print-title">
      <header>
        <p>Conducteur de l’émission</p>
        <h1 id="program-print-title">{title}</h1>
        <ProgramDuration seconds={seconds} untimed={untimed} />
      </header>
      {items.length ? (
        <table aria-label="Ordre des parties de l’émission">
          <colgroup>
            <col className="print-order" />
            <col />
            <col className="print-team" />
            <col className="print-time" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">N°</th>
              <th scope="col">Partie</th>
              <th scope="col">Équipe</th>
              <th scope="col">Durée prévue</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const detail = cueDetail(item);
              return (
                <tr
                  key={item.id}
                  data-highlight={cueHighlight(item, highlight)}
                >
                  <td>{index + 1}</td>
                  <th scope="row">
                    <strong>{item.baseTitle}</strong>
                    {detail && <span>{detail}</span>}
                  </th>
                  <td>{cueTeam(item)}</td>
                  <td>{item.seconds ? time(item.seconds) : "À préciser"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p>Le conducteur est vide.</p>
      )}
    </article>
  );
}
