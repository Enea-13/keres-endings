import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { DrawShape } from "chessground/draw";
import type { Key } from "chessground/types";
import type { Role } from "chessops";
import { useEffect, useRef, useState } from "react";
import { dests, isCheck, isPromotion, uciOf } from "../chess/util";
import { usePrefs } from "../store/prefs";
import { PIECE_SVG } from "./pieces";
import { BOARD_IMAGES } from "./themes";

export interface BoardProps {
  fen: string;
  orientation: "white" | "black";
  lastMove?: [string, string] | null;
  /** which side the user may move; "turn" = whoever is to move; null = view only */
  movable?: "white" | "black" | "turn" | null;
  onMove?: (uci: string) => void;
  shapes?: DrawShape[];
  className?: string;
  /** bump to snap the board back to `fen` after a rejected move */
  nonce?: number;
}

const PROMOTIONS: Role[] = ["queen", "knight", "rook", "bishop"];

/**
 * Chessground wrapper. Chessground owns its DOM; React only pushes config changes into it
 * with `api.set`, so stepping through a line never re-renders the board's squares.
 */
export function Board({ fen, orientation, lastMove, movable = "turn", onMove, shapes, className, nonce }: BoardProps) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const onMoveRef = useRef(onMove);
  const fenRef = useRef(fen);
  const [promo, setPromo] = useState<{ from: string; to: string; color: "white" | "black" } | null>(null);
  const style = usePrefs((s) => s.board);
  const coordinates = usePrefs((s) => s.coordinates);
  onMoveRef.current = onMove;
  fenRef.current = fen;

  useEffect(() => {
    if (!el.current) return;
    // start from the real position: otherwise chessground would animate in from the
    // standard opening setup on the first update
    const turn0 = fenRef.current.split(" ")[1] === "b" ? "black" : "white";
    const cg = Chessground(el.current, {
      fen: fenRef.current,
      orientation,
      turnColor: turn0,
      coordinates,
      animation: { enabled: true, duration: 220 },
      highlight: { lastMove: true, check: true },
      premovable: { enabled: false },
      draggable: { showGhost: true },
      drawable: { enabled: true, visible: true },
      movable: {
        free: false,
        showDests: true,
        events: {
          after: (orig, dest) => {
            const turn = fenRef.current.split(" ")[1] === "b" ? "black" : "white";
            if (isPromotion(fenRef.current, orig, dest)) setPromo({ from: orig, to: dest, color: turn });
            else onMoveRef.current?.(uciOf(orig, dest));
          },
        },
      },
    });
    api.current = cg;
    let frame = 0;
    let width = 0;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w === width) return;
      width = w;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => cg.redrawAll());
    });
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      cg.destroy();
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.current?.set({ coordinates });
    api.current?.redrawAll();
  }, [coordinates]);

  useEffect(() => {
    const cg = api.current;
    if (!cg) return;
    const turn = fen.split(" ")[1] === "b" ? "black" : "white";
    const canMove = movable === "turn" ? turn : movable === turn ? turn : undefined;
    cg.set({
      fen,
      orientation,
      turnColor: turn,
      lastMove: (lastMove ?? undefined) as Key[] | undefined,
      check: isCheck(fen) ? turn : false,
      movable: { color: canMove, dests: canMove ? (dests(fen) as Map<Key, Key[]>) : new Map() },
    });
    setPromo(null);
  }, [fen, orientation, lastMove, movable, nonce]);

  useEffect(() => {
    api.current?.setAutoShapes(shapes ?? []);
  }, [shapes]);

  const choose = (role: Role | null) => {
    const p = promo;
    setPromo(null);
    if (!p) return;
    if (role) onMoveRef.current?.(uciOf(p.from, p.to, role));
    else api.current?.set({ fen: fenRef.current });
  };

  const file = promo ? promo.to.charCodeAt(0) - 97 : 0;
  const left = promo ? (orientation === "white" ? file : 7 - file) * 12.5 : 0;
  const fromTop = promo ? (promo.to[1] === "8") === (orientation === "white") : true;

  return (
    <div
      className={`board board-${style} relative aspect-square w-full select-none ${className ?? ""}`}
      style={{ ["--board-image" as string]: BOARD_IMAGES[style] }}
    >
      <div ref={el} style={{ width: "100%", height: "100%" }} />
      {promo && (
        <div className="absolute inset-0 z-20 bg-black/30" onClick={() => choose(null)}>
          <div
            className="absolute flex w-[12.5%] flex-col overflow-hidden rounded-md shadow-2xl"
            style={{ left: `${left}%`, [fromTop ? "top" : "bottom"]: 0 }}
          >
            {PROMOTIONS.map((role) => (
              <button
                key={role}
                className="aspect-square bg-[var(--paper)] p-[8%] hover:bg-[var(--accent-soft)]"
                onClick={(e) => {
                  e.stopPropagation();
                  choose(role);
                }}
                aria-label={`Promote to ${role}`}
              >
                <img
                  alt=""
                  src={PIECE_SVG[(promo.color === "white" ? "w" : "b") + roleLetter(role)]}
                  className="h-full w-full"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function roleLetter(role: Role): string {
  return { queen: "Q", knight: "N", rook: "R", bishop: "B", king: "K", pawn: "P" }[role];
}
