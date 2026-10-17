"""Stage 3: book text -> move trees anchored to diagram positions.

Every diagram opens a *unit* (its root position). Every move sequence in the text
("1 ♔d4 ♖d7+ 2 ♔c5") is attached to a node of some unit: the parent position is found by
trying likely candidates in order (the line just discussed, the line in bold, the main line,
the diagram named in the sentence, ...) and keeping the first one where the moves are legal.
Main-line rows of the practical examples ("5 | ♔e2 | d3+") always extend the unit's main line.
"""
from __future__ import annotations

import itertools
import re
from dataclasses import dataclass, field

import chess

FIGURINE = {"♔": "K", "♕": "Q", "♖": "R", "♗": "B", "♘": "N", "♙": ""}
ANNOT = r"(?:!!|\?\?|!\?|\?!|!|\?)"
# "♕a3(a5)+", "c6(+)": an alternative square or check printed in brackets
ALT = r"(?:\((?:[a-h][1-8]|\+)\))?"
SAN = (r"(?:[♔♕♖♗♘KQRBN][a-h]?[1-8]?x?[a-h][1-8]"
       r"|[a-h](?:x[a-h])?[1-8](?:=?[♕♖♗♘QRBN])?"
       r"|0-0-0|0-0|O-O-O|O-O)"
       + ALT + r"(?:\+|#)?" + ALT + ANNOT + "?")
SAN_RE = re.compile(SAN)
NUM_RE = re.compile(r"(\d{1,3})(?:\s*(\.\.\.|…))?\s*(?=" + SAN + ")")
ELLIPSIS_RE = re.compile(r"(\.\.\.|…)\s*(?=" + SAN + ")")
DIAGRAM_REF_RE = re.compile(r"\b[Dd]iagrams? (\d{1,3})((?:(?:,| and| or| &|–|-) ?\d{1,3})*)")
SIDE_HINT_RE = re.compile(r"\b(left|right|top|upper|bottom|lower)\b", re.I)


# ----------------------------------------------------------------------------- tokens

@dataclass
class MoveTok:
    num: int
    color: str           # "w" / "b"
    text: str            # as printed, e.g. "♔xd4!"
    start: int           # offsets in the paragraph's flat text (or -1 for table rows)
    end: int
    bold: bool = False
    cell: str = ""       # table rows: "white" / "black" cell the move was printed in


@dataclass
class Sequence:
    moves: list[MoveTok]
    bold: bool
    main: bool = False   # table row of a practical example
    start: int = 0       # offset of the move number
    sentence_start: int = 0


def to_uci_san(tok: str) -> str:
    s = re.sub(ANNOT + "$", "", tok)
    s = re.sub(r"\([^)]*\)", "", s)
    s = "".join(FIGURINE.get(c, c) for c in s)
    s = re.sub(r"^([a-h](?:x[a-h])?[18])=?([QRBN])", r"\1=\2", s)
    return s.replace("0-0-0", "O-O-O").replace("0-0", "O-O")


def claims_check(tok: str) -> bool:
    """The printed move is marked as check or mate (a bracketed "(+)" is only a maybe)."""
    return bool(re.search(r"[+#]", re.sub(r"\([^)]*\)", "", tok)))


def annotation(tok: str) -> str:
    m = re.search(ANNOT + "$", tok)
    return m.group(0) if m else ""


