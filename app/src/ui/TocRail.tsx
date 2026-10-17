import { memo, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Toc, TocEntry } from "../content/types";
import { usePrefs } from "../store/prefs";
import { trail } from "./useToc";

function Mark({ id }: { id: string }) {
  const done = usePrefs((s) => !!s.completed[id]);
  const seen = usePrefs((s) => !!s.visited[id]);
  return (
    <span
      className={`toc-mark ${done ? "toc-mark-done" : seen ? "toc-mark-seen" : ""}`}
      aria-label={done ? "read" : seen ? "started" : "not started"}
    />
  );
}

function Entry({ e, current, depth }: { e: TocEntry; current: string; depth: number }) {
  return (
    <li>
      <Link
        to={`/read/${e.id}`}
        className={`toc-link level-${e.level} ${e.id === current ? "toc-current" : ""}`}
        style={{ paddingLeft: `${0.6 + depth * 0.85}rem` }}
        aria-current={e.id === current ? "page" : undefined}
      >
        <Mark id={e.id} />
        <span className="min-w-0 flex-1">{e.title}</span>
        {e.count > 0 && <span className="toc-count">{e.count}</span>}
      </Link>
      {e.children.length > 0 && (
        <ul>
          {e.children.map((c) => (
            <Entry key={c.id} e={c} current={current} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export const TocRail = memo(function TocRail({ toc, current }: { toc: Toc; current: string }) {
  const chapter = trail(toc, current)[0]?.id;
  const [open, setOpen] = useState<Set<string>>(new Set(chapter ? [chapter] : []));
  useEffect(() => {
    if (chapter) setOpen((o) => (o.has(chapter) ? o : new Set([...o, chapter])));
  }, [chapter]);

  return (
    <nav className="toc" aria-label="Contents">
      <ul>
        {toc.toc.map((ch) => {
          const isOpen = open.has(ch.id);
          const hasKids = ch.children.length > 0;
          return (
            <li key={ch.id} className="toc-chapter">
              <div className="flex items-center">
                <Link
                  to={`/read/${ch.id}`}
                  className={`toc-link level-1 flex-1 ${ch.id === current ? "toc-current" : ""}`}
                >
                  <Mark id={ch.id} />
                  <span className="flex-1">{ch.title}</span>
                </Link>
                {hasKids && (
                  <button
                    type="button"
                    className="toc-toggle"
                    aria-expanded={isOpen}
                    aria-label={isOpen ? `Collapse ${ch.title}` : `Expand ${ch.title}`}
                    onClick={() =>
                      setOpen((o) => {
                        const n = new Set(o);
                        if (n.has(ch.id)) n.delete(ch.id);
                        else n.add(ch.id);
                        return n;
                      })
                    }
                  >
                    <span className={`inline-block transition-transform ${isOpen ? "rotate-90" : ""}`}>›</span>
                  </button>
                )}
              </div>
              {hasKids && isOpen && (
                <ul>
                  {ch.children.map((c) => (
                    <Entry key={c.id} e={c} current={current} depth={1} />
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
});
