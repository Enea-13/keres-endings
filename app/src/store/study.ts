import { create } from "zustand";
import { play, positionKey, type Played } from "../chess/util";
import type { SectionIndex } from "../content/tree";

export type Mode = "read" | "guess" | "play";
/** What caused the last navigation; the text scrolls to the active move only for some. */
export type NavReason = "init" | "click" | "key" | "board" | "scroll" | "train";

export interface Scratch {
  base: string; // book node the analysis branches from
  moves: Played[];
  ply: number; // 0..moves.length (0 = at the base node)
}

interface StudyState {
  index: SectionIndex | null;
  sectionId: string | null;
  nodeId: string | null;
  forward: string[]; // remembered continuation for → after stepping back
  scratch: Scratch | null;
  orientation: "white" | "black";
  mode: Mode;
  session: number; // bumps on every mode start, so training panels restart cleanly
  reason: NavReason;
  /** set by training panels: the main board shows this position instead of the book's */
  override: { fen: string; lastMove?: [string, string] | null } | null;

  load: (sectionId: string, index: SectionIndex, nodeId?: string | null) => void;
  goto: (id: string, reason?: NavReason) => void;
  next: (reason?: NavReason) => void;
  prev: (reason?: NavReason) => void;
  first: () => void;
  last: () => void;
  playMove: (uci: string) => void;
  exitScratch: () => void;
  flip: () => void;
  setOrientation: (o: "white" | "black") => void;
  setMode: (m: Mode) => void;
  setOverride: (o: StudyState["override"]) => void;
}

export const useStudy = create<StudyState>()((set, get) => ({
  index: null,
  sectionId: null,
  nodeId: null,
  forward: [],
  scratch: null,
  orientation: "white",
  mode: "read",
  session: 0,
  reason: "init",
  override: null,

  load: (sectionId, index, nodeId) => {
    const start = (nodeId && index.get(nodeId)?.id) || index.stops[0]?.node || null;
    set({
      sectionId,
      index,
      nodeId: start,
      forward: [],
      scratch: null,
      override: null,
      mode: "read",
      reason: "init",
    });
  },

  goto: (id, reason = "click") => {
    const { index, nodeId, forward, mode } = get();
    if (!index || !index.get(id)) return;
    // clicking a move in the text while training goes back to reading at that move
    const leave = mode !== "read" && reason === "click" ? { mode: "read" as Mode, override: null } : {};
    let fwd: string[] = [];
    if (nodeId) {
      const path = index.path(nodeId);
      const at = path.indexOf(id);
      if (at >= 0) fwd = [...path.slice(at + 1), ...forward];
    }
    set({ nodeId: id, forward: fwd, scratch: null, reason, ...leave });
  },

  next: (reason = "key") => {
    const { index, nodeId, forward, scratch } = get();
    if (scratch) {
      if (scratch.ply < scratch.moves.length) set({ scratch: { ...scratch, ply: scratch.ply + 1 }, reason });
      return;
    }
    const node = index?.get(nodeId);
    if (!node || !node.children.length) return;
    if (forward.length && node.children.includes(forward[0])) {
      set({ nodeId: forward[0], forward: forward.slice(1), reason });
    } else {
      set({ nodeId: node.children[0], forward: [], reason });
    }
  },

  prev: (reason = "key") => {
    const { index, nodeId, forward, scratch } = get();
    if (scratch) {
      set(
        scratch.ply > 1
          ? { scratch: { ...scratch, ply: scratch.ply - 1 }, reason }
          : { scratch: null, reason },
      );
      return;
    }
    const node = index?.get(nodeId);
    if (!node?.parent) return;
    set({ nodeId: node.parent, forward: [node.id, ...forward], reason });
  },

  first: () => {
    const { index, nodeId } = get();
    if (!index || !nodeId) return;
    const path = index.path(nodeId);
    set({ nodeId: path[0], forward: path.slice(1), scratch: null, reason: "key" });
  },

  last: () => {
    const { index, nodeId, forward, scratch } = get();
    if (scratch) {
      set({ scratch: { ...scratch, ply: scratch.moves.length }, reason: "key" });
      return;
    }
    if (!index || !nodeId) return;
    let id = nodeId;
    const fwd = [...forward];
    for (;;) {
      const n = index.get(id);
      if (!n || !n.children.length) break;
      id = fwd.length && n.children.includes(fwd[0]) ? fwd.shift()! : n.children[0];
    }
    set({ nodeId: id, forward: [], reason: "key" });
  },

  playMove: (uci) => {
    const { index, nodeId, scratch } = get();
    const node = index?.get(nodeId);
    if (!index || !node) return;
    if (scratch) {
      const here = scratch.ply ? scratch.moves[scratch.ply - 1].fen : node.fen;
      const played = play(here, uci);
      if (!played) return;
      const kept = scratch.moves.slice(0, scratch.ply);
      const same = scratch.moves[scratch.ply]?.uci === played.uci;
      set({
        scratch: { base: scratch.base, moves: same ? scratch.moves : [...kept, played], ply: scratch.ply + 1 },
        reason: "board",
      });
      return;
    }
    const played = play(node.fen, uci);
    if (!played) return;
    const key = positionKey(played.fen);
    const child = node.children.find((c) => {
      const n = index.get(c);
      return n && n.san !== "--" && positionKey(n.fen) === key;
    });
    if (child) {
      set({ nodeId: child, forward: [], reason: "board" });
    } else {
      set({ scratch: { base: node.id, moves: [played], ply: 1 }, reason: "board" });
    }
  },

  exitScratch: () => set({ scratch: null, reason: "click" }),
  flip: () => set((s) => ({ orientation: s.orientation === "white" ? "black" : "white" })),
  setOrientation: (orientation) => set({ orientation }),
  setMode: (mode) => set((s) => ({ mode, scratch: null, override: null, session: s.session + 1 })),
  setOverride: (override) => set({ override }),
}));

/** The position the main board should show right now. */
export function currentFen(s: Pick<StudyState, "index" | "nodeId" | "scratch" | "override">): string | null {
  if (s.override) return s.override.fen;
  if (s.scratch && s.scratch.ply > 0) return s.scratch.moves[s.scratch.ply - 1].fen;
  return s.index?.get(s.nodeId)?.fen ?? null;
}
