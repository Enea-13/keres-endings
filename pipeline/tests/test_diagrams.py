"""Board sanity checks and the splitting of two-position diagrams."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from diagrams import placement, sanity, split_side_by_side  # noqa: E402


def grid(fen):
    out = []
    for row in fen.split("/"):
        r = []
        for ch in row:
            r += ["."] * int(ch) if ch.isdigit() else [ch]
        out.append(r)
    return out


def test_placement_roundtrip():
    fen = "8/2k5/P7/1P6/3p1Pp1/8/3K4/8"
    assert placement(grid(fen)) == fen


def test_sanity_flags_bad_boards():
    assert sanity(grid("4k3/8/8/8/8/8/8/4K3")) == []
    assert "pawn on back rank" in sanity(grid("4k2P/8/8/8/8/8/8/4K3"))
    assert "0 black kings" in sanity(grid("8/8/8/8/8/8/8/4K3"))


def test_split_side_by_side():
    parts = split_side_by_side(grid("3k2k1/8/2PK2KP/8/8/8/8/8"))
    assert [p[1] for p in parts] == ["left", "right"]
    assert placement(parts[0][0]) == "3k4/8/2PK4/8/8/8/8/8"
    assert placement(parts[1][0]) == "6k1/8/6KP/8/8/8/8/8"


def test_split_top_and_bottom():
    # diagram 18: one position above the other; a file cut would put c2 on the wrong side
    parts = split_side_by_side(grid("1k6/8/1K6/1P6/3k4/8/2PK4/8"))
    assert [p[1] for p in parts] == ["top", "bottom"]
    assert placement(parts[1][0]) == "8/8/8/8/3k4/8/2PK4/8"


def test_single_position_is_not_split():
    parts = split_side_by_side(grid("4k3/8/8/8/8/8/8/4K3"))
    assert len(parts) == 1 and parts[0][1] is None
