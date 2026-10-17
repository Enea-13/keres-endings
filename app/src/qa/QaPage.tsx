import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MiniBoard } from "../board/MiniBoard";
import { fetchQa } from "../content/api";
import type { QaData } from "../content/types";
import { TopBar } from "../ui/TopBar";
import { useToc } from "../ui/useToc";

const PAGE = 60;

/** Check the pipeline's work: each printed diagram beside the recognised position, and the
 * notation that could not be attached to a board. */
export function QaPage() {
  const toc = useToc();
  const [qa, setQa] = useState<QaData | null>(null);
  const [tab, setTab] = useState<"diagrams" | "failed">("diagrams");
  const [filter, setFilter] = useState<"all" | "flagged">("all");
  const [page, setPage] = useState(0);
  useEffect(() => void fetchQa().then(setQa), []);

  const diagrams = useMemo(() => {
    if (!qa) return [];
    return qa.diagrams.filter(
      (d) => filter === "all" || d.weak.length || d.positions.some((p) => p.issues.length || p.label),
    );
  }, [qa, filter]);

  if (!qa) return <div className="p-8">Loading…</div>;
  const pct = ((100 * qa.moves.anchored) / qa.moves.total).toFixed(1);
  const shown = diagrams.slice(page * PAGE, page * PAGE + PAGE);
  return (
    <div className="min-h-dvh">
      <TopBar toc={toc} />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="section-title">Content check</h1>
        <p className="mt-2 text-[var(--ink-soft)]">
          {qa.diagrams.length} diagrams · {qa.moves.anchored} of {qa.moves.total} printed moves linked to a position ({pct}%) ·{" "}
          {qa.failed.length} unlinked sequences · {qa.misprints.length} misprinted diagrams
        </p>
        <div className="segmented mt-4" role="tablist">
          <button type="button" className={tab === "diagrams" ? "is-on" : ""} onClick={() => setTab("diagrams")}>
            Diagrams
          </button>
          <button type="button" className={tab === "failed" ? "is-on" : ""} onClick={() => setTab("failed")}>
            Unlinked notation
          </button>
        </div>
        {tab === "diagrams" ? (
          <>
            <div className="mt-4 flex items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={filter === "flagged"}
                  onChange={(e) => {
                    setFilter(e.target.checked ? "flagged" : "all");
                    setPage(0);
                  }}
                />
                only flagged
              </label>
              <span className="text-[var(--ink-soft)]">
                {diagrams.length} shown · page {page + 1}/{Math.max(1, Math.ceil(diagrams.length / PAGE))}
              </span>
              <button type="button" className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>
                ←
              </button>
              <button
                type="button"
                className="btn"
                disabled={(page + 1) * PAGE >= diagrams.length}
                onClick={() => setPage(page + 1)}
              >
                →
              </button>
            </div>
            <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(330px,1fr))] gap-4">
              {shown.map((d) => (
                <li key={d.n} className="qa-card">
                  <div className="flex items-center justify-between text-sm">
                    <Link to={d.section ? `/read/${d.section}?d=${d.n}` : "#"} className="font-semibold">
                      Diagram {d.n}
                    </Link>
                    <span className="text-xs text-[var(--ink-faint)]">{d.status}</span>
                  </div>
                  <div className="mt-2 flex items-start gap-2">
                    <img src={`/qa/${String(d.n).padStart(3, "0")}.png`} alt={`Printed diagram ${d.n}`} className="w-[150px]" loading="lazy" />
                    <div className="flex flex-col gap-1">
                      {d.positions.map((p) => (
                        <div key={p.id}>
                          <MiniBoard fen={p.placement} size={d.positions.length > 1 ? 74 : 150} />
                          {p.label && <span className="text-xs">{p.label}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                  {d.positions.some((p) => p.issues.length) && (
                    <p className="mt-1 text-xs text-[var(--danger)]">{d.positions.flatMap((p) => p.issues).join(", ")}</p>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--ink-soft)]">
                <th className="py-1 pr-3">Page</th>
                <th className="pr-3">Diagram</th>
                <th>Text</th>
              </tr>
            </thead>
            <tbody>
              {qa.failed.map((f, i) => (
                <tr key={i} className="border-t border-[var(--rule)]">
                  <td className="py-1 pr-3 tabular-nums">{f.page}</td>
                  <td className="pr-3">
                    <Link to={`/read/${f.section}`}>{f.unit}</Link>
                  </td>
                  <td>{f.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
