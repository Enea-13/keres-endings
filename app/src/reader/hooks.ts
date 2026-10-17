import { useEffect, useRef, type RefObject } from "react";
import { tap } from "../board/sound";
import type { SectionIndex } from "../content/tree";
import { usePrefs } from "../store/prefs";
import { useStudy } from "../store/study";
import { useStopNav } from "./ReadPanel";

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
}

/** ← → step through the line, ↑ ↓ jump between diagrams, Home/End, F flips, Esc leaves analysis. */
export function useKeyboard(index: SectionIndex | null, enabled: boolean) {
  const nav = useStopNav(index ?? (null as unknown as SectionIndex));
  useEffect(() => {
    if (!index || !enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const s = useStudy.getState();
      const actions: Record<string, () => void> = {
        ArrowRight: () => s.next("key"),
        ArrowLeft: () => s.prev("key"),
        ArrowUp: nav.up,
        ArrowDown: nav.down,
        Home: s.first,
        End: s.last,
        f: s.flip,
        F: s.flip,
        Escape: s.exitScratch,
      };
      const act = actions[e.key];
      if (act) {
        e.preventDefault();
        act();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, enabled, nav]);
}

/**
 * Keeps the text and the board together:
 *  - stepping with the keys or the board scrolls the active move into view;
 *  - scrolling the text past a diagram loads it on the board ("board follows reading").
 */
export function useTextSync(index: SectionIndex | null, scroller: RefObject<HTMLElement | null>) {
  const quietUntil = useRef(0);
  const follow = usePrefs((s) => s.followReading);

  // board -> text
  useEffect(() => {
    if (!index) return;
    return useStudy.subscribe((s, prev) => {
      if (s.nodeId === prev.nodeId || !s.nodeId || s.mode !== "read") return;
      if (!["key", "board", "init"].includes(s.reason)) return;
      const root = scroller.current;
      if (!root) return;
      const chip = index.chipFor(s.nodeId);
      let el: Element | null = chip ? root.querySelector(`[data-node="${CSS.escape(chip)}"]`) : null;
      if (!el) {
        const stop = index.stops[index.stopIndexFor(s.nodeId)];
        if (stop) el = root.querySelector(`[data-stop="${stop.block}"]`);
      }
      if (!el) return;
      const r = el.getBoundingClientRect();
      const box = root.getBoundingClientRect();
      if (r.top < box.top + 40 || r.bottom > box.bottom - 40) {
        quietUntil.current = performance.now() + 900;
        el.scrollIntoView({ block: "center", behavior: s.reason === "init" ? "auto" : "smooth" });
      }
    });
  }, [index, scroller]);

  // text -> board
  useEffect(() => {
    const root = scroller.current;
    if (!index || !root || !follow) return;
    let userScrolled = 0;
    const mark = () => (userScrolled = performance.now());
    root.addEventListener("wheel", mark, { passive: true });
    root.addEventListener("touchmove", mark, { passive: true });
    root.addEventListener("keydown", mark);
    const io = new IntersectionObserver(
      (entries) => {
        const now = performance.now();
        if (now < quietUntil.current || now - userScrolled > 1200) return;
        const s = useStudy.getState();
        if (s.mode !== "read" || s.scratch) return;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const target = (e.target as HTMLElement).dataset.nodeTarget;
          const node = index.get(target);
          const cur = index.get(s.nodeId);
          if (node && cur?.unit !== node.unit && s.nodeId !== node.id) s.goto(node.id, "scroll");
        }
      },
      { root, rootMargin: "-25% 0px -55% 0px", threshold: 0 },
    );
    root.querySelectorAll("[data-stop]").forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      root.removeEventListener("wheel", mark);
      root.removeEventListener("touchmove", mark);
      root.removeEventListener("keydown", mark);
    };
  }, [index, scroller, follow]);
}

/** Move sound and "diagram studied" bookkeeping. */
export function useBoardSideEffects(index: SectionIndex | null) {
  useEffect(() => {
    if (!index) return;
    return useStudy.subscribe((s, prev) => {
      const moved = s.nodeId !== prev.nodeId || s.scratch?.ply !== prev.scratch?.ply;
      if (!moved) return;
      const prefs = usePrefs.getState();
      const node = index.get(s.nodeId);
      if (prefs.sound && s.reason !== "init" && s.reason !== "scroll") {
        const san = s.scratch?.ply ? s.scratch.moves[s.scratch.ply - 1].san : node?.san ?? "";
        if (san && san !== "--") tap(san.includes("x") ? "capture" : "move");
      }
      if (node) {
        const stop = index.stops[index.stopIndexFor(node.id)];
        if (stop) prefs.markStudied(stop.n);
        if (s.sectionId) prefs.setLast(s.sectionId, node.id);
      }
    });
  }, [index]);
}
