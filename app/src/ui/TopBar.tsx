import { Link } from "react-router-dom";
import type { Toc } from "../content/types";
import { usePrefs } from "../store/prefs";
import { useStudy, type Mode } from "../store/study";
import { IconBook, IconMenu, IconSword, IconTarget } from "./icons";
import { Settings } from "./Settings";
import { shortTitle, trail } from "./useToc";

const MODES: { mode: Mode; label: string; icon: typeof IconBook; hint: string }[] = [
  { mode: "read", label: "Read", icon: IconBook, hint: "Read with the board" },
  { mode: "guess", label: "Guess", icon: IconTarget, hint: "Guess the book's moves for this diagram" },
  { mode: "play", label: "Play", icon: IconSword, hint: "Play this position against Stockfish" },
];

export function TopBar({ toc, sectionId, onModeChange }: { toc: Toc | null; sectionId?: string; onModeChange?: (m: Mode) => void }) {
  const mode = useStudy((s) => s.mode);
  const tocOpen = usePrefs((s) => s.tocOpen);
  const set = usePrefs((s) => s.set);
  const crumbs = toc && sectionId ? trail(toc, sectionId) : [];

  return (
    <header className="topbar">
      {sectionId && (
        <button
          type="button"
          className="icon-btn"
          onClick={() => set({ tocOpen: !tocOpen })}
          aria-label={tocOpen ? "Hide contents" : "Show contents"}
          aria-expanded={tocOpen}
        >
          <IconMenu />
        </button>
      )}
      <Link to="/" className="brand">
        <span className="brand-title">Practical Chess Endings</span>
        <span className="brand-author">Paul Keres</span>
      </Link>
      {crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="crumbs">
          {crumbs.map((c, i) => (
            <span key={c.id} className="min-w-0 truncate">
              {i > 0 && <span className="crumb-sep">›</span>}
              {i === crumbs.length - 1 ? (
                <span className="text-[var(--ink)]">{shortTitle(c.title)}</span>
              ) : (
                <Link to={`/read/${c.id}`}>{shortTitle(c.title)}</Link>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="ml-auto flex items-center gap-2">
        {sectionId && onModeChange && (
          <div className="segmented" role="tablist" aria-label="Study mode">
            {MODES.map(({ mode: m, label, icon: Icon, hint }) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                className={mode === m ? "is-on" : ""}
                title={hint}
                onClick={() => onModeChange(m)}
              >
                <Icon width={15} height={15} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        )}
        <Settings />
      </div>
    </header>
  );
}