def scan_sequences(text: str, bold: list[bool]) -> list[Sequence]:
    """Find move sequences in prose. A sequence must start with a move number; moves follow
    separated only by whitespace; it ends at the first word that is not a move or when the
    numbering stops making sense (which starts a new sequence: '2 ... ♗b2 2 ... ♗a1')."""
    seqs: list[Sequence] = []
    i = 0
    n = len(text)
    while i < n:
        m = NUM_RE.match(text, i)
        if not m or (i > 0 and (text[i - 1].isalnum() or text[i - 1] in ".…-/")):
            i += 1
            continue
        moves: list[MoveTok] = []
        seq_start = i
        num = int(m.group(1))
        color = "b" if m.group(2) else "w"
        j = m.end()
        while True:
            sm = SAN_RE.match(text, j)
            if not sm:
                break
            moves.append(MoveTok(num, color, sm.group(0), sm.start(), sm.end(),
                                 bold=any(bold[sm.start():sm.end()])))
            j = sm.end()
            # what comes next?
            k = j
            while k < n and text[k] == " ":
                k += 1
            if k == j and k < n and text[k] not in " ":
                break  # punctuation glued to the move ends the sequence
            if color == "w":
                # black reply without number, or "N ..." restating it
                if SAN_RE.match(text, k):
                    num, color, j = num, "b", k
                    continue
                m2 = NUM_RE.match(text, k)
                if m2 and int(m2.group(1)) == num and m2.group(2):
                    num, color, j = num, "b", m2.end()
                    continue
                break
            m2 = NUM_RE.match(text, k)
            if m2 and int(m2.group(1)) == num + 1 and not m2.group(2):
                num, color, j = num + 1, "w", m2.end()
                continue
            break
        if moves:
            sent = max(text.rfind(". ", 0, seq_start), text.rfind("; ", 0, seq_start),
                       text.rfind("? ", 0, seq_start), text.rfind("! ", 0, seq_start))
            # "." inside "1 ..." is not a sentence end; good enough for hints
            seqs.append(Sequence(moves, bold=moves[0].bold, start=seq_start,
                                 sentence_start=max(sent, 0)))
            i = moves[-1].end
        else:
            i = m.end()
    return seqs


def row_sequence(row: dict) -> Sequence | None:
    """A main-line table row. Usually one move per cell, but some rows print both moves in
    the White cell ('4 | ♕d6+ ♔b2'), and cells may carry words after the move ('wins.')."""
    white = (row["white"] or "").strip()
    color = "b" if white in ("", "...", "…") else "w"
    moves: list[MoveTok] = []
    for key in ("white", "black"):
        cell = (row[key] or "").strip()
        if cell in ("", "...", "…"):
            continue
        j = 0
        while color is not None:
            sm = SAN_RE.match(cell, j)
            if not sm:
                break
            moves.append(MoveTok(row["num"], color, sm.group(0), -1, -1, bold=True, cell=key))
            color = "b" if color == "w" else None
            j = sm.end()
            while j < len(cell) and cell[j] == " ":
                j += 1
    return Sequence(moves, bold=True, main=True) if moves else None


# ----------------------------------------------------------------------------- trees

_ids = itertools.count(1)


@dataclass(eq=False)
class Node:
    unit: "Unit"
    parent: "Node | None"
    fen: str
    nxt: tuple[int, str]                 # (move number, colour) of the next move from here
    san: str = ""
    annot: str = ""
    num: int = 0
    color: str = ""
    main: bool = False
    bold: bool = False
    implied: bool = False                # a "pass" standing for an unnamed move
    id: str = ""
    children: dict = field(default_factory=dict)   # uci -> Node
    order: int = 0

    def board(self) -> chess.Board:
        return chess.Board(self.fen)

    def path(self):
        n = self
        while n is not None:
            yield n
            n = n.parent

    @property
    def placement(self) -> str:
        return self.fen.split(" ")[0]


def next_key(num: int, color: str) -> tuple[int, str]:
    return (num, "b") if color == "w" else (num + 1, "w")


