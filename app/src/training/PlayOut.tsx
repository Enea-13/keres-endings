import { useEffect, useMemo, useRef, useState } from "react";
import { Board } from "../board/Board";
import { FigSan } from "../board/Figurine";
import { tap } from "../board/sound";
import { outcome, play, position, positionKey, type Played } from "../chess/util";
import { turnOf, uciSquares, type Color, type SectionIndex } from "../content/tree";
import { formatScore, getEngine, whiteShare, type Score } from "../engine/stockfish";
import { usePrefs } from "../store/prefs";
import { currentFen, useStudy } from "../store/study";
import { IconFlip, IconRestart, IconUndo } from "../ui/icons";

/** Play the current position out against Stockfish, starting from the book's position. */
export function PlayPanel({ index }: { index: SectionIndex }) {
  const start = useRef({ fen: currentFen(useStudy.getState()) ?? "", node: useStudy.getState().nodeId });
  const startFen = start.current.fen;
  const [user, setUser] = useState<Color>(turnOf(startFen));
  const [moves, setMoves] = useState<Played[]>([]);
  const [thinking, setThinking] = useState(false);
  const [evalOn, setEvalOn] = useState(false);
  const [score, setScore] = useState<{ s: Score | null; turn: Color } | null>(null);
  const [nonce, setNonce] = useState(0);
  const orientation = useStudy((s) => s.orientation);
  const setOrientation = useStudy((s) => s.setOrientation);
  const elo = usePrefs((s) => s.engineElo);
  const sound = usePrefs((s) => s.sound);
  const playable = !!position(startFen);

  const fen = moves.length ? moves[moves.length - 1].fen : startFen;
  const turn = turnOf(fen);
  const history = useMemo(() => [startFen, ...moves.map((m) => m.fen)].map(positionKey), [startFen, moves]);
  const result = playable ? outcome(fen, history.slice(0, -1)) : null;
  const engineTurn = playable && !result && turn !== user;

  // follow the book's tree while the game stays inside it
  const book = useMemo(() => {
    let node = index.get(start.current.node);
    if (!node || positionKey(node.fen) !== positionKey(startFen)) return { inBook: false, leftAt: 0 };
    for (let i = 0; i < moves.length; i++) {
      const key = positionKey(moves[i].fen);
      const child: string | undefined = node!.children.find((c) => {
        const n = index.get(c);
        return n && n.san !== "--" && positionKey(n.fen) === key;
      });
      if (!child) return { inBook: false, leftAt: i + 1 };
      node = index.get(child);
    }
    return { inBook: true, leftAt: 0, node: node?.id };
  }, [index, moves, startFen]);

  useEffect(() => {
    getEngine().newGame();
  }, []);

  useEffect(() => {
    if (!engineTurn) return;
    let live = true;
    setThinking(true);
    getEngine()
      .search(fen, { movetime: 900, elo })
      .then((r) => {
        if (!live) return;
        setScore({ s: r.score, turn });
        const played = r.bestmove ? play(fen, r.bestmove) : null;
        if (played) {
          if (sound) tap(played.san.includes("x") ? "capture" : "move");
          setMoves((m) => [...m, played]);
        }
      })
      .finally(() => live && setThinking(false));
    return () => {
      live = false;
    };
  }, [fen, engineTurn, elo, turn, sound]);

  // when it's the reader's move, refresh the evaluation if it is shown
  useEffect(() => {
    if (!evalOn || engineTurn || result || !playable) return;
    let live = true;
    getEngine()
      .search(fen, { depth: 14 })
      .then((r) => live && setScore({ s: r.score, turn }));
    return () => {
      live = false;
    };
  }, [evalOn, fen, engineTurn, result, playable, turn]);

  const onMove = (uci: string) => {
    const played = play(fen, uci);
    if (!played) {
      setNonce((x) => x + 1);
      return;
    }
    if (sound) tap(played.san.includes("x") ? "capture" : "move");
    setMoves((m) => [...m, played]);
  };

  const takeback = () => {
    setMoves((m) => {
      if (!m.length) return m;
      // undo the engine's reply too, so it is the reader's move again
      const lastMover = turnOf(m.length > 1 ? m[m.length - 2].fen : startFen);
      return m.slice(0, lastMover === user || m.length === 1 ? -1 : -2);
    });
  };

  const restart = (side?: Color) => {
    setMoves([]);
    setScore(null);
    if (side) setUser(side);
    getEngine().newGame();
  };

  if (!playable)
    return (
      <div className="panel-empty">
        <p>This diagram is a schematic without both kings, so it can’t be played out.</p>
      </div>
    );

  const verdict = result
    ? result.result === "½-½"
      ? `Draw by ${result.reason}.`
      : (result.result === "1-0") === (user === "w")
        ? `You win by ${result.reason}.`
        : `Stockfish wins by ${result.reason}.`
    : null;
  const share = whiteShare(score?.s ?? null, score?.turn ?? "w");
  const last = moves.length ? uciSquares(moves[moves.length - 1].uci) : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-baseline justify-between text-sm">
        <span>
          <span className="smallcaps mr-2 text-[var(--accent)]">Play it out</span>
          <span className="text-[var(--ink-soft)]">
            you play {user === "w" ? "White" : "Black"} · Stockfish {elo ? `${elo} Elo` : "full strength"}
          </span>
        </span>
        <span className={`text-xs ${book.inBook ? "text-[var(--good)]" : "text-[var(--ink-faint)]"}`}>
          {book.inBook ? "following the book" : book.leftAt ? `left the book at ply ${book.leftAt}` : ""}
        </span>
      </div>
      <div className="flex gap-2">
        {evalOn && (
          <div className="eval-bar" aria-label={`Evaluation ${formatScore(score?.s ?? null, score?.turn ?? "w")}`}>
            <div
              className="eval-white"
              style={{ height: `${(orientation === "white" ? share : 1 - share) * 100}%` }}
            />
            <span className="eval-label">{formatScore(score?.s ?? null, score?.turn ?? "w")}</span>
          </div>
        )}
        <div className="board-frame flex-1">
          <Board
            fen={fen}
            orientation={orientation}
            lastMove={last}
            movable={result || thinking ? null : user === "w" ? "white" : "black"}
            onMove={onMove}
            nonce={nonce}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn" onClick={takeback} disabled={!moves.length || thinking}>
          <IconUndo width={16} height={16} /> Take back
        </button>
        <button type="button" className="btn" onClick={() => restart()}>
          <IconRestart width={16} height={16} /> Restart
        </button>
        <button type="button" className="btn" onClick={() => restart(user === "w" ? "b" : "w")}>
          Switch sides
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setOrientation(orientation === "white" ? "black" : "white")}
          aria-label="Flip board"
        >
          <IconFlip />
        </button>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input type="checkbox" className="toggle" checked={evalOn} onChange={(e) => setEvalOn(e.target.checked)} />
          Evaluation
        </label>
      </div>
      <div className="feedback" aria-live="polite">
        {verdict ? (
          <strong>{verdict}</strong>
        ) : thinking ? (
          <span className="text-[var(--ink-soft)]">Stockfish is thinking…</span>
        ) : (
          <span>Your move.</span>
        )}
      </div>
      <div className="tree-scroll">
        <div className="tree">
          {moves.map((m, i) => {
            const before = i === 0 ? startFen : moves[i - 1].fen;
            const white = turnOf(before) === "w";
            const no = Number(before.split(" ")[5] ?? 1);
            return (
              <span key={i}>
                {(white || i === 0) && <span className="tree-num">{white ? `${no}.` : `${no}…`}</span>}
                <span className={`tree-mv ${i === moves.length - 1 ? "tree-active" : ""}`}>
                  <FigSan san={m.san} />
                </span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
