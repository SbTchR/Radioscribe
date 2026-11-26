import React, { useEffect, useId, useRef } from "react";
import { AudioLines, Sparkles, Wrench, X } from "lucide-react";
import { adjacentModel, models } from "./models.js";
import { loadModel } from "./speech.js";
export function Brand({ onClick }) {
  return (
    <button
      className="brand"
      onClick={onClick}
      aria-label="Radioscribe, accueil"
    >
      <span>
        <AudioLines size={26} />
      </span>
      Radioscribe
    </button>
  );
}
export function Modal({
  title,
  children,
  close,
  wide = false,
  className = "",
}) {
  const ref = useRef(null);
  const heading = useId();
  useEffect(() => {
    const el = ref.current;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "wide " + className : className}
      aria-labelledby={heading}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target !== ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        if (
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        )
          close();
      }}
    >
      <div className="modalhead">
        <h2 id={heading}>{title}</h2>
        <button
          type="button"
          className="icon"
          aria-label="Fermer"
          onClick={close}
        >
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Voice({ name, color }) {
  return (
    <span className="voice" style={{ "--voice": color }}>
      <i />
      {name}
    </span>
  );
}
export function DictationModelControls({ speech }) {
  const lighter = adjacentModel(speech.model, 1);
  const better = adjacentModel(speech.model, -1);
  const disabled = ["permission", "recording", "preview"].includes(
    speech.phase,
  );
  return (
    <>
      {lighter && (
        <button
          type="button"
          className="dictation-fallback"
          title={"Passer au modèle " + models[lighter].label}
          disabled={disabled}
          onClick={() => loadModel(lighter)}
        >
          <Wrench size={15} aria-hidden="true" />
          Transcription trop lente / bug
        </button>
      )}
      {better && (
        <button
          type="button"
          className="dictation-upgrade"
          title={"Passer au modèle " + models[better].label}
          disabled={disabled}
          onClick={() => loadModel(better)}
        >
          <Sparkles size={15} aria-hidden="true" />
          Meilleure transcription (mais plus lente)
        </button>
      )}
      {!lighter && speech.phase === "error" && (
        <button type="button" onClick={() => loadModel()}>
          Recharger le modèle
        </button>
      )}
    </>
  );
}
export const fmtCode = (code) =>
  code.length <= 5 ? code : code.match(/.{1,4}/g).join("-");
