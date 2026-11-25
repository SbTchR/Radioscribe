import React, { useEffect, useRef } from "react";
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
export function Modal({ title, children, close, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "wide" : ""}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (
          e.target === ref.current &&
          (e.clientX < ref.current.getBoundingClientRect().left ||
            e.clientX > ref.current.getBoundingClientRect().right)
        )
          close();
      }}
    >
      <div className="modalhead">
        <h2>{title}</h2>
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
export const fmtCode = (c) => c.match(/.{1,4}/g).join("-");
