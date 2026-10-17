import type { QaData, Section, Toc } from "./types";

const BASE = "/content";
const cache = new Map<string, Promise<unknown>>();

function load<T>(path: string): Promise<T> {
  let p = cache.get(path);
  if (!p) {
    p = fetch(`${BASE}/${path}`).then((r) => {
      if (!r.ok) throw new Error(`${path}: ${r.status}`);
      return r.json();
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p as Promise<T>;
}

export const fetchToc = () => load<Toc>("toc.json");
export const fetchSection = (id: string) => load<Section>(`sections/${id}.json`);
export const fetchQa = () => load<QaData>("qa.json");

/** Warm the cache for a section the reader is likely to open next. */
export function prefetchSection(id: string | null | undefined): void {
  if (!id || cache.has(`sections/${id}.json`)) return;
  const run = () => void fetchSection(id).catch(() => {});
  if ("requestIdleCallback" in window) requestIdleCallback(run, { timeout: 2000 });
  else setTimeout(run, 300);
}
