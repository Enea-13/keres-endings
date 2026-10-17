// Shapes of the JSON written by pipeline/build.py.

export interface TocEntry {
  id: string;
  title: string;
  level: number; // 1 chapter/front matter, 2 section, 3 "A:" sub-section, 4 "a)" sub-sub
  page: number;
  diagrams: [number, number] | null; // first and last diagram number in this section
  count: number;
  children: TocEntry[];
}

export interface Toc {
  title: string;
  author: string;
  toc: TocEntry[];
  order: string[]; // section ids in reading order
}

/** A run of text in a paragraph. Exactly one of the optional keys identifies the kind. */
export interface Run {
  t: string;
  b?: 1;
  i?: 1;
  m?: string; // move -> node id
  x?: 1; // notation the pipeline could not attach to a position
  d?: number; // "diagram N" reference
}

export interface RowCell {
  t: string;
  m?: string;
  x?: 1;
  after?: string;
}

export interface Row {
  n: number;
  w?: RowCell | null; // null = "..."
  b?: RowCell | null;
}

export type Block =
  | { type: "p"; runs: Run[]; page: number; align?: "center" }
  | {
      type: "diagram";
      n: number;
      page: number;
      units?: { id: string; label: "left" | "right" | "top" | "bottom" | null }[];
      node?: string; // checkpoint: the diagram shows this position in a line
      printed?: string; // book's diagram differs from the line (misprint)
      caption?: Run[][];
    }
  | { type: "rows"; rows: Row[]; page: number };

export interface RawNode {
  f: string; // FEN after the move
  c: string[]; // children, main line first
  p?: string; // parent
  s?: string; // SAN
  a?: string; // annotation (!, ?, ...)
  m?: 1; // main line
  i?: 1; // implied: a forced reply the text leaves out ("8 ♕f8+ followed by 9 ♕g7+")
}

export interface Unit {
  id: string;
  n: number;
  label: string | null;
  section: string;
  root: string;
  alt: string | null; // same diagram with the other side to move
  nodes: Record<string, RawNode>;
  /** set for a hypothetical position the text describes ("with the white king on f2");
   * `n` is then the diagram it was built from */
  note?: string;
}

export interface Section {
  id: string;
  title: string;
  level: number;
  page: number;
  blocks: Block[];
  units: Record<string, Unit>;
  prev: string | null;
  next: string | null;
}

export interface QaData {
  diagrams: {
    n: number;
    section: string | null;
    status: string;
    positions: { id: string; label: string | null; placement: string; issues: string[] }[];
    weak: { sq: string; label: string; alt: string; margin: number }[];
  }[];
  failed: { section: string; page: number; text: string; unit: string }[];
  partial: { section: string; page: number; text: string; unit: string }[];
  misprints: { n: number; node: string; printed: string; line: string }[];
  how: Record<string, number>;
  moves: { total: number; anchored: number };
}
