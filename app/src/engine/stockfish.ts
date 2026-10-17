/**
 * Stockfish 19 "lite single-threaded" (WASM) in a Web Worker, spoken to over UCI.
 * One engine is shared by the whole app and only started when Play mode is first opened.
 */

export interface Score {
  cp?: number; // centipawns from the side to move
  mate?: number; // moves to mate from the side to move (negative: getting mated)
}

export interface SearchResult {
  bestmove: string | null;
  score: Score | null;
}

const ENGINE_URL = "/engine/stockfish-19-lite-single.js";

class Engine {
  private worker: Worker;
  private lines: ((line: string) => void)[] = [];
  private ready: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  private elo: number | null | undefined = undefined;

  constructor() {
    this.worker = new Worker(ENGINE_URL);
    this.worker.onmessage = (e: MessageEvent) => {
      const line = typeof e.data === "string" ? e.data : String(e.data);
      for (const l of [...this.lines]) l(line);
    };
    this.ready = (async () => {
      this.send("uci");
      await this.waitFor((l) => l === "uciok");
      this.send("setoption name Hash value 32");
      this.send("isready");
      await this.waitFor((l) => l === "readyok");
    })();
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd);
  }

  private waitFor(match: (line: string) => boolean, onLine?: (line: string) => void): Promise<string> {
    return new Promise((resolve) => {
      const listener = (line: string) => {
        onLine?.(line);
        if (match(line)) {
          this.lines = this.lines.filter((l) => l !== listener);
          resolve(line);
        }
      };
      this.lines.push(listener);
    });
  }

  private async setStrength(elo: number | null) {
    if (elo === this.elo) return;
    this.elo = elo;
    if (elo) {
      this.send("setoption name UCI_LimitStrength value true");
      this.send(`setoption name UCI_Elo value ${Math.max(1320, Math.min(3190, elo))}`);
    } else {
      this.send("setoption name UCI_LimitStrength value false");
    }
    this.send("isready");
    await this.waitFor((l) => l === "readyok");
  }

  /** Best move for `fen` (searches run one at a time). */
  search(fen: string, opts: { movetime?: number; depth?: number; elo?: number | null } = {}): Promise<SearchResult> {
    const run = async (): Promise<SearchResult> => {
      await this.ready;
      await this.setStrength(opts.elo ?? null);
      let score: Score | null = null;
      this.send(`position fen ${fen}`);
      this.send(opts.depth ? `go depth ${opts.depth}` : `go movetime ${opts.movetime ?? 900}`);
      const done = await this.waitFor(
        (l) => l.startsWith("bestmove"),
        (l) => {
          const m = / score (cp|mate) (-?\d+)/.exec(l);
          if (m && l.startsWith("info") && !l.includes(" lowerbound") && !l.includes(" upperbound"))
            score = m[1] === "cp" ? { cp: Number(m[2]) } : { mate: Number(m[2]) };
        },
      );
      const best = done.split(" ")[1];
      return { bestmove: best && best !== "(none)" ? best : null, score };
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  newGame() {
    this.send("ucinewgame");
  }

  stop() {
    this.send("stop");
  }
}

let engine: Engine | null = null;

export function getEngine(): Engine {
  if (!engine) engine = new Engine();
  return engine;
}

/** Score from White's point of view as a short label: "+1.3", "−0.4", "M3", "−M2". */
export function formatScore(score: Score | null, turn: "w" | "b"): string {
  if (!score) return "";
  const sign = turn === "w" ? 1 : -1;
  if (score.mate !== undefined) {
    const m = score.mate * sign;
    return m > 0 ? `M${m}` : `−M${-m}`;
  }
  const cp = (score.cp ?? 0) * sign;
  return `${cp >= 0 ? "+" : "−"}${(Math.abs(cp) / 100).toFixed(1)}`;
}

/** Bar fill (0..1) for White, from a score seen by the side to move. */
export function whiteShare(score: Score | null, turn: "w" | "b"): number {
  if (!score) return 0.5;
  const sign = turn === "w" ? 1 : -1;
  if (score.mate !== undefined) return score.mate * sign > 0 ? 1 : 0;
  const cp = (score.cp ?? 0) * sign;
  return 1 / (1 + Math.exp(-cp / 250));
}
