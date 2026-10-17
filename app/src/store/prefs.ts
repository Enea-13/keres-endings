import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemePref = "light" | "dark" | "system";
export type BoardStyle = "wood" | "print" | "slate";

export interface GuessScore {
  best: number; // best accuracy 0..1
  attempts: number;
  last: number; // timestamp
}

interface Prefs {
  theme: ThemePref;
  board: BoardStyle;
  sound: boolean;
  coordinates: boolean;
  followReading: boolean;
  engineElo: number | null; // null = full strength
  tocOpen: boolean;
  // progress
  visited: Record<string, number>; // section id -> last visit
  completed: Record<string, true>; // section id -> read to the end
  studied: Record<number, true>; // diagram numbers looked at on the board
  guess: Record<string, GuessScore>; // unit id -> score
  last: { section: string; node?: string } | null;

  set: (p: Partial<Omit<Prefs, "set" | "markStudied" | "recordGuess" | "visit" | "setLast" | "complete">>) => void;
  visit: (section: string) => void;
  setLast: (section: string, node?: string) => void;
  complete: (section: string) => void;
  markStudied: (n: number) => void;
  recordGuess: (unit: string, accuracy: number) => void;
}

export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      theme: "system",
      board: "wood",
      sound: true,
      coordinates: true,
      followReading: true,
      engineElo: null,
      tocOpen: true,
      visited: {},
      completed: {},
      studied: {},
      guess: {},
      last: null,
      set: (p) => set(p),
      visit: (section) =>
        set((s) => ({ visited: { ...s.visited, [section]: Date.now() }, last: { section } })),
      setLast: (section, node) => set({ last: { section, node } }),
      complete: (section) =>
        set((s) => (s.completed[section] ? s : { completed: { ...s.completed, [section]: true } })),
      markStudied: (n) => set((s) => (s.studied[n] ? s : { studied: { ...s.studied, [n]: true } })),
      recordGuess: (unit, accuracy) =>
        set((s) => {
          const prev = s.guess[unit];
          return {
            guess: {
              ...s.guess,
              [unit]: {
                best: Math.max(prev?.best ?? 0, accuracy),
                attempts: (prev?.attempts ?? 0) + 1,
                last: Date.now(),
              },
            },
          };
        }),
    }),
    { name: "keres-prefs", version: 1 },
  ),
);

/** Resolve the theme preference and apply it to <html data-theme>. */
export function applyTheme(theme: ThemePref): void {
  const dark =
    theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
