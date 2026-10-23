import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { DEMO } from "../content/api";
import type { TocEntry } from "../content/types";
import { usePrefs } from "../store/prefs";
import { TopBar } from "./TopBar";
import { flatten, useToc } from "./useToc";

const REPO = "https://github.com/Enea-13/keres-endings";

function ChapterCard({ ch, i }: { ch: TocEntry; i: number }) {
  const completed = usePrefs((s) => s.completed);
  const studied = usePrefs((s) => s.studied);
  const all = [ch, ...flatten(ch.children)];
  const done = all.filter((e) => completed[e.id]).length;
  const diagrams = all.reduce((n, e) => n + e.count, 0);
  const range = all.map((e) => e.diagrams).filter((d): d is [number, number] => !!d);
  const lo = range.length ? Math.min(...range.map((r) => r[0])) : 0;
  const hi = range.length ? Math.max(...range.map((r) => r[1])) : -1;
  let seen = 0;
  for (let n = lo; n <= hi; n++) if (studied[n]) seen++;
  const m = /^(\d+) (.*)$/.exec(ch.title);
  const meta = [
    all.length > 1 && `${all.length - 1} sections`,
    diagrams > 0 && `${diagrams} diagrams`,
    !DEMO && `page ${ch.page}`, // the demo has no pages
  ];
  return (
    <motion.li initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }}>
      <Link to={`/read/${ch.id}`} className="chapter-card">
        <span className="chapter-no">{m ? m[1] : "·"}</span>
        <span className="flex-1">
          <span className="chapter-title">{m ? m[2] : ch.title}</span>
          <span className="chapter-meta">{meta.filter(Boolean).join(" · ")}</span>
          {diagrams > 0 && (
            <span className="progress" aria-label={`${seen} of ${diagrams} diagrams studied`}>
              <span style={{ width: `${(100 * seen) / diagrams}%` }} />
            </span>
          )}
        </span>
        {done > 0 && <span className="text-xs text-[var(--ink-faint)]">{done}/{all.length} read</span>}
      </Link>
    </motion.li>
  );
}

export function HomePage() {
  const toc = useToc();
  const last = usePrefs((s) => s.last);
  const lastEntry = toc && last ? flatten(toc.toc).find((e) => e.id === last.section) : null;
  const diagrams = toc ? flatten(toc.toc).reduce((n, e) => n + e.count, 0) : 0;
  const chapters = toc ? toc.toc.filter((e) => /^\d+ /.test(e.title)).length : 0;
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar toc={toc} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-20 pt-12">
        <div className="cover">
          <p className="smallcaps tracking-[0.2em] text-[var(--accent)]">{toc?.author}</p>
          <h1 className="cover-title">{toc?.title}</h1>
          {toc && (
            <p className="cover-sub">
              An interactive study edition · {diagrams} diagrams · {chapters} chapters
            </p>
          )}
          {lastEntry ? (
            <Link
              className="btn btn-primary mt-6"
              to={`/read/${lastEntry.id}${last?.node ? `?n=${encodeURIComponent(last.node)}` : ""}`}
            >
              Continue: {lastEntry.title}
            </Link>
          ) : (
            toc && (
              <Link className="btn btn-primary mt-6" to={`/read/${toc.order[0]}`}>
                Start reading
              </Link>
            )
          )}
        </div>
        <ol className="mt-12 grid gap-3">{toc?.toc.map((ch, i) => <ChapterCard key={ch.id} ch={ch} i={i} />)}</ol>
        <p className="mt-12 text-center text-xs text-[var(--ink-faint)]">
          {DEMO ? (
            <>
              Demo: classic positions with commentary written for this page. The full app is built locally from your
              copy of Keres’ <i>Practical Chess Endings</i> · <a href={REPO}>source on GitHub</a> ·{" "}
            </>
          ) : (
            "For personal study. Built locally from your copy of the book · "
          )}
          pieces by Colin M. L. Burnett (CC BY-SA 3.0) · board by Lichess chessground · engine Stockfish (GPLv3)
          {!DEMO && (
            <>
              {" "}
              · <Link to="/qa">content check</Link>
            </>
          )}
        </p>
      </main>
    </div>
  );
}
