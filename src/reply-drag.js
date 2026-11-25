import { useEffect, useRef, useState } from "react";

// Use the visible cards to place a marker between replies. The saved move uses
// the neighboring reply's ID, so unrelated edits do not invalidate the index.
function placement(list, source, x, y) {
  if (!list) return null;
  const bounds = list.getBoundingClientRect();
  if (x < bounds.left - 30 || x > bounds.right + 30) return null;
  if (y < bounds.top - 60 || y > bounds.bottom + 60) return null;
  let last;
  for (const card of list.children) {
    const id = card.dataset.reply;
    if (id === source) continue;
    const rect = card.getBoundingClientRect();
    if (y < rect.top + rect.height / 2) return { id, edge: "before" };
    last = id;
  }
  return last ? { id: last, edge: "after" } : null;
}

export function useReplyDrag(list, sectionId, moveReply) {
  const gesture = useRef(null);
  const [indicator, setIndicator] = useState(null);

  function release() {
    const current = gesture.current;
    gesture.current = null;
    if (!current) return;
    cancelAnimationFrame(current.frame);
    if (current.handle.hasPointerCapture(current.pointer)) {
      current.handle.releasePointerCapture(current.pointer);
    }
  }

  useEffect(() => {
    setIndicator(null);
    return release;
  }, [sectionId]);

  function refresh(current) {
    const drop = placement(list.current, current.id, current.x, current.y);
    setIndicator((previous) =>
      previous?.source === current.id &&
      previous.drop?.id === drop?.id &&
      previous.drop?.edge === drop?.edge
        ? previous
        : { source: current.id, drop },
    );
  }

  function scrollAtEdge(current) {
    if (gesture.current !== current) return;
    const bounds = list.current?.getBoundingClientRect();
    if (
      bounds &&
      current.x >= bounds.left - 30 &&
      current.x <= bounds.right + 30
    ) {
      const edge = 68;
      const delta =
        Math.max(0, current.y - (window.innerHeight - edge)) -
        Math.max(0, edge - current.y);
      if (delta) {
        window.scrollBy(0, delta * 0.16);
        refresh(current);
      }
    }
    current.frame = requestAnimationFrame(() => scrollAtEdge(current));
  }

  function finish(e, dropped) {
    const current = gesture.current;
    if (!current || current.pointer !== e.pointerId) return;
    const drop =
      dropped && current.started
        ? placement(list.current, current.id, e.clientX, e.clientY)
        : null;
    release();
    setIndicator(null);
    if (drop) moveReply(current.id, drop.id, drop.edge);
  }

  return {
    indicator,
    handle: (id) => ({
      onPointerDown(e) {
        if (!e.isPrimary || e.button !== 0 || gesture.current) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        gesture.current = {
          id,
          handle: e.currentTarget,
          pointer: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
        };
      },
      onPointerMove(e) {
        const current = gesture.current;
        if (!current || e.pointerId !== current.pointer) return;
        current.x = e.clientX;
        current.y = e.clientY;
        if (!current.started) {
          if (
            Math.hypot(current.x - current.startX, current.y - current.startY) <
            6
          )
            return;
          current.started = true;
          current.frame = requestAnimationFrame(() => scrollAtEdge(current));
        }
        refresh(current);
      },
      onPointerUp: (e) => finish(e, true),
      onPointerCancel: (e) => finish(e, false),
      onLostPointerCapture: (e) => finish(e, false),
      onKeyDown(e) {
        if (e.key === "Escape" && gesture.current) {
          release();
          setIndicator(null);
          return;
        }
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        const card = e.currentTarget.closest("[data-reply]");
        const previous = e.key === "ArrowUp";
        const neighbor = previous
          ? card.previousElementSibling
          : card.nextElementSibling;
        if (neighbor)
          moveReply(
            id,
            neighbor.dataset.reply,
            previous ? "before" : "after",
            e.currentTarget,
          );
      },
    }),
  };
}
