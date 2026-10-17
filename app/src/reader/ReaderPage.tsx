import { AnimatePresence, motion } from "motion/react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { fetchSection, prefetchSection } from "../content/api";
import { SectionIndex } from "../content/tree";
import type { Section } from "../content/types";
import { usePrefs } from "../store/prefs";
import { useStudy, type Mode } from "../store/study";
import { GuessPanel, GuessText } from "../training/Guess";
import { TocRail } from "../ui/TocRail";
import { TopBar } from "../ui/TopBar";
import { sectionOfDiagram, useToc } from "../ui/useToc";
import { useBoardSideEffects, useKeyboard, useTextSync } from "./hooks";
import { ReadPanel } from "./ReadPanel";
import { SectionText, type TextHandlers } from "./SectionText";

// the engine panel (and Stockfish) only load when Play mode is opened
const PlayPanel = lazy(() => import("../training/PlayOut").then((m) => ({ default: m.PlayPanel })));

export function ReaderPage() {
  const { sectionId = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toc = useToc();
  const [section, setSection] = useState<Section | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const tocOpen = usePrefs((s) => s.tocOpen);
  const mode = useStudy((s) => s.mode);
  const session = useStudy((s) => s.session);
  const index = useMemo(() => (section ? new SectionIndex(section) : null), [section]);

  useEffect(() => {
    let live = true;
    setError(null);
    fetchSection(sectionId)
      .then((s) => {
        if (!live) return;
        setSection(s);
        prefetchSection(s.next);
        prefetchSection(s.prev);
      })
      .catch(() => live && setError("This section could not be loaded. Has the content been built?"));
    return () => {
      live = false;
    };
  }, [sectionId]);

  // load the section into the study store (once per section), honouring ?n= and ?d=
  useEffect(() => {
    if (!index || !section || section.id !== sectionId) return;
    const d = Number(params.get("d"));
    const stop = d ? index.stops.find((s) => s.n === d) : undefined;
    useStudy.getState().load(sectionId, index, params.get("n") ?? stop?.node ?? null);
    usePrefs.getState().visit(sectionId);
    // on narrow screens the contents panel covers the page: close it once a section opens
    if (matchMedia("(max-width: 900px)").matches) usePrefs.getState().set({ tocOpen: false });
    if (!stop && !params.get("n")) {
      scroller.current?.scrollTo({ top: 0 });
      return;
    }
    // deep link: bring the diagram (or the move) into view once the text is laid out
    requestAnimationFrame(() => {
      const root = scroller.current;
      const id = useStudy.getState().nodeId;
      const chip = id ? index.chipFor(id) : null;
      const el =
        (stop ? root?.querySelector(`[data-stop="${stop.block}"]`) : null) ??
        (chip ? root?.querySelector(`[data-node="${CSS.escape(chip)}"]`) : null);
      el?.scrollIntoView({ block: "center" });
    });
  }, [index]);

  useKeyboard(index, mode === "read");
  useTextSync(index, scroller);
  useBoardSideEffects(index);

  // reaching the end of the text marks the section as read
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = endRef.current;
    if (!el || !section) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && usePrefs.getState().complete(section.id), {
      root: scroller.current,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [section]);

  const onDiagramRef = useCallback(
    (n: number) => {
      const stop = index?.stops.find((s) => s.n === n);
      if (stop) {
        useStudy.getState().goto(stop.node, "key");
        return;
      }
      const target = toc ? sectionOfDiagram(toc, n) : null;
      if (target) navigate(`/read/${target}?d=${n}`);
    },
    [index, toc, navigate],
  );

  const startMode = useCallback((m: Mode, nodeId?: string) => {
    const s = useStudy.getState();
    if (nodeId) s.goto(nodeId, "click");
    s.setMode(m);
  }, []);

  const handlers = useMemo<TextHandlers>(
    () => ({
      onDiagramRef,
      onTrain: (id) => startMode("guess", id),
      onPlay: (id) => startMode("play", id),
    }),
    [onDiagramRef, startMode],
  );

  return (
    <div className="flex h-dvh flex-col">
      <TopBar toc={toc} sectionId={sectionId} onModeChange={(m) => startMode(m)} />
      <div className="flex min-h-0 flex-1">
        <AnimatePresence initial={false}>
          {tocOpen && toc && (
            <motion.aside
              key="toc"
              className="toc-rail"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 301, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <TocRail toc={toc} current={sectionId} />
            </motion.aside>
          )}
        </AnimatePresence>
        <main className="reader">
          <section className="board-col" aria-label="Board">
            {index && mode === "read" && <ReadPanel index={index} />}
            {index && mode === "guess" && <GuessPanel key={session} index={index} />}
            {index && mode === "play" && (
              <Suspense fallback={null}>
                <PlayPanel key={session} index={index} />
              </Suspense>
            )}
          </section>
          <div ref={scroller} className="text-col" tabIndex={-1}>
            <article className="page">
              {error && <p className="text-[var(--danger)]">{error}</p>}
              {section && index && (
                <>
                  <header className="mb-8">
                    <p className="smallcaps text-sm text-[var(--accent)]">page {section.page}</p>
                    <h1 className={`section-title level-${section.level}`}>{section.title}</h1>
                  </header>
                  {mode === "guess" ? (
                    <GuessText index={index} handlers={handlers} />
                  ) : (
                    <SectionText index={index} handlers={handlers} />
                  )}
                  <div ref={endRef} />
                  <nav className="section-nav">
                    {section.prev ? (
                      <Link to={`/read/${section.prev}`}>← Previous section</Link>
                    ) : (
                      <span />
                    )}
                    {section.next && <Link to={`/read/${section.next}`}>Next section →</Link>}
                  </nav>
                </>
              )}
            </article>
          </div>
        </main>
      </div>
    </div>
  );
}
