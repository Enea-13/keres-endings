"""Tokeniser and anchoring tests on small synthetic positions (no book text needed)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from notation import Book, row_sequence, scan_sequences, to_uci_san  # noqa: E402


def seqs(text, bold_spans=()):
    bold = [False] * len(text)
    for a, b in bold_spans:
        for i in range(a, min(b, len(text))):
            bold[i] = True
    return scan_sequences(text, bold)


def test_figurines_promotion_castling_annotations():
    assert to_uci_san("♔xd4!") == "Kxd4"
    assert to_uci_san("b8♕+") == "b8=Q+"
    assert to_uci_san("exf8♘") == "exf8=N"
    assert to_uci_san("0-0-0") == "O-O-O"
    assert to_uci_san("♖a1?!") == "Ra1"


def test_sequence_needs_a_move_number():
    assert seqs("the rook on a1 and the king on d4") == []
    (s,) = seqs("by 1 ♔d4 ♖d7+ 2 ♔c5 etc.")
    assert [m.text for m in s.moves] == ["♔d4", "♖d7+", "♔c5"]
    assert [(m.num, m.color) for m in s.moves] == [(1, "w"), (1, "b"), (2, "w")]


def test_black_start_and_restated_number():
    (s,) = seqs("as 1 ... ♔d6+ loses")
    assert (s.moves[0].num, s.moves[0].color) == (1, "b")
    (s,) = seqs("2 ♔d4 2 ... ♔e6 3 ♔c5")
    assert [m.color for m in s.moves] == ["w", "b", "w"]


def test_numbering_break_starts_new_sequence():
    a, b = seqs("2 ... ♗b2 2 ... ♗a1 3 ♕a7")
    assert [m.text for m in a.moves] == ["♗b2"]
    assert [m.text for m in b.moves] == ["♗a1", "♕a7"]


def test_punctuation_ends_sequence():
    (s,) = seqs("after 1 ♔d5 ♔c7 2 ♔c5, Black plays")
    assert len(s.moves) == 3


def test_row_with_both_moves_in_one_cell():
    s = row_sequence({"num": 4, "white": "♕d6+ ♔b2", "black": None})
    assert [(m.color, m.text) for m in s.moves] == [("w", "♕d6+"), ("b", "♔b2")]
    s = row_sequence({"num": 7, "white": "♔f4 draws.", "black": None})
    assert [m.text for m in s.moves] == ["♔f4"]
    s = row_sequence({"num": 1, "white": "...", "black": "f4!"})
    assert [(m.color, m.text) for m in s.moves] == [("b", "f4!")]


KRK = [{"id": "1", "label": None, "placement": "K7/8/8/3k4/8/8/8/R7"}]


def book_with_diagram(rows=None):
    book = Book()
    book.start_section("s")
    first = row_sequence(rows[0]) if rows else None
    book.diagram(1, KRK, first, bold_main=True)
    return book


def test_side_to_move_from_first_line_and_alt_root():
    book = book_with_diagram()
    (s,) = seqs("1 ♔b7 ♔e4 2 ♔c6", [(0, 16)])
    a = book.anchor(s)
    u = book.units["1"]
    assert len(a.nodes) == 3 and a.nodes[0].parent is u.root
    assert u.root.fen.split()[1] == "w" and all(n.main for n in a.nodes)
    # "1 ... ♔e5" would simply be an alternative to 1...♔e4; but ♔c6 is impossible after
    # 1 ♔b7, so it can only start from the diagram with Black to move
    (s,) = seqs("1 ... ♔c6 2 ♖a5")
    a = book.anchor(s)
    assert a.nodes and a.nodes[0].parent is u.alt


def test_alternative_and_nested_variation():
    book = book_with_diagram()
    (main,) = seqs("1 ♔b7 ♔e4 2 ♔c6 ♔d4 3 ♖e1", [(0, 30)])
    book.anchor(main)
    (alt,) = seqs("or 2 ... ♔e5 3 ♖e1+")
    a = book.anchor(alt)
    assert a.nodes[0].parent.san == "Kc6"  # sibling of 2...Kd4
    (sub,) = seqs("or here 3 ♔c5")
    b = book.anchor(sub)
    assert b.nodes[0].parent is a.nodes[0]  # continues the variation just given


def test_implied_move_becomes_a_pass():
    book = book_with_diagram()
    (main,) = seqs("1 ♔b7 ♔e4", [(0, 10)])
    book.anchor(main)
    # "threatening 2 ♖a4+" after 1...Ke4 is White's move 2; but "and 2 ... ♔d3" skips White's
    (s,) = seqs("and 2 ... ♔d3")
    a = book.anchor(s)
    assert a.nodes and a.nodes[0].parent.implied


def test_checkpoint_diagram_joins_the_line():
    book = book_with_diagram()
    (main,) = seqs("1 ♔b7 ♔e4", [(0, 10)])
    nodes = book.anchor(main).nodes
    hit, units = book.diagram(2, [{"id": "2", "label": None, "placement": nodes[-1].placement}], None, True)
    assert hit is nodes[-1] and units == []


def test_illegal_sequence_fails():
    book = book_with_diagram()
    (s,) = seqs("1 ♕h5 ♔e4")  # there is no queen
    assert book.anchor(s).how == "failed"


def test_bracketed_alternatives_are_part_of_the_move():
    s, _ = seqs("for 3 ♕b6(a6)+ allows 4 ♕d6+")
    assert s.moves[0].text == "♕b6(a6)+"
    assert to_uci_san("♕b6(a6)+") == "Qb6+"
    (s,) = seqs("11 c6(+) wins")
    assert to_uci_san(s.moves[0].text) == "c6"


def test_printed_check_must_be_a_check():
    book = book_with_diagram()
    (s,) = seqs("1 ♖a4+")  # a legal rook move, but it gives no check
    assert book.anchor(s).how == "failed"
    (s,) = seqs("1 ♖d1+")
    assert book.anchor(s).nodes


def test_skipped_reply_to_a_check_is_filled_in():
    book = book_with_diagram()
    (main,) = seqs("1 ♖d1+ ♔e4", [(0, 12)])
    book.anchor(main)
    # "2 ♖e1+ followed by 3 ♖e2": Black's reply to the check is not printed
    (a,) = seqs("2 ♖e1+")
    book.anchor(a)
    (b,) = seqs("followed by 3 ♖e2")
    got = book.anchor(b)
    reply = got.nodes[0].parent
    assert reply.implied and reply.san != "--" and reply.parent.san == "Re1+"


def test_resume_after_brackets():
    book = book_with_diagram()
    (main,) = seqs("1 ♔b7 ♔e4 2 ♔c6", [(0, 17)])
    m = book.anchor(main).nodes
    (aside,) = seqs("(or 2 ♖a4+ ♔e5)")
    book.anchor(aside)
    # "2 ... ♔d4" resumes the line before the brackets, not the aside
    (back,) = seqs("2 ... ♔d4")
    got = book.anchor(back, prefer=m[-1])
    assert got.nodes[0].parent is m[-1] and got.how == "resume"


def test_hypothetical_position_takes_the_lines_after_it():
    book = book_with_diagram()
    v = book.virtual("v1-1", "8/8/8/3k4/8/8/8/R5K1", "white king on g1", 1, "w")
    (s,) = seqs("1 ♔f2 ♔e4")  # also legal from the diagram, but the text means the variant
    got = book.anchor(s, virtual=v)
    assert got.nodes[0].parent is v.root and got.how.startswith("virtual")