@dataclass(eq=False)
class Unit:
    id: str
    n: int
    label: str | None
    placement: str
    section: str
    root: Node | None = None
    alt: Node | None = None
    nodes: list = field(default_factory=list)
    main_end: Node | None = None
    has_rows: bool = False        # a printed main line (table rows) exists
    bold_main: bool = False       # without rows: only bold lines extend the main line
    root_known: bool = False      # side to move settled
    seq_count: int = 0
    note: str | None = None       # hypothetical position described in the text

    def make_root(self, num: int, color: str) -> None:
        fen = f"{self.placement} {color} - - 0 {num}"
        self.root = Node(self, None, fen, (num, color), id=f"{self.id}", order=next(_ids))
        self.main_end = self.root

    def alt_root(self) -> Node:
        if self.alt is None:
            num, color = self.root.nxt
            other = "b" if color == "w" else "w"
            fen = f"{self.placement} {other} - - 0 {num}"
            self.alt = Node(self, None, fen, (num, other), id=f"{self.id}~", order=next(_ids))
        return self.alt


def expand(placement: str) -> str:
    return "".join("." * int(c) if c.isdigit() else c for c in placement.replace("/", ""))


def prev_key(key: tuple[int, str]) -> tuple[int, str]:
    num, color = key
    return (num, "w") if color == "b" else (num - 1, "b")


def node_at(end: Node, key: tuple[int, str]) -> Node | None:
    for n in end.path():
        if n.nxt == key:
            return n
    return None


def legal_prefix(b: chess.Board, moves: list[MoveTok]) -> int:
    """How many of the moves can be played in order on `b` (which is left after them).
    A move printed with "+" must actually give check: that tells apart look-alike lines."""
    for k, mv in enumerate(moves):
        try:
            b.push(b.parse_san(to_uci_san(mv.text)))
        except ValueError:
            return k
        if claims_check(mv.text) and not b.is_check():
            return k
    return len(moves)


def try_play(start: Node, moves: list[MoveTok]) -> int:
    """Number of moves of the sequence that are legal from `start`."""
    if start.nxt != (moves[0].num, moves[0].color):
        return 0
    return legal_prefix(start.board(), moves)


def pass_node(start: Node) -> Node | None:
    """A child standing for 'any move' (null move), used when the text skips a move:
    'threatening 2 ... g4+', 'and 5 ... ♖f7 draws'. Not possible when in check."""
    b = start.board()
    if b.is_check():
        return None
    child = start.children.get("0000")
    if child is None:
        b.push(chess.Move.null())
        num, color = start.nxt
        child = Node(start.unit, start, b.fen(), next_key(num, color), san="--", num=num,
                     color=color, implied=True, order=next(_ids))
        child.id = f"{start.unit.id}.{len(start.unit.nodes) + 1}"
        start.children["0000"] = child
        start.unit.nodes.append(child)
    return child


def implied_node(start: Node, move: chess.Move) -> Node:
    """A real move the text leaves out because it is forced or obvious (the reply to a
    check before "followed by ..."). Shown greyed in the app."""
    child = start.children.get(move.uci())
    if child is None:
        b = start.board()
        san = b.san(move)
        b.push(move)
        num, color = start.nxt
        child = Node(start.unit, start, b.fen(), next_key(num, color), san=san, num=num,
                     color=color, implied=True, order=next(_ids))
        child.id = f"{start.unit.id}.{len(start.unit.nodes) + 1}"
        start.children[move.uci()] = child
        start.unit.nodes.append(child)
    return child


def play(start: Node, moves: list[MoveTok], *, main: bool, bold: bool) -> list[Node]:
    out = []
    node = start
    b = start.board()
    for mv in moves:
        move = b.parse_san(to_uci_san(mv.text))
        san = b.san(move)
        b.push(move)
        child = node.children.get(move.uci())
        if child is None:
            child = Node(node.unit, node, b.fen(), next_key(mv.num, mv.color), san=san,
                         annot=annotation(mv.text), num=mv.num, color=mv.color,
                         order=next(_ids))
            child.id = f"{node.unit.id}.{len(node.unit.nodes) + 1}"
            node.children[move.uci()] = child
            node.unit.nodes.append(child)
        else:
            child.implied = False  # the book names a move we had only implied
            if not child.annot:
                child.annot = annotation(mv.text)
        child.main = child.main or main
        child.bold = child.bold or bold
        out.append(child)
        node = child
    return out


