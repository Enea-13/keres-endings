import { describe, expect, it } from "vitest";
import { SectionIndex } from "../content/tree";
import type { Section } from "../content/types";
import { accuracy, autoAdvance, guess, hint, isDone, reveal, startGuess, userMoveCount } from "./guessLogic";

// K+R v K, diagram 2: 1 Kb7 Ke4 2 Kc6 (main) with the alternative 1 Ra4 for White
const FEN0 = "K7/8/8/3k4/8/8/8/R7 w - - 0 1";
const section: Section = {
  id: "t",
  title: "t",
  level: 2,
  page: 1,
  prev: null,
  next: null,
  blocks: [
    { type: "diagram", n: 2, page: 1, units: [{ id: "2", label: null }] },
    {
      type: "p",
      page: 1,
      runs: [
        { t: "♔b7", m: "2.1", b: 1 },
        { t: " " },
        { t: "♔e4", m: "2.2", b: 1 },
        { t: " " },
        { t: "♔c6", m: "2.3", b: 1 },
      ],
    },
  ],
  units: {
    "2": {
      id: "2",
      n: 2,
      label: null,
      section: "t",
      root: "2",
      alt: null,
      nodes: {
        "2": { f: FEN0, c: ["2.1", "2.4"] },
        "2.1": { f: "8/1K6/8/3k4/8/8/8/R7 b - - 1 1", c: ["2.2"], p: "2", s: "Kb7", m: 1 },
        "2.2": { f: "8/1K6/8/8/4k3/8/8/R7 w - - 2 2", c: ["2.3"], p: "2.1", s: "Ke4", m: 1 },
        "2.3": { f: "8/8/2K5/8/4k3/8/8/R7 b - - 3 2", c: [], p: "2.2", s: "Kc6", m: 1 },
        "2.4": { f: "K7/8/8/3k4/R7/8/8/8 b - - 1 1", c: [], p: "2", s: "Ra4" },
      },
    },
  },
};

const index = new SectionIndex(section);

describe("SectionIndex", () => {
  it("indexes nodes with move numbers and the main line", () => {
    expect(index.get("2.2")?.moveNo).toBe(1);
    expect(index.get("2.2")?.color).toBe("b");
    expect(index.mainLine("2")).toEqual(["2", "2.1", "2.2", "2.3"]);
    expect(index.stops).toEqual([{ n: 2, label: null, node: "2", block: 0 }]);
    expect(index.chipFor("2.3")).toBe("2.3");
    expect(index.stopIndexFor("2.3")).toBe(0);
  });
});

describe("guess the moves", () => {
  it("accepts the main-line move and lets the book reply", () => {
    let s = startGuess(index, "2");
    expect(s.user).toBe("w");
    expect(userMoveCount(index, s)).toBe(2);
    s = guess(index, s, "a8b7");
    expect(s.feedback?.kind).toBe("correct");
    expect(s.pos).toBe(1);
    s = autoAdvance(index, s); // Black's reply is played for the reader
    expect(s.pos).toBe(2);
    s = guess(index, s, "b7c6");
    expect(isDone(s)).toBe(true);
    expect(accuracy(index, s)).toBe(1);
  });

  it("recognises a move the book discusses but does not recommend", () => {
    const s = guess(index, startGuess(index, "2"), "a1a4");
    expect(s.feedback).toEqual({ kind: "variation", node: "2.4" });
    expect(s.pos).toBe(0);
    expect(s.mistakes).toBe(1);
  });

  it("rejects other moves, and hints/reveals cost the first-try credit", () => {
    let s = guess(index, startGuess(index, "2"), "a1h1");
    expect(s.feedback?.kind).toBe("wrong");
    s = hint(s);
    expect(s.hints).toBe(1);
    s = guess(index, s, "a8b7");
    expect(s.firstTry).toBe(0);
    s = reveal(autoAdvance(index, s));
    expect(s.feedback?.kind).toBe("revealed");
    expect(isDone(s)).toBe(true);
    expect(accuracy(index, s)).toBe(0);
  });
});

describe("hypothetical positions and implied moves", () => {
  const withVirtual: Section = {
    ...section,
    blocks: [
      ...section.blocks,
      { type: "p", page: 1, runs: [{ t: "♔b8", m: "v1-1.1" }] },
    ],
    units: {
      ...section.units,
      "v1-1": {
        id: "v1-1",
        n: 2,
        label: null,
        section: "t",
        root: "v1-1",
        alt: null,
        note: "Diagram 2 with the white king on a7",
        nodes: {
          "v1-1": { f: "8/K7/8/3k4/8/8/8/R7 w - - 0 1", c: ["v1-1.1"] },
          "v1-1.1": { f: "1K6/8/8/3k4/8/8/8/R7 b - - 1 1", c: ["v1-1.2"], p: "v1-1", s: "Kb8" },
          "v1-1.2": { f: "1K6/8/3k4/8/8/8/8/R7 w - - 2 2", c: [], p: "v1-1.1", s: "Kd6", i: 1 },
        },
      },
    },
  };
  const idx = new SectionIndex(withVirtual);

  it("navigates from a hypothetical position back to the diagram it came from", () => {
    expect(idx.stopIndexFor("v1-1.1")).toBe(0);
    expect(idx.spanOf("v1-1")).toEqual([2, 3]);
  });

  it("marks a reply the text leaves out as implied, and plays it for the reader", () => {
    expect(idx.get("v1-1.2")?.implied).toBe(true);
    let s = startGuess(idx, "v1-1");
    s = guess(idx, s, "a7b8");
    expect(s.feedback?.kind).toBe("correct");
    s = autoAdvance(idx, s);
    expect(isDone(s)).toBe(true);
  });
});
