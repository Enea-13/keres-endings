"""Hypothetical positions built for overrides.json."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from positions import apply_edits, build, shift  # noqa: E402

D81 = "8/8/3p1k2/3P4/4PK2/8/8/8"


def test_move_unique_pieces():
    assert apply_edits(D81, ["K@f2", "k@g6"]) == "8/8/3p2k1/3P4/4P3/8/5K2/8"


def test_add_clear_and_swap():
    assert apply_edits("8/8/8/8/8/8/8/K6k", ["+Rd6", "-h1"]) == "8/8/3R4/8/8/8/8/K7"
    assert apply_edits("5k2/6p1/4K1P1/5B2/8/8/8/8", ["K<>B"]) == "5k2/6p1/4B1P1/5K2/8/8/8/8"


def test_ambiguous_move_is_an_error():
    with pytest.raises(ValueError):
        apply_edits("8/8/8/8/8/8/PP6/K6k", ["P@a4"])


def test_shift_and_falling_off():
    assert shift("8/8/8/8/6kp/8/5KPP/8", 0, 3) == "8/6kp/8/5KPP/8/8/8/8"
    with pytest.raises(ValueError):
        shift("8/8/8/R7/8/8/8/k6K", -1, 0)


def test_build_spec():
    assert build({"fen": "8/8/p1k5/P7/1PK5/8/8/8 w - -"}, None) == "8/8/p1k5/P7/1PK5/8/8/8"
    assert build({"shift": [1, 0], "edit": ["-h1"]}, "8/8/8/8/8/8/8/K5k1") == "8/8/8/8/8/8/8/1K6"
