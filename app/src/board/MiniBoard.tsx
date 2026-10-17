import { memo } from "react";
import { usePrefs } from "../store/prefs";
import { PIECE_SVG } from "./pieces";
import { BOARD_DATA } from "./themes";

interface Props {
  fen: string; // a full FEN or just the placement
  size?: number;
  className?: string;
  highlight?: [string, string] | null;
}

function parsePlacement(fen: string): { sq: number; piece: string }[] {
  const out: { sq: number; piece: string }[] = [];
  const rows = fen.split(" ")[0].split("/");
  rows.forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += Number(ch);
      else {
        const piece = (ch === ch.toUpperCase() ? "w" : "b") + ch.toUpperCase();
        out.push({ sq: r * 8 + f, piece });
        f++;
      }
    }
  });
  return out;
}

function squareXY(sq: string): [number, number] {
  return [sq.charCodeAt(0) - 97, 8 - Number(sq[1])];
}

/** A static board for diagram thumbnails: one SVG, no event handlers, memoised. */
export const MiniBoard = memo(function MiniBoard({ fen, size, className, highlight }: Props) {
  const style = usePrefs((s) => s.board);
  const pieces = parsePlacement(fen);
  return (
    <svg
      viewBox="0 0 8 8"
      width={size}
      height={size}
      className={`block rounded-[3px] ${className ?? ""}`}
      role="img"
      aria-label="Chess diagram"
    >
      <image href={BOARD_DATA[style]} width="8" height="8" preserveAspectRatio="none" />
      {highlight?.map((s) => {
        const [x, y] = squareXY(s);
        return <rect key={s} x={x} y={y} width="1" height="1" fill="var(--last-move)" />;
      })}
      {pieces.map(({ sq, piece }) => (
        <image key={sq} href={PIECE_SVG[piece]} x={sq % 8} y={Math.floor(sq / 8)} width="1" height="1" />
      ))}
    </svg>
  );
});