# ----------------------------------------------------------------------------- anchoring

@dataclass
class Anchored:
    seq: Sequence
    nodes: list[Node]          # one per anchored move (a prefix of seq.moves)
    how: str                   # which rule found the parent (for the report)


HINTS = {"left": "left", "right": "right", "top": "top", "upper": "top",
         "bottom": "bottom", "lower": "bottom"}


class Book:
    """Streams the book's elements in order and grows the move trees."""

    def __init__(self) -> None:
        self.units: dict[str, Unit] = {}
        self.by_diagram: dict[int, list[Unit]] = {}
        self.section_units: list[Unit] = []     # units opened in this section, newest first
        self.current: list[Unit] = []           # units of the latest diagram
        self.contexts: list[tuple[Node, bool]] = []   # (line end, bold), most recent first
        self.section = ""
        self.misprints: list[dict] = []
        self._prefer: Node | None = None
        self._virtual: Unit | None = None

    # --- structure
    def start_section(self, sid: str) -> None:
        self.section = sid
        self.section_units = []
        self.current = []
        self.contexts = []

    def push_context(self, node: Node, bold: bool) -> None:
        self.contexts.insert(0, (node, bold))
        del self.contexts[16:]

    def diagram(self, n: int, positions: list[dict], first_row: Sequence | None,
                bold_main: bool) -> tuple[Node | None, list[Unit]]:
        """Register a diagram: either a checkpoint on a line already in the text (returns the
        node) or new root positions (returns the units)."""
        first_main = (first_row.moves[0].num, first_row.moves[0].color) if first_row else None
        if len(positions) == 1:
            place = positions[0]["placement"]
            hit = self.find_position(place)
            if hit is None and first_row is not None:
                hit = self.ahead_position(place, first_row)
            if hit is None and first_main is not None:
                hit = self.near_position(place, first_main)
                if hit is not None:
                    self.misprints.append({"n": n, "node": hit.id, "printed": place,
                                           "line": hit.placement})
            if hit is not None:
                self.push_context(hit, hit.bold or hit.main)
                return hit, []
        units = []
        for pos in positions:
            u = Unit(pos["id"], n, pos["label"], pos["placement"], self.section)
            num, color = first_main or (1, "w")
            u.make_root(num, color)
            u.root_known = first_main is not None
            u.bold_main = bold_main
            self.units[u.id] = u
            units.append(u)
        self.by_diagram[n] = units
        self.section_units = units + self.section_units
        self.current = units
        self.contexts = [(u.root, True) for u in units]
        return None, units

    def ahead_position(self, placement: str, row: Sequence) -> Node | None:
        """Some diagrams are printed just before the row whose move they already show."""
        key = (row.moves[0].num, row.moves[0].color)
        for u in self.current:
            end = u.main_end
            if end is None or end.nxt != key:
                continue
            b = end.board()
            for k, mv in enumerate(row.moves):
                try:
                    b.push(b.parse_san(to_uci_san(mv.text)))
                except ValueError:
                    break
                if b.board_fen() == placement:
                    nodes = play(end, row.moves[:k + 1], main=True, bold=True)
                    u.main_end = nodes[-1]
                    u.has_rows = True
                    return nodes[-1]
        return None

    def near_position(self, placement: str, first_main: tuple[int, str]) -> Node | None:
        """A diagram that differs from the main line by one or two squares while the printed
        moves carry on from there is a misprint in the book (diagram 138 shows a pawn on g4
        that the moves put on g3). Link it to the line instead of starting a new position."""
        target = expand(placement)
        for u in self.current:
            end = u.main_end
            if end is not None and end.nxt == first_main:
                diff = sum(a != b for a, b in zip(target, expand(end.placement)))
                if diff <= 2:
                    return end
        return None

    def virtual(self, uid: str, placement: str, note: str, base_n: int,
                stm: str | None = None) -> Unit:
        """A position the text only describes ("with the white king on f2 ..."), built from a
        diagram by overrides.json. Lines in that part of the text start from it."""
        if uid in self.units:
            return self.units[uid]
        u = Unit(uid, base_n, None, placement, self.section, note=note)
        u.make_root(1, stm or "w")
        u.root_known = stm is not None
        self.units[uid] = u
        return u

    def find_position(self, placement: str) -> Node | None:
        best = None
        for u in self.section_units[:6]:
            for node in itertools.chain([u.root] + ([u.alt] if u.alt else []), u.nodes):
                if node.placement == placement and (best is None or node.order > best.order):
                    best = node
        return best

    # --- anchoring
    def candidates(self, seq: Sequence, sentence_refs: list[int], para_refs: list[int],
                   hint: str | None):
        key = (seq.moves[0].num, seq.moves[0].color)
        seen: set[int] = set()

        def emit(node, how):
            if node is not None and id(node) not in seen:
                seen.add(id(node))
                yield node, how

        def ordered(units: list[Unit]) -> list[Unit]:
            if hint and len(units) == 2 and units[0].label:
                want = HINTS[hint.lower()]
                return sorted(units, key=lambda u: u.label != want)
            return units

        def roots(u: Unit, how: str):
            if u.root.nxt == key:
                yield from emit(u.root, how + ":root")
            elif not u.root_known:
                yield from emit(self._tentative_root(u, key), how + ":root?")
            elif u.root.nxt[0] == key[0]:
                yield from emit(u.alt_root(), how + ":alt-root")

        def anywhere(u: Unit, how: str):
            for node in sorted(u.nodes, key=lambda x: -x.order):
                if node.nxt == key:
                    yield from emit(node, how)

        current = ordered(self.current)
        s_units = [u for n in sentence_refs for u in ordered(self.by_diagram.get(n, []))]
        p_units = [u for n in para_refs for u in ordered(self.by_diagram.get(n, []))]

        # 1. table rows continue the printed main line
        if seq.main:
            for u in current:
                yield from emit(node_at(u.main_end, key), "main")
        # 2. a hypothetical position the text has just described ("if the rook were on g8"):
        #    its lines first, then its start
        v = self._virtual
        if v is not None:
            for end, _ in self.contexts:
                if end.unit is v:
                    yield from emit(node_at(end, key), "virtual")
            yield from roots(v, "virtual")
            yield from anywhere(v, "virtual")
        # 3. the line the text resumes after a bracketed aside: "4 ♔e2 (or 4 ♔c2 ♔e3) 4 ... ♔e4"
        if self._prefer is not None:
            yield from emit(node_at(self._prefer, key), "resume")
        # 4. a diagram named in the same sentence ("in diagram 322, 1 ♔f5 ...")
        for u in s_units:
            yield from emit(node_at(u.main_end, key), "ref")
            yield from roots(u, "ref")
        # 5. recent lines; bold text continues bold lines first
        ctx = self.contexts
        if seq.bold:
            ctx = [c for c in ctx if c[1]] + [c for c in ctx if not c[1]]
        for end, _ in ctx:
            yield from emit(node_at(end, key), "recent")
        for u in current:
            yield from emit(node_at(u.main_end, key), "main")
            yield from roots(u, "current")
        # 6. any position at that move number in the current diagram
        for u in current:
            yield from anywhere(u, "any")
        # 7. diagrams named earlier in the paragraph, then other diagrams of this section
        for u in p_units + [u for u in self.section_units if u not in current]:
            yield from emit(node_at(u.main_end, key), "section")
            yield from roots(u, "section")
            yield from anywhere(u, "section-any")

    def root_candidates(self, seq: Sequence):
        key = (seq.moves[0].num, seq.moves[0].color)
        for u in self.current:
            if u.root.nxt == key:
                yield u.root, "stated:root"
            elif not u.root_known:
                yield self._tentative_root(u, key), "stated:root?"
            elif u.root.nxt[0] == key[0]:
                yield u.alt_root(), "stated:alt-root"

    def _bridge(self, seq: Sequence, sentence_refs, para_refs, hint):
        """The text skipped the opponent's move ("8 ♕f8+ followed by 9 ♕g7+", "threatening
        2 ... g4+"): try the recent lines one ply earlier. Out of check the skipped move is a
        pass ("whatever he plays"); in check it must be a real reply, so take the first one
        after which the printed moves work."""
        key = (seq.moves[0].num, seq.moves[0].color)
        pk = prev_key(key)
        probe = Sequence([MoveTok(pk[0], pk[1], "", -1, -1)] + seq.moves, seq.bold, seq.main,
                         seq.start, seq.sentence_start)
        for node, how in self.candidates(probe, sentence_refs, para_refs, hint):
            if node.order == -1 or node.implied:
                continue
            b = node.board()
            if not b.is_check():
                b.push(chess.Move.null())
                if legal_prefix(b, seq.moves) == len(seq.moves):
                    return (len(seq.moves), pass_node(node), how + "+pass")
                continue
            for reply in list(b.legal_moves):
                b2 = b.copy(stack=False)
                b2.push(reply)
                if legal_prefix(b2, seq.moves) == len(seq.moves):
                    return (len(seq.moves), implied_node(node, reply), how + "+reply")
        return None

    def _tentative_root(self, u: Unit, key: tuple[int, str]) -> Node:
        """The diagram's side to move is not printed: let its first line decide."""
        num, color = key
        return Node(u, None, f"{u.placement} {color} - - 0 {num}", key, id=u.id, order=-1)

    def anchor(self, seq: Sequence, sentence_refs=(), para_refs=(), hint=None,
               from_diagram: bool = False, prefer: Node | None = None,
               virtual: Unit | None = None) -> Anchored:
        """from_diagram: the text just said 'with Black to move' (etc.), so a line starting
        at the diagram's first move number begins at the diagram, not inside a line.
        prefer: the end of the line this sequence resumes (the text came out of brackets)."""
        self._prefer = prefer
        self._virtual = virtual
        best: tuple[int, Node, str] | None = None
        cands = self.candidates(seq, list(sentence_refs), list(para_refs), hint)
        if from_diagram:
            cands = itertools.chain(self.root_candidates(seq), cands)
        for node, how in cands:
            k = try_play(node, seq.moves)
            if k == len(seq.moves):
                best = (k, node, how)
                break
            if k and (best is None or k > best[0]):
                best = (k, node, how + "+partial")
        if best is None or best[0] < len(seq.moves):
            bridged = self._bridge(seq, list(sentence_refs), list(para_refs), hint)
            if bridged is not None:
                best = bridged
        if best is None:
            return Anchored(seq, [], "failed")
        k, start, how = best
        # a long sequence that only half-fits is more likely a wrong anchor than a misprint
        if k < len(seq.moves) and k < max(2, (len(seq.moves) + 1) // 2):
            return Anchored(seq, [], "failed")
        u = start.unit
        if start.order == -1:  # commit a tentative root
            u.root.fen, u.root.nxt = start.fen, start.nxt
            start = u.root
        if start is u.root:
            u.root_known = True
        nodes = play(start, seq.moves[:k], main=seq.main, bold=seq.bold)
        u.seq_count += 1
        if seq.main:
            u.has_rows = True
            u.main_end = nodes[-1]
        elif not u.has_rows and start is u.main_end and (seq.bold or not u.bold_main):
            # without a printed main line, the (bold) line from the diagram is the main line
            for nd in nodes:
                nd.main = True
            u.main_end = nodes[-1]
        self.push_context(nodes[-1], seq.bold or seq.main)
        return Anchored(seq, nodes, how)
