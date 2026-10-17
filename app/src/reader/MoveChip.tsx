import { createContext, memo, useContext } from "react";
import { FigText } from "../board/Figurine";
import { useStudy } from "../store/study";

/** Guess mode hides moves the reader has not reached yet. */
export const MaskContext = createContext<((nodeId: string) => boolean) | null>(null);

interface Props {
  id: string;
  text: string;
  bold?: boolean;
}

/** A move printed in the text. Only the chip that becomes active (and the one that stops
 * being active) re-renders when the board moves, thanks to the narrow store selector. */
export const MoveChip = memo(function MoveChip({ id, text, bold }: Props) {
  const active = useStudy((s) => s.nodeId === id && !s.scratch && !s.override);
  const goto = useStudy((s) => s.goto);
  const masked = useContext(MaskContext)?.(id) ?? false;
  if (masked)
    return (
      <span className="mv mv-masked" aria-label="hidden move">
        •••
      </span>
    );
  return (
    <button
      type="button"
      data-node={id}
      className={`mv${bold ? " mv-bold" : ""}${active ? " mv-active" : ""}`}
      onClick={() => goto(id, "click")}
    >
      <FigText text={text} />
    </button>
  );
});

/** Notation the pipeline could not tie to a position (hypothetical or modified positions). */
export function DeadMove({ text, bold }: { text: string; bold?: boolean }) {
  return (
    <span className={`mv-dead${bold ? " font-semibold" : ""}`} title="Not linked to a board position">
      <FigText text={text} />
    </span>
  );
}
