"""Build the hypothetical positions the text talks about ("if the king were on c6",
"moved one file to the left") from a diagram, for overrides.json.

A placement is the board part of a FEN. Edits are short strings:
  "K@c6"   move the (unique) white king to c6; lower case for Black ("r@b2")
  "+Rd6"   add a white rook on d6
  "-e4"    empty the square e4
  "K<>B"   swap the white king and the (unique) white bishop
"""
from __future__ import annotations

FILES = "abcdefgh"


def to_grid(placement: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for r, row in enumerate(placement.split("/")):
        f = 0
        for ch in row:
            if ch.isdigit():
                f += int(ch)
            else:
                out[FILES[f] + str(8 - r)] = ch
                f += 1
    return out


def from_grid(grid: dict[str, str]) -> str:
    rows = []
    for rank in range(8, 0, -1):
        row, run = "", 0
        for f in FILES:
            p = grid.get(f + str(rank))
            if p:
                row += (str(run) if run else "") + p
                run = 0
            else:
                run += 1
        rows.append(row + (str(run) if run else ""))
    return "/".join(rows)


def _unique(grid: dict[str, str], piece: str) -> str:
    squares = [sq for sq, p in grid.items() if p == piece]
    if len(squares) != 1:
        raise ValueError(f"{piece!r} is not unique on the board ({squares})")
    return squares[0]


def apply_edits(placement: str, edits: list[str]) -> str:
    grid = to_grid(placement)
    for e in edits:
        if e.startswith("-"):
            grid.pop(e[1:], None)
        elif e.startswith("+"):
            grid[e[2:]] = e[1]
        elif "<>" in e:
            a, b = e.split("<>")
            sa, sb = _unique(grid, a), _unique(grid, b)
            grid[sa], grid[sb] = b, a
        elif "@" in e:
            piece, sq = e.split("@")
            grid.pop(_unique(grid, piece))
            grid[sq] = piece
        else:
            raise ValueError(f"bad edit {e!r}")
    return from_grid(grid)


def shift(placement: str, files: int = 0, ranks: int = 0) -> str:
    """The same position moved across the board; raises if a piece would fall off."""
    out = {}
    for sq, p in to_grid(placement).items():
        f, r = FILES.index(sq[0]) + files, int(sq[1]) + ranks
        if not (0 <= f < 8 and 1 <= r <= 8):
            raise ValueError(f"{p} on {sq} falls off the board")
        out[FILES[f] + str(r)] = p
    return from_grid(out)


def build(spec: dict, base_placement: str | None) -> str:
    """Placement for an overrides.json "positions" entry."""
    if "fen" in spec:
        return spec["fen"].split(" ")[0]
    if base_placement is None:
        raise ValueError("no base position")
    place = base_placement
    if "shift" in spec:
        place = shift(place, *spec["shift"])
    if "edit" in spec:
        place = apply_edits(place, spec["edit"])
    return place
