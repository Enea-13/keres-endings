import { useEffect, useState } from "react";
import { fetchToc } from "../content/api";
import type { Toc, TocEntry } from "../content/types";

let cached: Toc | null = null;

export function useToc(): Toc | null {
  const [toc, setToc] = useState<Toc | null>(cached);
  useEffect(() => {
    if (cached) return;
    fetchToc().then((t) => {
      cached = t;
      setToc(t);
    });
  }, []);
  return toc;
}

export function flatten(entries: TocEntry[], out: TocEntry[] = []): TocEntry[] {
  for (const e of entries) {
    out.push(e);
    flatten(e.children, out);
  }
  return out;
}

/** Section that prints diagram n. */
export function sectionOfDiagram(toc: Toc, n: number): string | null {
  for (const e of flatten(toc.toc)) if (e.diagrams && e.diagrams[0] <= n && n <= e.diagrams[1]) return e.id;
  return null;
}

/** Chapter (level-1 entry) containing a section, plus the path of titles to it. */
export function trail(toc: Toc, id: string): TocEntry[] {
  const walk = (entries: TocEntry[], path: TocEntry[]): TocEntry[] | null => {
    for (const e of entries) {
      if (e.id === id) return [...path, e];
      const found = walk(e.children, [...path, e]);
      if (found) return found;
    }
    return null;
  };
  return walk(toc.toc, []) ?? [];
}

/** Display title without the "A:" / "a)" prefixes for breadcrumbs. */
export function shortTitle(title: string): string {
  return title.replace(/^([A-E]:|[a-e]\))\s*/, "").replace(/^\d+ /, "");
}
