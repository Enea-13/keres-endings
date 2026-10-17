import { makeSquare, parseUci } from "chessops";
import { Chess } from "chessops/chess";
import { parseFen } from "chessops/fen";
import { parseSan } from "chessops/san";
import type { Block, Section, Unit } from "./types";

export type Color = "w" | "b";

export interface BookNode {
  id: string;
  unit: string;
  parent: string | null;
  children: string[];
  san: string; // "" for a root, "--" for an implied (unnamed) move
  annot: string;
  fen: string;
  main: boolean;
  implied: boolean;
  isRoot: boolean;
  isAlt: boolean; // the diagram with the other side to move
  ply: number; // half-moves from the unit's root
  moveNo: number; // number of the move that led here
  color: Color; // side that made that move
}

/** A place the reader can jump to with ↑/↓: each diagram (or each half of a split one). */
export interface Stop {
  n: number;
  label: string | null;
  node: string;
  block: number;
}

export function turnOf(fen: string): Color {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

export function fullmoveOf(fen: string): number {
  return Number(fen.split(" ")[5] ?? 1) || 1;
}

export class SectionIndex {
  readonly nodes = new Map<string, BookNode>();
  readonly units = new Map<string, Unit>();
  readonly stops: Stop[] = [];
  /** First block index whose text shows a move of this node. */
  readonly chipBlock = new Map<string, number>();
  /** Block range [start, end) belonging to a unit opened in this section. */
  readonly unitSpan = new Map<string, [number, number]>();
  readonly blocks: Block[];

  constructor(section: Section) {
    this.blocks = section.blocks;
    for (const unit of Object.values(section.units)) {
      this.units.set(unit.id, unit);
      this.addUnit(unit);
    }
    let open: string[] = [];
    section.blocks.forEach((b, i) => {
      if (b.type === "diagram") {
        if (b.node) {
          this.stops.push({ n: b.n, label: null, node: b.node, block: i });
        } else if (b.units) {
          for (const u of open) this.closeSpan(u, i);
          open = [];
          for (const u of b.units) {
            const unit = this.units.get(u.id);
            if (!unit) continue;
            this.stops.push({ n: b.n, label: u.label, node: unit.root, block: i });
            this.unitSpan.set(u.id, [i, section.blocks.length]);
            open.push(u.id);
          }
        }
      } else if (b.type === "p") {
        for (const r of b.runs) if (r.m && !this.chipBlock.has(r.m)) this.chipBlock.set(r.m, i);
      } else if (b.type === "rows") {
        for (const row of b.rows)
          for (const c of [row.w, row.b])
            if (c?.m && !this.chipBlock.has(c.m)) this.chipBlock.set(c.m, i);
      }
    });
  }

  /** Blocks printing a unit's moves, for units without a diagram of their own. */
  spanOf(unitId: string): [number, number] {
    const span = this.unitSpan.get(unitId);
    if (span) return span;
    let lo = Infinity;
    let hi = -1;
    for (const [id, block] of this.chipBlock) {
      if (this.nodes.get(id)?.unit !== unitId) continue;
      lo = Math.min(lo, block);
      hi = Math.max(hi, block);
    }
    return hi < 0 ? [0, this.blocks.length] : [lo, hi + 1];
  }

  private closeSpan(unit: string, end: number) {
    const span = this.unitSpan.get(unit);
    if (span) span[1] = end;
  }

  private addUnit(unit: Unit) {
    const visit = (id: string, ply: number, isAlt: boolean) => {
      const raw = unit.nodes[id];
      if (!raw) return;
      const parent = raw.p ? this.nodes.get(raw.p) : undefined;
      this.nodes.set(id, {
        id,
        unit: unit.id,
        parent: raw.p ?? null,
        children: raw.c,
        san: raw.s ?? "",
        annot: raw.a ?? "",
        fen: raw.f,
        main: !!raw.m,
        implied: raw.s === "--" || !!raw.i,
        isRoot: !raw.p,
        isAlt,
        ply,
        moveNo: parent ? fullmoveOf(parent.fen) : 0,
        color: parent ? turnOf(parent.fen) : "w",
      });
      for (const c of raw.c) visit(c, ply + 1, isAlt);
    };
    visit(unit.root, 0, false);
    if (unit.alt) visit(unit.alt, 0, true);
  }

  get(id: string | null | undefined): BookNode | undefined {
    return id ? this.nodes.get(id) : undefined;
  }

  /** Node ids from the root to `id` (inclusive). */
  path(id: string): string[] {
    const out: string[] = [];
    let n = this.nodes.get(id);
    while (n) {
      out.push(n.id);
      n = n.parent ? this.nodes.get(n.parent) : undefined;
    }
    return out.reverse();
  }

  /** `id` followed by its first-child continuation to the end of the line. */
  lineFrom(id: string): string[] {
    const out = [id];
    let n = this.nodes.get(id);
    while (n && n.children.length) {
      out.push(n.children[0]);
      n = this.nodes.get(n.children[0]);
    }
    return out;
  }

  /** The main line of a unit: the root (or alt root) that carries it, then its main children. */
  mainLine(unitId: string): string[] {
    const unit = this.units.get(unitId);
    if (!unit) return [];
    const start =
      unit.alt && !this.nodes.get(unit.root)?.children.some((c) => this.nodes.get(c)?.main)
        ? unit.alt
        : unit.root;
    const out = [start];
    let n = this.nodes.get(start);
    while (n) {
      const next = n.children.find((c) => this.nodes.get(c)?.main);
      if (!next) break;
      out.push(next);
      n = this.nodes.get(next);
    }
    return out;
  }

  stopIndexFor(nodeId: string): number {
    const node = this.nodes.get(nodeId);
    if (!node) return -1;
    const unit = this.units.get(node.unit);
    if (unit?.note) return this.stops.findIndex((s) => s.n === unit.n); // the diagram it came from
    // the last stop at or before this node on its line, else the unit's own diagram
    const path = new Set(this.path(nodeId));
    let best = -1;
    this.stops.forEach((s, i) => {
      if (path.has(s.node)) best = i;
    });
    if (best >= 0) return best;
    return this.stops.findIndex((s) => this.nodes.get(s.node)?.unit === node.unit);
  }

  /** Nearest node on the path (self first) that has a chip in the text. */
  chipFor(nodeId: string): string | null {
    const path = this.path(nodeId);
    for (let i = path.length - 1; i >= 0; i--) if (this.chipBlock.has(path[i])) return path[i];
    return null;
  }
}

const squaresMemo = new Map<string, [string, string] | null>();

/** From/to squares of the move that led to `node`, for last-move highlighting. */
export function lastMoveSquares(index: SectionIndex, node: BookNode): [string, string] | null {
  if (!node.parent || node.implied) return null;
  const memo = squaresMemo.get(node.id);
  if (memo !== undefined) return memo;
  const parent = index.get(node.parent);
  let out: [string, string] | null = null;
  if (parent) {
    const pos = Chess.fromSetup(parseFen(parent.fen).unwrap());
    if (pos.isOk) {
      const move = parseSan(pos.value, node.san);
      if (move && "from" in move) out = [makeSquare(move.from), makeSquare(move.to)];
    }
  }
  squaresMemo.set(node.id, out);
  return out;
}

export function uciSquares(uci: string): [string, string] | null {
  const m = parseUci(uci);
  return m && "from" in m ? [makeSquare(m.from), makeSquare(m.to)] : null;
}

/** "12." for a White move, "12…" for Black. */
export function moveNumberLabel(node: Pick<BookNode, "moveNo" | "color">): string {
  return node.color === "w" ? `${node.moveNo}.` : `${node.moveNo}…`;
}
