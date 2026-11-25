import React, { useEffect, useId, useRef } from "react";
import { AudioLines, X } from "lucide-react";
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
export const fmtCode = (code) =>
  code.length <= 5 ? code : code.match(/.{1,4}/g).join("-");
