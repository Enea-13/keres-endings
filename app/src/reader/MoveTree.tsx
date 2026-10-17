import { memo, useEffect, useRef, type ReactNode } from "react";
import { FigSan } from "../board/Figurine";
import { moveNumberLabel, type SectionIndex } from "../content/tree";
import { useStudy } from "../store/study";

const TreeMove = memo(function TreeMove({
  id,
  san,
  annot,
  num,
  main,
  implied,
}: {
  id: string;
  san: string;
  annot: string;
  num: string | null;
  main: boolean;
  implied: boolean;
}) {
  const active = useStudy((s) => s.nodeId === id && !s.scratch && !s.override);
  const goto = useStudy((s) => s.goto);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);
  return (
    <>
      {num && <span className="tree-num">{num}</span>}
      <button
        ref={ref}
        type="button"
        className={`tree-mv${main ? " tree-main" : ""}${implied ? " tree-implied" : ""}${active ? " tree-active" : ""}`}
        onClick={() => goto(id, "click")}
        title={implied ? "Not given in the book: any move, or the obvious reply" : undefined}
      >
        <FigSan san={san} />
        {annot && <span className="tree-annot">{annot}</span>}
      </button>
    </>
  );
});

function renderLine(index: SectionIndex, first: string, depth: number): ReactNode[] {
  const out: ReactNode[] = [];
  let id: string | undefined = first;
  let needNumber = true;
  while (id) {
    const n = index.get(id);
    if (!n) break;
    const num = needNumber || n.color === "w" ? moveNumberLabel(n) : null;
    out.push(
      <TreeMove key={n.id} id={n.id} san={n.san} annot={n.annot} num={num} main={n.main} implied={n.implied} />,
    );
    needNumber = false;
    const parent = index.get(n.parent);
    if (parent && parent.children[0] === n.id && parent.children.length > 1) {
      for (const sib of parent.children.slice(1)) {
        out.push(
          <span key={`v-${sib}`} className={`tree-var depth-${Math.min(depth + 1, 3)}`}>
            {renderLine(index, sib, depth + 1)}
          </span>,
        );
      }
      needNumber = true;
    }
    id = n.children[0];
  }
  return out;
}

/** All lines of the current diagram, main line first, variations in brackets. */
export const MoveTree = memo(function MoveTree({ index }: { index: SectionIndex }) {
  const unitId = useStudy((s) => s.index?.get(s.nodeId)?.unit ?? null);
  const unit = unitId ? index.units.get(unitId) : undefined;
  if (!unit) return <p className="px-1 text-sm text-[var(--ink-soft)]">Choose a diagram or a move in the text.</p>;
  const root = index.get(unit.root);
  const alt = unit.alt ? index.get(unit.alt) : undefined;
  const sideName = (fen: string) => (fen.split(" ")[1] === "b" ? "Black" : "White");
  return (
    <div className="tree">
      {unit.note && (
        <div className="tree-note">
          <span className="smallcaps">Hypothetical</span> {unit.note}
        </div>
      )}
      {root && root.children.length > 0 && (
        <div className="tree-block">
          <div className="tree-head">{sideName(root.fen)} to move</div>
          {renderLine(index, root.children[0], 0)}
        </div>
      )}
      {alt && alt.children.length > 0 && (
        <div className="tree-block">
          <div className="tree-head">If {sideName(alt.fen)} were to move</div>
          {renderLine(index, alt.children[0], 0)}
        </div>
      )}
      {root && !root.children.length && !alt?.children.length && (
        <p className="text-sm text-[var(--ink-soft)]">No moves are given for this diagram.</p>
      )}
    </div>
  );
});
