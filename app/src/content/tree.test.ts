import { describe, expect, it } from "vitest";
import { fullmoveOf, lastMoveSquares, moveNumberLabel, SectionIndex, turnOf } from "./tree";
import type { Section } from "./types";

// Diagram 1 (K+P v K, Black to move) with the White-to-move line on its alt root, a reply the
// text leaves out ("1 ♔d6 followed by 2 e6"), and a hypothetical position built from it.
// Diagram 2 carries its main line on the alt root only.
const B = "4k3/8/4K3/4P3/8/8/8/8 b - - 0 1";
const W = "4k3/8/4K3/4P3/8/8/8/8 w - - 0 1";
const KD6 = "4k3/8/3K4/4P3/8/8/8/8";

const section: Section = {
  id: "t",
  title: "t",
  level: 2,
  page: 1,
  prev: null,
  next: null,
  blocks: [
    { type: "diagram", n: 1, page: 1, units: [{ id: "1", label: null }] },
    { type: "p", page: 1, runs: [{ t: "♔f8", m: "1.1", b: 1 }, { t: " " }, { t: "♔d7", m: "1.2", b: 1 }] },
    { type: "p", page: 1, runs: [{ t: "♔d6", m: "1.4" }, { t: " followed by " }, { t: "e6", m: "1.6" }] },
    { type: "p", page: 1, runs: [{ t: "e6", m: "v.1" }] },
    { type: "diagram", n: 2, page: 2, units: [{ id: "2", label: null }] },
    { type: "p", page: 2, runs: [{ t: "♔f8", m: "2.1", b: 1 }, { t: " " }, { t: "♔d6", m: "2.2" }] },
  ],
  units: {
    "1": {
      id: "1",
      n: 1,
      label: null,
      section: "t",
      root: "1",
      alt: "1~",
      nodes: {
        "1": { f: B, c: ["1.1"] },
        "1.1": { f: "5k2/8/4K3/4P3/8/8/8/8 w - - 1 2", c: ["1.2"], p: "1", s: "Kf8", m: 1 },
        "1.2": { f: "5k2/3K4/8/4P3/8/8/8/8 b - - 2 2", c: ["1.3"], p: "1.1", s: "Kd7", m: 1 },
        "1.3": { f: "8/3K1k2/8/4P3/8/8/8/8 w - - 3 3", c: [], p: "1.2", s: "Kf7", m: 1 },
        "1~": { f: W, c: ["1.4"] },
        "1.4": { f: `${KD6} b - - 1 1`, c: ["1.5"], p: "1~", s: "Kd6" },
        "1.5": { f: `${KD6} w - - 2 2`, c: ["1.6"], p: "1.4", s: "--" },
        "1.6": { f: "4k3/8/3KP3/8/8/8/8/8 b - - 0 2", c: [], p: "1.5", s: "e6" },
      },
    },
    v: {
      id: "v",
      n: 1,
      label: null,
      section: "t",
      root: "v",
      alt: null,
      note: "Diagram 1 with the white king on d6",
      nodes: {
        v: { f: `${KD6} w - - 0 1`, c: ["v.1"] },
        "v.1": { f: "4k3/8/3KP3/8/8/8/8/8 b - - 0 1", c: [], p: "v", s: "e6", m: 1 },
      },
    },
    "2": {
      id: "2",
      n: 2,
      label: null,
      section: "t",
      root: "2",
      alt: "2~",
      nodes: {
        "2": { f: W, c: ["2.2"] },
        "2.2": { f: `${KD6} b - - 1 1`, c: [], p: "2", s: "Kd6" },
        "2~": { f: B, c: ["2.1"] },
        "2.1": { f: "5k2/8/4K3/4P3/8/8/8/8 w - - 1 2", c: [], p: "2~", s: "Kf8", m: 1 },
      },
    },
  },
};

const index = new SectionIndex(section);

describe("SectionIndex nodes", () => {
  it("numbers moves from the position they were played in", () => {
    expect(index.get("1.1")).toMatchObject({ moveNo: 1, color: "b", ply: 1, main: true, isAlt: false });
    expect(index.get("1.2")).toMatchObject({ moveNo: 2, color: "w", ply: 2 });
    expect(moveNumberLabel(index.get("1.1")!)).toBe("1…");
    expect(moveNumberLabel(index.get("1.2")!)).toBe("2.");
  });

  it("marks alt-root lines and moves the text leaves out", () => {
    expect(index.get("1~")).toMatchObject({ isRoot: true, isAlt: true, unit: "1" });
    expect(index.get("1.4")?.isAlt).toBe(true);
    expect(index.get("1.5")).toMatchObject({ implied: true, san: "--" });
  });

  it("reads the side to move and move number from a FEN", () => {
    expect(turnOf(B)).toBe("b");
    expect(turnOf(W)).toBe("w");
    expect(fullmoveOf("5k2/8/4K3/4P3/8/8/8/8 w - - 1 2")).toBe(2);
  });
});

describe("SectionIndex lines", () => {
  it("walks paths and lines", () => {
    expect(index.path("1.3")).toEqual(["1", "1.1", "1.2", "1.3"]);
    expect(index.path("1.6")).toEqual(["1~", "1.4", "1.5", "1.6"]);
    expect(index.lineFrom("1.1")).toEqual(["1.1", "1.2", "1.3"]);
  });

  it("finds the main line on the root, or on the alt root when only it has one", () => {
    expect(index.mainLine("1")).toEqual(["1", "1.1", "1.2", "1.3"]);
    expect(index.mainLine("2")).toEqual(["2~", "2.1"]);
    expect(index.mainLine("missing")).toEqual([]);
  });
});

describe("SectionIndex text links", () => {
  it("has one stop per diagram", () => {
    expect(index.stops).toEqual([
      { n: 1, label: null, node: "1", block: 0 },
      { n: 2, label: null, node: "2", block: 4 },
    ]);
  });

  it("maps nodes to the diagram they belong to", () => {
    expect(index.stopIndexFor("1.3")).toBe(0);
    expect(index.stopIndexFor("2.1")).toBe(1); // alt line: the unit's own diagram
    expect(index.stopIndexFor("v.1")).toBe(0); // hypothetical: the diagram it was built from
    expect(index.stopIndexFor("nope")).toBe(-1);
  });

  it("falls back to the nearest move printed in the text", () => {
    expect(index.chipFor("1.3")).toBe("1.2");
    expect(index.chipFor("1.5")).toBe("1.4");
    expect(index.chipBlock.get("1.6")).toBe(2);
  });

  it("spans a unit's blocks up to the next diagram, or its own moves without one", () => {
    expect(index.spanOf("1")).toEqual([0, 4]);
    expect(index.spanOf("2")).toEqual([4, 6]);
    expect(index.spanOf("v")).toEqual([3, 4]);
  });
});

describe("lastMoveSquares", () => {
  it("returns the squares of a played move only", () => {
    expect(lastMoveSquares(index, index.get("1.6")!)).toEqual(["e5", "e6"]);
    expect(lastMoveSquares(index, index.get("1.1")!)).toEqual(["e8", "f8"]);
    expect(lastMoveSquares(index, index.get("1.5")!)).toBeNull(); // implied
    expect(lastMoveSquares(index, index.get("1")!)).toBeNull(); // root
  });
});
