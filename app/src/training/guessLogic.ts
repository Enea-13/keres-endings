import { play, positionKey } from "../chess/util";
import { turnOf, type Color, type SectionIndex } from "../content/tree";

/** Pure state machine for "guess the book's moves". */
export interface GuessState {
  unit: string;
  line: string[]; // book node ids, line[0] = starting position
  pos: number; // index of the position reached
  user: Color; // side the reader plays
  firstTry: number; // user moves found at the first attempt
  attempts: number; // wrong tries on the current move
  mistakes: number;
  hints: number; // hint level used on the current move (0..2)
  hintsUsed: number;
  feedback: Feedback | null;
}

export type Feedback =
  | { kind: "correct"; node: string }
  | { kind: "variation"; node: string } // a move the book discusses, but not the main line
  | { kind: "wrong" }
  | { kind: "revealed"; node: string }
  | { kind: "done" };

/** The book's line to train from `startId`: the unit's main line if the start lies on it,
 * otherwise the continuation that the book gives first. */
export function trainingLine(index: SectionIndex, startId: string): string[] {
  const start = index.get(startId);
  if (!start) return [];
  const main = index.mainLine(start.unit);
  const at = main.indexOf(startId);
  if (at >= 0 && at < main.length - 1) return main.slice(at);
  return index.lineFrom(startId); // off the main line, or no main line marked
}

export function startGuess(index: SectionIndex, startId: string, user?: Color): GuessState {
  const line = trainingLine(index, startId);
  const start = index.get(line[0]);
  return {
    unit: start?.unit ?? "",
    line,
    pos: 0,
    user: user ?? (start ? turnOf(start.fen) : "w"),
    firstTry: 0,
    attempts: 0,
    mistakes: 0,
    hints: 0,
    hintsUsed: 0,
    feedback: null,
  };
}

export function currentNode(s: GuessState): string {
  return s.line[s.pos];
}

export function expectedNode(s: GuessState): string | null {
  return s.line[s.pos + 1] ?? null;
}

export function isDone(s: GuessState): boolean {
  return s.pos >= s.line.length - 1;
}

/** Whose move it is at the current position of the line. */
export function toMove(index: SectionIndex, s: GuessState): Color {
  const node = index.get(currentNode(s));
  return node ? turnOf(node.fen) : "w";
}

/** Number of moves the reader has to find over the whole line. */
export function userMoveCount(index: SectionIndex, s: GuessState): number {
  let n = 0;
  for (let i = 0; i < s.line.length - 1; i++) {
    const node = index.get(s.line[i]);
    const next = index.get(s.line[i + 1]);
    if (node && next && !next.implied && turnOf(node.fen) === s.user) n++;
  }
  return n;
}

/** Judge the reader's move (UCI) at the current position. */
export function guess(index: SectionIndex, s: GuessState, uci: string): GuessState {
  const here = index.get(currentNode(s));
  const want = expectedNode(s);
  if (!here || !want) return s;
  const played = play(here.fen, uci);
  if (!played) return s;
  const key = positionKey(played.fen);
  const match = here.children.find((c) => {
    const n = index.get(c);
    return n && n.san !== "--" && positionKey(n.fen) === key;
  });
  if (match === want) {
    return {
      ...s,
      pos: s.pos + 1,
      firstTry: s.firstTry + (s.attempts === 0 && s.hints === 0 ? 1 : 0),
      attempts: 0,
      hints: 0,
      feedback: { kind: "correct", node: want },
    };
  }
  return {
    ...s,
    attempts: s.attempts + 1,
    mistakes: s.mistakes + 1,
    feedback: match ? { kind: "variation", node: match } : { kind: "wrong" },
  };
}

/** Play the book's reply (or an implied move) for the side the reader is not playing. */
export function autoAdvance(index: SectionIndex, s: GuessState): GuessState {
  if (isDone(s)) return { ...s, feedback: { kind: "done" } };
  const next = index.get(expectedNode(s));
  if (!next) return s;
  if (toMove(index, s) !== s.user || next.implied) return { ...s, pos: s.pos + 1 };
  return s;
}

export function reveal(s: GuessState): GuessState {
  const want = expectedNode(s);
  if (!want) return s;
  return { ...s, pos: s.pos + 1, attempts: 0, hints: 0, mistakes: s.mistakes + 1, feedback: { kind: "revealed", node: want } };
}

export function hint(s: GuessState): GuessState {
  const level = Math.min(2, s.hints + 1);
  return { ...s, hints: level, hintsUsed: s.hintsUsed + (level > s.hints ? 1 : 0) };
}

export function accuracy(index: SectionIndex, s: GuessState): number {
  const total = userMoveCount(index, s);
  return total ? s.firstTry / total : 1;
}
