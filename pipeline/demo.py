"""The public demo: five classic endgame positions with commentary written for this
repository, in the book's figurine notation. demo/endings.txt goes through the same Builder
as the book, so its moves are linked to positions exactly as the book's are.

    python demo.py      writes demo/build/content/, which `vite build --mode demo` serves

endings.txt, line by line (a blank line ends a paragraph):
  # 1 Chapter, ## Section        headings (the chapter number starts the section ids)
  [diagram 3: <placement>]       a diagram and the position it shows
  > caption                      a centred line; right under a diagram it is its caption
  | 1 | ♔g7 | h4 |                a main-line table row ("..." for a missing White move)
  @position {...}                a hypothetical position for the next paragraph, as in
                                 overrides.json "positions" (its page is filled in)
  anything else                  paragraph text; **bold** marks the main line, *italic*
"""
from __future__ import annotations

import json
import re
import sys

from build import Builder
from config import PROJECT

DEMO = PROJECT / "demo"
OUT = DEMO / "build"
META = {"title": "Classic Endgames", "author": "Demo edition"}

HEADING_RE = re.compile(r"(#{1,4}) (.+)")
DIAGRAM_RE = re.compile(r"\[diagram (\d+): ([1-8KQRBNPkqrbnp/]+)\]")
ROW_RE = re.compile(r"\|\s*(\d+)\s*\|([^|]*)\|([^|]*)\|")
STYLE_RE = re.compile(r"(\*\*.+?\*\*|\*.+?\*)")


def runs(text: str) -> list[dict]:
    out = []
    for part in STYLE_RE.split(text):
        if not part:
            continue
        bold = part.startswith("**")
        ital = not bold and part.startswith("*")
        out.append({"t": part[2:-2] if bold else part[1:-1] if ital else part, "b": bold, "i": ital})
    return out


def parse(src: str) -> tuple[dict, dict, list[dict]]:
    """endings.txt -> (stream, diagrams, hypothetical positions), in the shapes that
    extract.py, diagrams.py and overrides.json give the Builder. Each heading starts a page."""
    outline: list[dict] = []
    elements: list[dict] = []
    diagrams: dict[str, dict] = {}
    hypotheticals: list[dict] = []
    para: list[str] = []
    page = 0

    def flush() -> None:
        if para:
            elements.append({"type": "p", "align": "left", "runs": runs(" ".join(para)), "page": page})
            para.clear()

    for line in src.splitlines():
        line = line.strip()
        if not line:
            flush()
        elif m := HEADING_RE.fullmatch(line):
            flush()
            page = len(outline)
            outline.append({"title": m[2], "level": len(m[1]), "page": page})
            elements.append({"type": "heading", "outline": page, "title": m[2],
                             "level": len(m[1]), "page": page})
        elif m := DIAGRAM_RE.fullmatch(line):
            flush()
            n = int(m[1])
            diagrams[str(n)] = {"positions": [{"id": str(n), "label": None, "placement": m[2],
                                               "issues": []}], "weak": []}
            elements.append({"type": "diagram", "n": n, "page": page})
        elif line.startswith("> "):
            flush()
            elements.append({"type": "p", "align": "center", "runs": runs(line[2:]), "page": page})
        elif m := ROW_RE.fullmatch(line):
            flush()
            elements.append({"type": "row", "num": int(m[1]), "white": m[2].strip() or None,
                             "black": m[3].strip() or None, "page": page})
        elif line.startswith("@position "):
            flush()
            hypotheticals.append({**json.loads(line[len("@position "):]), "page": page + 1})
        else:
            para.append(line)
    flush()
    return {"outline": outline, "elements": elements}, diagrams, hypotheticals


def main() -> None:
    stream, diagrams, hypotheticals = parse((DEMO / "endings.txt").read_text())
    b = Builder(stream, diagrams, hypotheticals)
    b.run()
    b.write(OUT / "content", build=OUT, meta=META)
    rep = b.report
    if rep["failed"] or rep["partial"] or rep["unanchored_units"]:
        sys.exit(f"demo: some moves are not linked to a position, see {OUT / 'report.json'}")


if __name__ == "__main__":
    main()
