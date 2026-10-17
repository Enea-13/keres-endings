import { memo, type ReactNode } from "react";
import { PIECE_SVG } from "./pieces";

const GLYPH: Record<string, string> = { "♔": "K", "♕": "Q", "♖": "R", "♗": "B", "♘": "N" };
const LETTER_NAME: Record<string, string> = { K: "king", Q: "queen", R: "rook", B: "bishop", N: "knight" };

function Fig({ letter }: { letter: string }) {
  return <img className="fig" src={PIECE_SVG["w" + letter]} alt={LETTER_NAME[letter]} draggable={false} />;
}

/** Text as printed in the book, with ♔♕♖♗♘ drawn as piece figurines. */
export const FigText = memo(function FigText({ text }: { text: string }) {
  if (!/[♔♕♖♗♘]/.test(text)) return <>{text}</>;
  const out: ReactNode[] = [];
  let buf = "";
  [...text].forEach((ch, i) => {
    const letter = GLYPH[ch];
    if (letter) {
      if (buf) out.push(buf);
      buf = "";
      out.push(<Fig key={i} letter={letter} />);
    } else buf += ch;
  });
  if (buf) out.push(buf);
  return <>{out}</>;
});

/** Standard SAN drawn with figurines: "Kd4" -> ♔d4, "b8=Q" -> b8♕. In SAN the capitals
 * K Q R B N only ever name pieces (files are lower-case, castling uses O). */
export const FigSan = memo(function FigSan({ san }: { san: string }) {
  if (san === "--") return <span className="opacity-60">…</span>;
  const out: ReactNode[] = [];
  let buf = "";
  [...san.replace("=", "")].forEach((ch, i) => {
    if (LETTER_NAME[ch]) {
      if (buf) out.push(buf);
      buf = "";
      out.push(<Fig key={i} letter={ch} />);
    } else buf += ch;
  });
  if (buf) out.push(buf);
  return <>{out}</>;
});
