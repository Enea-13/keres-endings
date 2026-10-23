"""The demo source format (demo/endings.txt) and its build through the Builder."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from build import Builder  # noqa: E402
from demo import DEMO, parse, runs  # noqa: E402

SRC = """
# 1 Pawn Endings

## The square

[diagram 2: k7/8/8/8/2p5/6K1/8/8]
> **R. Réti**, 1921

With White to move, **1 ♔f3 c3 2 ♔e2** and *the king* is in time.

| 1 | ... | c3 |
@position {"match": "king on h3", "base": 2, "edit": ["K@h3"], "note": "h3"}
With the king on h3: 1 ♔g3 c3.
"""


def test_runs_bold_and_italic():
    assert runs("a **b** *c*") == [
        {"t": "a ", "b": False, "i": False},
        {"t": "b", "b": True, "i": False},
        {"t": " ", "b": False, "i": False},
        {"t": "c", "b": False, "i": True},
    ]


def test_parse_shapes():
    stream, diagrams, hyp = parse(SRC)
    assert [o["title"] for o in stream["outline"]] == ["1 Pawn Endings", "The square"]
    kinds = [(e["type"], e.get("align"), e["page"]) for e in stream["elements"]]
    assert kinds == [("heading", None, 0), ("heading", None, 1), ("diagram", None, 1),
                     ("p", "center", 1), ("p", "left", 1), ("row", None, 1), ("p", "left", 1)]
    assert stream["elements"][5] == {"type": "row", "num": 1, "white": "...", "black": "c3", "page": 1}
    assert diagrams["2"]["positions"][0]["placement"] == "k7/8/8/8/2p5/6K1/8/8"
    assert hyp == [{"match": "king on h3", "base": 2, "edit": ["K@h3"], "note": "h3", "page": 2}]


def test_demo_links_every_move():
    b = Builder(*parse((DEMO / "endings.txt").read_text()))
    b.run()
    assert b.report["failed"] == [] and b.report["partial"] == []
    assert b.report["moves"]["anchored"] == b.report["moves"]["total"] > 0
