import { makeSquare, makeUci, parseUci, type Move, type Role } from "chessops";
import { Chess } from "chessops/chess";
import { chessgroundDests } from "chessops/compat";
import { makeFen, parseFen } from "chessops/fen";
import { makeSan } from "chessops/san";

export function position(fen: string): Chess | null {
  const setup = parseFen(fen);
  if (setup.isErr) return null;
  const pos = Chess.fromSetup(setup.value);
  return pos.isOk ? pos.value : null; // diagrams without kings are display-only
}

export function dests(fen: string): Map<string, string[]> {
  const pos = position(fen);
  return pos ? (chessgroundDests(pos) as Map<string, string[]>) : new Map();
}

export function isCheck(fen: string): boolean {
  return position(fen)?.isCheck() ?? false;
}

export interface Played {
  uci: string;
  san: string;
  fen: string;
}

/** Play a UCI move; null if illegal. */
export function play(fen: string, uci: string): Played | null {
  const pos = position(fen);
  const move = parseUci(uci);
  if (!pos || !move || !pos.isLegal(move)) return null;
  const san = makeSan(pos, move);
  pos.play(move);
  return { uci: makeUci(move), san, fen: makeFen(pos.toSetup()) };
}

export function isPromotion(fen: string, from: string, to: string): boolean {
  const pos = position(fen);
  if (!pos) return false;
  const move = parseUci(from + to);
  if (!move || !("from" in move)) return false;
  const piece = pos.board.get(move.from);
  const rank = to[1];
  return piece?.role === "pawn" && (rank === "8" || rank === "1");
}

export function uciOf(from: string, to: string, promotion?: Role): string {
  const letter: Partial<Record<Role, string>> = { queen: "q", rook: "r", bishop: "b", knight: "n" };
  return from + to + (promotion ? letter[promotion] ?? "" : "");
}

/** Board placement + side to move: identifies a position regardless of move counters. */
export function positionKey(fen: string): string {
  return fen.split(" ").slice(0, 2).join(" ");
}

export function moveSquares(move: Move): [string, string] | null {
  return "from" in move ? [makeSquare(move.from), makeSquare(move.to)] : null;
}

export type Outcome = { result: "1-0" | "0-1" | "½-½"; reason: string } | null;

/** Game end in the given position (history = previous position keys, for repetition). */
export function outcome(fen: string, history: string[] = []): Outcome {
  const pos = position(fen);
  if (!pos) return null;
  if (pos.isCheckmate())
    return { result: pos.turn === "white" ? "0-1" : "1-0", reason: "checkmate" };
  if (pos.isStalemate()) return { result: "½-½", reason: "stalemate" };
  if (pos.isInsufficientMaterial()) return { result: "½-½", reason: "insufficient material" };
  if (pos.halfmoves >= 100) return { result: "½-½", reason: "fifty-move rule" };
  const key = positionKey(fen);
  if (history.filter((h) => h === key).length >= 2) return { result: "½-½", reason: "threefold repetition" };
  return null;
}
