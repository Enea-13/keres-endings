import { memo, type ReactNode } from "react";
import { FigText } from "../board/Figurine";
import { MiniBoard } from "../board/MiniBoard";
import type { Block, Row, RowCell, Run } from "../content/types";
import type { SectionIndex } from "../content/tree";
import { useStudy } from "../store/study";
import { DeadMove, MoveChip } from "./MoveChip";

export interface TextHandlers {
  onDiagramRef: (n: number) => void;
  onTrain?: (nodeId: string) => void;
  onPlay?: (nodeId: string) => void;
}

export function RunView({ run, handlers }: { run: Run; handlers: TextHandlers }) {
  if (run.m) return <MoveChip id={run.m} text={run.t} bold={!!run.b} />;
  if (run.x) return <DeadMove text={run.t} bold={!!run.b} />;
  if (run.d !== undefined)
    return (
      <button type="button" className="dref" onClick={() => handlers.onDiagramRef(run.d!)}>
        {run.t}
      </button>
    );
  let node: ReactNode = <FigText text={run.t} />;
  if (run.b) node = <strong>{node}</strong>;
  if (run.i) node = <em>{node}</em>;
  return node;
}

function Cell({ cell }: { cell: RowCell | null | undefined }) {
  if (cell === null) return <span className="text-[var(--ink-faint)]">…</span>;
  if (!cell) return null;
  return (
    <>
      {cell.m ? <MoveChip id={cell.m} text={cell.t} bold /> : cell.x ? <DeadMove text={cell.t} bold /> : <FigText text={cell.t} />}
      {cell.after && <span className="ml-1 text-[var(--ink-soft)]"><FigText text={cell.after} /></span>}
    </>
  );
}

function Rows({ rows }: { rows: Row[] }) {
  return (
    <div className="rows" role="table" aria-label="Main line">
      {rows.map((r, i) => (
        <div key={i} role="row" className="rows-row">
          <span className="rows-num">{r.n}</span>
          <span className="rows-cell">
            <Cell cell={r.w} />
          </span>
          <span className="rows-cell">
            <Cell cell={r.b} />
          </span>
        </div>
      ))}
    </div>
  );
}

const LABEL: Record<string, string> = { left: "Left", right: "Right", top: "Top", bottom: "Bottom" };

export const DiagramCard = memo(function DiagramCard({
  block,
  blockIndex,
  index,
  handlers,
}: {
  block: Extract<Block, { type: "diagram" }>;
  blockIndex: number;
  index: SectionIndex;
  handlers: TextHandlers;
}) {
  const targets = block.node
    ? [{ node: block.node, label: null as string | null }]
    : (block.units ?? [])
        .map((u) => ({ node: index.units.get(u.id)?.root ?? "", label: u.label as string | null }))
        .filter((t) => t.node);
  const goto = useStudy((s) => s.goto);
  // one string per card so a card re-renders only when its own highlight changes
  const activeKey = useStudy((s) => {
    const cur = s.index?.get(s.nodeId);
    return targets
      .map((t) => (block.node ? s.nodeId === t.node : !!cur && index.get(t.node)?.unit === cur.unit) ? "1" : "0")
      .join("");
  });
  const isActive = (k: number) => activeKey[k] === "1";

  return (
    <figure className="diagram-card" data-stop={blockIndex} data-node-target={targets[0]?.node}>
      <div className="flex flex-wrap items-start justify-center gap-4">
        {targets.map((t, k) => {
          const node = index.get(t.node);
          if (!node) return null;
          return (
            <div key={t.node} className="flex flex-col items-center">
              <button
                type="button"
                className={`diagram-thumb ${isActive(k) ? "diagram-thumb-active" : ""}`}
                onClick={() => goto(t.node, "click")}
                aria-label={`Show diagram ${block.n}${t.label ? ` (${t.label})` : ""} on the board`}
              >
                <MiniBoard fen={node.fen} size={targets.length > 1 ? 150 : 188} />
              </button>
              {t.label && <span className="mt-1 text-xs tracking-wide text-[var(--ink-soft)] smallcaps">{LABEL[t.label]}</span>}
            </div>
          );
        })}
      </div>
      <figcaption className="mt-2 text-center">
        <span className="diagram-no">Diagram {block.n}</span>
        {block.caption?.map((line, i) => (
          <span key={i} className="block text-[0.95em] leading-snug">
            {line.map((r, k) => (
              <RunView key={k} run={r} handlers={handlers} />
            ))}
          </span>
        ))}
        {block.printed && (
          <span className="mt-1 block text-xs italic text-[var(--ink-soft)]">
            The printed diagram differs slightly from the moves; the board shows the position the moves reach.
          </span>
        )}
        {(handlers.onTrain || handlers.onPlay) && targets[0] && (
          <span className="diagram-actions">
            {handlers.onTrain && (
              <button type="button" onClick={() => handlers.onTrain!(targets[0].node)}>
                Guess the moves
              </button>
            )}
            {handlers.onPlay && (
              <button type="button" onClick={() => handlers.onPlay!(targets[0].node)}>
                Play it out
              </button>
            )}
          </span>
        )}
      </figcaption>
    </figure>
  );
});

export function BlockView({
  block,
  i,
  index,
  handlers,
}: {
  block: Block;
  i: number;
  index: SectionIndex;
  handlers: TextHandlers;
}) {
  if (block.type === "diagram") return <DiagramCard block={block} blockIndex={i} index={index} handlers={handlers} />;
  if (block.type === "rows") return <Rows rows={block.rows} />;
  return (
    <p className={`para${block.align === "center" ? " para-center" : ""}`}>
      {block.runs.map((r, k) => (
        <RunView key={k} run={r} handlers={handlers} />
      ))}
    </p>
  );
}

/** The whole section as the book prints it. */
export const SectionText = memo(function SectionText({
  index,
  handlers,
  from = 0,
  to,
}: {
  index: SectionIndex;
  handlers: TextHandlers;
  from?: number;
  to?: number;
}) {
  const blocks = index.blocks.slice(from, to);
  return (
    <>
      {blocks.map((b, k) => (
        <BlockView key={from + k} block={b} i={from + k} index={index} handlers={handlers} />
      ))}
    </>
  );
});
