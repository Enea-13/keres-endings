import type { DrawShape } from "chessground/draw";
import type { Key } from "chessground/types";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Board } from "../board/Board";
import { FigSan } from "../board/Figurine";
import { tap } from "../board/sound";
import { lastMoveSquares, moveNumberLabel, type Color, type SectionIndex } from "../content/tree";
import { MaskContext } from "../reader/MoveChip";
import { BlockView, type TextHandlers } from "../reader/SectionText";
import { usePrefs } from "../store/prefs";
import { useStudy } from "../store/study";
import { IconBulb, IconRestart } from "../ui/icons";
import {
  accuracy,
  autoAdvance,
  currentNode,
  expectedNode,
  guess,
  hint,
  isDone,
  reveal,
  startGuess,
  toMove,
  userMoveCount,
  type GuessState,
} from "./guessLogic";

/** Guess mode state shared by the panel and the masked text. */
let shared: GuessState | null = null;
const listeners = new Set<() => void>();
function publish(s: GuessState | null) {
  shared = s;
  listeners.forEach((l) => l());
}
function useShared(): GuessState | null {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((x) => x + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return shared;
}

export function GuessPanel({ index }: { index: SectionIndex }) {
  const startId = useRef(useStudy.getState().nodeId);
  const [state, setState] = useState<GuessState | null>(() =>
    startId.current ? startGuess(index, startId.current) : null,
  );
  const [nonce, setNonce] = useState(0);
  const [shake, setShake] = useState(0);
  const orientation = useStudy((s) => s.orientation);
  const recorded = useRef(false);

  useEffect(() => {
    publish(state);
    if (state) useStudy.getState().goto(currentNode(state), "train");
  }, [state]);
  useEffect(() => () => publish(null), []);

  // the book's replies (and implied moves) play themselves
  useEffect(() => {
    if (!state || isDone(state)) return;
    if (toMove(index, state) === state.user && !index.get(expectedNode(state))?.implied) return;
    const t = setTimeout(() => setState((s) => (s ? autoAdvance(index, s) : s)), 550);
    return () => clearTimeout(t);
  }, [state, index]);

  useEffect(() => {
    if (state && isDone(state) && !recorded.current) {
      recorded.current = true;
      usePrefs.getState().recordGuess(state.unit, accuracy(index, state));
    }
  }, [state, index]);

  const restart = (user?: Color) => {
    if (!startId.current) return;
    recorded.current = false;
    setState(startGuess(index, startId.current, user ?? state?.user));
  };

  if (!state || state.line.length < 2) {
    return (
      <div className="panel-empty">
        <p>The book gives no moves to guess from this position.</p>
        <p className="text-sm text-[var(--ink-soft)]">Pick a diagram with analysis, then choose “Guess the moves”.</p>
      </div>
    );
  }

  const node = index.get(currentNode(state))!;
  const want = index.get(expectedNode(state));
  const done = isDone(state);
  const yourTurn = !done && toMove(index, state) === state.user && !want?.implied;
  const total = userMoveCount(index, state);
  const shapes: DrawShape[] = [];
  if (yourTurn && want && state.hints > 0) {
    const sq = lastMoveSquares(index, want);
    if (sq) {
      shapes.push({ orig: sq[0] as Key, brush: "yellow" });
      if (state.hints > 1) shapes.push({ orig: sq[0] as Key, dest: sq[1] as Key, brush: "yellow" });
    }
  }

  const onMove = (uci: string) => {
    const next = guess(index, state, uci);
    const fb = next.feedback;
    if (fb?.kind === "correct") tap();
    else {
      tap("error");
      setShake((x) => x + 1);
      setNonce((x) => x + 1);
    }
    setState(next);
  };

  const fb = state.feedback;
  const fbNode = fb && "node" in fb ? index.get(fb.node) : undefined;
  const sideLabel = state.user === "w" ? "White" : "Black";

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-baseline justify-between text-sm">
        <span>
          <span className="smallcaps mr-2 text-[var(--accent)]">Guess the moves</span>
          <span className="text-[var(--ink-soft)]">you play {sideLabel}</span>
        </span>
        <span className="tabular-nums text-[var(--ink-soft)]">
          {state.firstTry}/{total} first try
        </span>
      </div>
      <motion.div
        key={shake}
        className="board-frame"
        animate={shake ? { x: [0, -7, 7, -4, 4, 0] } : undefined}
        transition={{ duration: 0.32 }}
      >
        <Board
          fen={node.fen}
          orientation={orientation}
          lastMove={lastMoveSquares(index, node)}
          movable={yourTurn ? (state.user === "w" ? "white" : "black") : null}
          onMove={onMove}
          shapes={shapes}
          nonce={nonce}
        />
      </motion.div>

      <div className="flex items-center gap-2">
        <button type="button" className="btn" disabled={!yourTurn} onClick={() => setState(hint(state))}>
          <IconBulb width={16} height={16} /> {state.hints === 0 ? "Hint" : state.hints === 1 ? "Show the move" : "Hint shown"}
        </button>
        <button type="button" className="btn" disabled={!yourTurn} onClick={() => setState(reveal(state))}>
          Reveal
        </button>
        <span className="flex-1" />
        <div className="segmented" role="radiogroup" aria-label="Side to play">
          {(["w", "b"] as Color[]).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={state.user === c}
              className={state.user === c ? "is-on" : ""}
              onClick={() => restart(c)}
            >
              {c === "w" ? "White" : "Black"}
            </button>
          ))}
        </div>
        <button type="button" className="icon-btn" onClick={() => restart()} aria-label="Start again" title="Start again">
          <IconRestart />
        </button>
      </div>

      <div className="min-h-[5.5rem]" aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${state.pos}-${state.attempts}-${fb?.kind}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {done ? (
              <DoneCard index={index} state={state} onAgain={() => restart()} />
            ) : fb?.kind === "correct" && fbNode ? (
              <div className="feedback feedback-good">
                ✓ {moveNumberLabel(fbNode)}
                <FigSan san={fbNode.san} />
                {fbNode.annot} is the book’s move.
              </div>
            ) : fb?.kind === "variation" && fbNode ? (
              <div className="feedback feedback-maybe">
                The text also examines {moveNumberLabel(fbNode)}
                <FigSan san={fbNode.san} />
                {fbNode.annot}, but the main line goes differently. Try again.
              </div>
            ) : fb?.kind === "wrong" ? (
              <div className="feedback feedback-bad">✗ Not the book’s move. Try again, or ask for a hint.</div>
            ) : fb?.kind === "revealed" && fbNode ? (
              <div className="feedback">
                The book plays {moveNumberLabel(fbNode)}
                <FigSan san={fbNode.san} />
                {fbNode.annot}.
              </div>
            ) : yourTurn ? (
              <div className="feedback">Find {sideLabel}’s move.</div>
            ) : (
              <div className="feedback text-[var(--ink-soft)]">…</div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function DoneCard({ index, state, onAgain }: { index: SectionIndex; state: GuessState; onAgain: () => void }) {
  const acc = Math.round(accuracy(index, state) * 100);
  const setMode = useStudy((s) => s.setMode);
  const next = useMemo(() => {
    const stops = index.stops;
    const i = stops.findIndex((s) => index.get(s.node)?.unit === state.unit);
    return stops.slice(i + 1).find((s) => index.get(s.node)?.unit !== state.unit) ?? null;
  }, [index, state.unit]);
  return (
    <div className="feedback feedback-done">
      <div className="text-lg">
        Line complete · <strong>{acc}%</strong> found at the first try
      </div>
      <div className="text-sm text-[var(--ink-soft)]">
        {state.mistakes} wrong {state.mistakes === 1 ? "try" : "tries"}, {state.hintsUsed} {state.hintsUsed === 1 ? "hint" : "hints"}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={onAgain}>
          Again
        </button>
        {next && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              const s = useStudy.getState();
              s.goto(next.node, "train");
              s.setMode("guess");
            }}
          >
            Next diagram ({next.n})
          </button>
        )}
        <button type="button" className="btn" onClick={() => setMode("play")}>
          Play on vs Stockfish
        </button>
      </div>
    </div>
  );
}

