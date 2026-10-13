"use client";

import { useEffect, useRef } from "react";

interface Props {
  onTap: (kind: string, id: string) => void;
  onDrop: (kind: string, id: string, zone: string) => void;
}

/**
 * Tap and drag, both always on. Elements opt in with data-drag="kind:id" and
 * drop zones with data-drop="zone". A press that barely moves is a tap.
 */
export function DragLayer({ onTap, onDrop }: Props) {
  const handlers = useRef({ onTap, onDrop });
  useEffect(() => {
    handlers.current = { onTap, onDrop };
  });

  useEffect(() => {
    let drag: { el: HTMLElement; x: number; y: number; moved: boolean; ghost: HTMLElement | null } | null = null;

    const clearHighlights = () => document.querySelectorAll(".drop-on").forEach((n) => n.classList.remove("drop-on"));
    const zoneAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop]") ?? null;

    const down = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>("[data-drag]");
      if (el) drag = { el, x: e.clientX, y: e.clientY, moved: false, ghost: null };
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) {
        drag.moved = true;
        const ghost = document.createElement("div");
        ghost.className = "drag-ghost";
        ghost.innerHTML = drag.el.querySelector("img")?.outerHTML ?? "";
        document.body.appendChild(ghost);
        drag.ghost = ghost;
      }
      if (drag.moved && drag.ghost) {
        drag.ghost.style.left = `${e.clientX}px`;
        drag.ghost.style.top = `${e.clientY}px`;
        clearHighlights();
        zoneAt(e.clientX, e.clientY)?.classList.add("drop-on");
      }
    };
    const end = (e: PointerEvent, cancel: boolean) => {
      if (!drag) return;
      const [kind, id] = (drag.el.dataset.drag ?? "").split(":");
      drag.ghost?.remove();
      clearHighlights();
      if (!cancel) {
        if (!drag.moved) handlers.current.onTap(kind, id);
        else {
          const zone = zoneAt(e.clientX, e.clientY)?.dataset.drop;
          if (zone) handlers.current.onDrop(kind, id, zone);
        }
      }
      drag = null;
    };
    const up = (e: PointerEvent) => end(e, false);
    const cancel = (e: PointerEvent) => end(e, true);

    document.addEventListener("pointerdown", down);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", cancel);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", cancel);
      document.querySelectorAll(".drag-ghost").forEach((n) => n.remove());
    };
  }, []);

  return null;
}
