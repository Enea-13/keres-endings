import type { DrawShape } from "chessground/draw";
import type { Key } from "chessground/types";
import { useMemo, useState } from "react";
import { Board } from "../board/Board";
import { FigSan } from "../board/Figurine";
import { lastMoveSquares, moveNumberLabel, turnOf, uciSquares, type SectionIndex } from "../content/tree";
import { currentFen, useStudy } from "../store/study";
import { IconArrows, IconDown, IconFirst, IconFlip, IconLast, IconNext, IconPrev, IconUp } from "../ui/icons";
import { MoveTree } from "./MoveTree";

export function useStopNav(index: SectionIndex) {
  const goto = useStudy((s) => s.goto);
  return {
    up: () => {
      const id = useStudy.getState().nodeId;
      if (!id) return;
      const i = index.stopIndexFor(id);
      const stop = index.stops[i];
      if (stop && stop.node !== id) goto(stop.node, "key");
      else if (i > 0) goto(index.stops[i - 1].node, "key");
    },
    down: () => {
      const id = useStudy.getState().nodeId;
      const i = id ? index.stopIndexFor(id) : -1;
      const stop = index.stops[i + 1];
      if (stop) goto(stop.node, "key");
    },
  };
}

/** Caption above the board: which diagram, which move, who is to move. */
function PositionCaption({ index }: { index: SectionIndex }) {
  const nodeId = useStudy((s) => s.nodeId);
  const scratch = useStudy((s) => s.scratch);
  const fen = useStudy(currentFen);
  const node = index.get(nodeId);
  const stop = nodeId ? index.stops[index.stopIndexFor(nodeId)] : undefined;
  if (!node || !fen) return null;
  const note = index.units.get(node.unit)?.note;
  const turn = turnOf(fen) === "w" ? "White" : "Black";
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <div className="min-w-0 truncate" title={note}>
        {note ? (
          <>
            <span className="smallcaps mr-2 text-[var(--amber)]">Hypothetical</span>
            <span className="mr-2 italic">{note}</span>
          </>
        ) : (
          stop && <span className="smallcaps mr-2 text-[var(--accent)]">Diagram {stop.n}</span>
        )}
        {scratch ? (
          <span className="italic text-[var(--ink-soft)]">your analysis</span>
        ) : node.isRoot ? (
          <span className="text-[var(--ink-soft)]">{node.isAlt ? "same position, other side to move" : "starting position"}</span>
        ) : (
          <span className="text-[var(--ink-soft)]">
            after {moveNumberLabel(node)}
            <FigSan san={node.san} />
            {node.annot}
          </span>
        )}
      </div>
      <span className="flex shrink-0 items-center gap-1.5 text-[var(--ink-soft)]">
        <span className={`inline-block h-2.5 w-2.5 rounded-full border border-[var(--ink-soft)] ${turn === "White" ? "bg-white" : "bg-neutral-900"}`} />
        {turn} to move
      </span>
    </div>
  );
}

function ScratchBar({ index }: { index: SectionIndex }) {
  const scratch = useStudy((s) => s.scratch);
  const exit = useStudy((s) => s.exitScratch);
  if (!scratch) return null;
  const base = index.get(scratch.base);
  return (
    <div className="scratch">
      <span className="smallcaps text-xs text-[var(--ink-soft)]">Your analysis</span>
      <span className="flex flex-wrap gap-x-1.5">
        {scratch.moves.map((m, i) => {
          const fenBefore = i === 0 ? base?.fen ?? "" : scratch.moves[i - 1].fen;
          const white = turnOf(fenBefore) === "w";
          const no = Number(fenBefore.split(" ")[5] ?? 1);
          return (
            <span key={i} className={i === scratch.ply - 1 ? "font-semibold text-[var(--accent)]" : ""}>
              {(white || i === 0) && <span className="text-[var(--ink-faint)]">{white ? `${no}.` : `${no}…`}</span>}
              <FigSan san={m.san} />
            </span>
          );
        })}
      </span>
      <button type="button" className="btn-ghost ml-auto text-xs" onClick={exit}>
        Back to the book
      </button>
    </div>
  );
}

export function Controls({ index, extra }: { index: SectionIndex; extra?: React.ReactNode }) {
  const { next, prev, first, last, flip } = useStudy.getState();
  const nav = useStopNav(index);
  return (
    <div className="controls">
      <button type="button" onClick={nav.up} title="Previous diagram (↑)" aria-label="Previous diagram">
        <IconUp />
      </button>
      <button type="button" onClick={first} title="Start of line (Home)" aria-label="Start of line">
        <IconFirst />
      </button>
      <button type="button" onClick={() => prev("click")} title="Back (←)" aria-label="Back" className="controls-main">
        <IconPrev />
      </button>
      <button type="button" onClick={() => next("click")} title="Forward (→)" aria-label="Forward" className="controls-main">
        <IconNext />
      </button>
      <button type="button" onClick={last} title="End of line (End)" aria-label="End of line">
        <IconLast />
      </button>
      <button type="button" onClick={nav.down} title="Next diagram (↓)" aria-label="Next diagram">
        <IconDown />
      </button>
      <span className="mx-1 h-5 w-px bg-[var(--rule)]" />
      <button type="button" onClick={flip} title="Flip board (F)" aria-label="Flip board">
        <IconFlip />
      </button>
      {extra}
    </div>
  );
}

export function ReadPanel({ index }: { index: SectionIndex }) {
  const fen = useStudy(currentFen);
  const nodeId = useStudy((s) => s.nodeId);
  const scratch = useStudy((s) => s.scratch);
  const orientation = useStudy((s) => s.orientation);
  const playMove = useStudy((s) => s.playMove);
  const [arrows, setArrows] = useState(false);

  const node = index.get(nodeId);
  const lastMove = scratch?.ply
    ? uciSquares(scratch.moves[scratch.ply - 1].uci)
    : node
      ? lastMoveSquares(index, node)
      : null;

  const shapes = useMemo<DrawShape[]>(() => {
    if (!arrows || !node || scratch) return [];
    return node.children.flatMap((c) => {
      const child = index.get(c);
      const sq = child ? lastMoveSquares(index, child) : null;
      return sq ? [{ orig: sq[0] as Key, dest: sq[1] as Key, brush: child!.main ? "green" : "blue" }] : [];
    });
  }, [arrows, node, scratch, index]);

  if (!fen) return null;
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <PositionCaption index={index} />
      <div className="board-frame">
        <Board fen={fen} orientation={orientation} lastMove={lastMove} movable="turn" onMove={playMove} shapes={shapes} />
      </div>
      <Controls
        index={index}
        extra={
          <button
            type="button"
            onClick={() => setArrows((a) => !a)}
            className={arrows ? "is-on" : ""}
            title="Show the book's moves as arrows"
            aria-pressed={arrows}
            aria-label="Show book moves as arrows"
          >
            <IconArrows />
          </button>
        }
      />
      <ScratchBar index={index} />
      <div className="tree-scroll">
        <MoveTree index={index} />
      </div>
    </div>
  );
}