/**
 * The text of the diagram being trained, revealed as the line progresses: a block appears
 * once the first main-line move it prints has been played; later main-line moves stay hidden.
 */
export function GuessText({ index, handlers }: { index: SectionIndex; handlers: TextHandlers }) {
  const state = useShared();
  const plan = useMemo(() => {
    if (!state) return null;
    const pos = new Map(state.line.map((id, k) => [id, k]));
    const span = index.spanOf(state.unit);
    const firstK: number[] = [];
    let carry = 0;
    for (let i = span[0]; i < span[1]; i++) {
      const b = index.blocks[i];
      const ids =
        b.type === "p"
          ? b.runs.flatMap((r) => (r.m ? [r.m] : []))
          : b.type === "rows"
            ? b.rows.flatMap((r) => [r.w?.m, r.b?.m].filter((x): x is string => !!x))
            : [];
      const ks = ids.map((id) => pos.get(id)).filter((k): k is number => k !== undefined);
      if (ks.length) carry = Math.min(...ks);
      firstK.push(carry);
    }
    return { pos, span, firstK };
  }, [state?.unit, state?.line, index]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state || !plan) return null;
  const mask = (id: string) => (plan.pos.get(id) ?? -1) > state.pos;
  const visible = plan.firstK.map((k) => k <= state.pos);
  const shown = visible.lastIndexOf(true);
  const done = isDone(state);
  return (
    <MaskContext.Provider value={done ? null : mask}>
      {plan.firstK.map((_, k) => {
        const i = plan.span[0] + k;
        if (!visible[k] && !done) return null;
        return (
          <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}>
            <BlockView block={index.blocks[i]} i={i} index={index} handlers={{ onDiagramRef: handlers.onDiagramRef }} />
          </motion.div>
        );
      })}
      {!done && shown < plan.firstK.length - 1 && (
        <p className="mt-6 text-center text-sm italic text-[var(--ink-faint)]">
          The commentary appears as you find the moves.
        </p>
      )}
    </MaskContext.Provider>
  );
}
