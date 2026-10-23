"""Stage 4: stream + recognised diagrams -> app content.

Writes app/public/content/{toc.json, sections/<id>.json} and build/report.json.
Run the whole pipeline with `python build.py --all`.
"""
from __future__ import annotations

import json
import re
import shutil
import sys
import unicodedata
from collections import Counter
from dataclasses import replace
from pathlib import Path

import positions
from config import BUILD, CONTENT, ROOT
from notation import (DIAGRAM_REF_RE, SIDE_HINT_RE, Anchored, Book, Node, Unit, play,
                      row_sequence, scan_sequences, try_play)

BOOK = {"title": "Practical Chess Endings", "author": "Paul Keres"}
CAPTION_MAX = 90
SIDE_TO_MOVE_RE = re.compile(r"\b(White|Black)(?:,)? (?:to|has the) (?:move|play)\b")


# ----------------------------------------------------------------------------- helpers

def slug(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"^\s*([a-e]:|[a-e]\))\s*", "", s).replace("(s)", "s")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def flat(runs: list[dict]) -> tuple[str, list[bool], list[bool]]:
    text, bold, ital = "", [], []
    for r in runs:
        text += r["t"]
        bold += [r["b"]] * len(r["t"])
        ital += [r["i"]] * len(r["t"])
    return text, bold, ital


def text_runs(text: str, bold: list[bool], ital: list[bool], a: int, b: int) -> list[dict]:
    """Plain runs for text[a:b], split where formatting changes."""
    out: list[dict] = []
    i = a
    while i < b:
        j = i
        while j < b and bold[j] == bold[i] and ital[j] == ital[i]:
            j += 1
        r = {"t": text[i:j]}
        if bold[i]:
            r["b"] = 1
        if ital[i]:
            r["i"] = 1
        out.append(r)
        i = j
    return out


def diagram_refs(text: str) -> list[tuple[int, int, list[int]]]:
    """(start, end, [numbers]) for 'diagram 322' / 'diagrams 17 and 18'."""
    out = []
    for m in DIAGRAM_REF_RE.finditer(text):
        nums = [int(m.group(1))] + [int(x) for x in re.findall(r"\d{1,3}", m.group(2) or "")]
        out.append((m.start(), m.end(), nums))
    return out


# ----------------------------------------------------------------------------- sections

def section_ids(outline: list[dict]) -> list[str]:
    ids, chapter, sec, sub, subsub = [], 0, 0, 0, 0
    for o in outline:
        t = o["title"]
        if o["level"] == 1:
            m = re.match(r"(\d+) ", t)
            if m:
                chapter, sec, sub, subsub = int(m.group(1)), 0, 0, 0
                ids.append(f"{chapter}-{slug(t[len(m.group(0)):])}")
            else:
                ids.append(slug(t))
            continue
        if o["level"] == 2:
            sec, sub, subsub = sec + 1, 0, 0
            ids.append(f"{chapter}-{sec}-{slug(t)}")
        elif o["level"] == 3:
            sub, subsub = sub + 1, 0
            ids.append(f"{chapter}-{sec}-{sub}-{slug(t)}")
        else:
            subsub += 1
            ids.append(f"{chapter}-{sec}-{sub}-{subsub}-{slug(t)}")
    return ids


def build_toc(outline: list[dict], ids: list[str], stats: dict[str, dict]) -> list[dict]:
    root: list[dict] = []
    stack: list[tuple[int, list]] = [(0, root)]
    for o, sid in zip(outline, ids):
        entry = {"id": sid, "title": o["title"], "level": o["level"], "page": o["page"] + 1,
                 **stats.get(sid, {}), "children": []}
        while stack[-1][0] >= o["level"]:
            stack.pop()
        stack[-1][1].append(entry)
        stack.append((o["level"], entry["children"]))
    return root


# ----------------------------------------------------------------------------- main build

class Builder:
    def __init__(self, stream: dict, diagrams: dict, hypotheticals: list[dict] | None = None) -> None:
        self.stream = stream
        self.diagrams = {int(k): v for k, v in diagrams.items()}
        # overrides.json "positions": hypothetical positions the text describes
        self.hypotheticals = [dict(h, id=f"v{h['page']}-{k + 1}") for k, h in enumerate(hypotheticals or [])]
        self.book = Book()
        self.sections: dict[str, dict] = {}
        self.order: list[str] = []
        self.report: dict = {"failed": [], "partial": [], "how": Counter(), "diagrams": {}}
        self.stated_side: str | None = None   # "w"/"b" from "with Black to move" before a row

    def lookahead(self, idx: int):
        """The first printed main-line row after a diagram, and whether the following prose
        contains bold notation (which then marks the main line)."""
        els = self.stream["elements"]
        first_row, bold = None, False
        for e in els[idx + 1:]:
            if e["type"] in ("diagram", "heading"):
                break
            if e["type"] == "row" and first_row is None:
                first_row = row_sequence(e)
            if e["type"] == "p" and not bold:
                text, b, _ = flat(e["runs"])
                bold = any(s.bold for s in scan_sequences(text, b))
        return first_row, bold

    def run(self) -> None:
        outline = self.stream["outline"]
        ids = section_ids(outline)
        els = self.stream["elements"]
        sec: dict | None = None
        skip_caption = 0
        for idx, e in enumerate(els):
            if e["type"] == "heading":
                sid = ids[e["outline"]]
                sec = {"id": sid, "title": e["title"], "level": e["level"], "page": e["page"] + 1,
                       "blocks": [], "units": set()}
                self.sections[sid] = sec
                self.order.append(sid)
                self.book.start_section(sid)
                continue
            assert sec is not None
            if e["type"] == "diagram":
                sec["blocks"].append(self.diagram_block(idx, e, sec))
                if sec["blocks"][-1].get("units"):
                    self.stated_side = None
                continue
            if e["type"] == "row":
                self.add_row(e, sec)
                continue
            # paragraph
            last = sec["blocks"][-1] if sec["blocks"] else None
            text = "".join(r["t"] for r in e["runs"]).strip()
            if (e["align"] == "center" and last and last["type"] == "diagram"
                    and len(last.get("caption", [])) < 2 and len(text) < CAPTION_MAX
                    and not scan_sequences(*flat(e["runs"])[:2])):
                last.setdefault("caption", []).append(self.paragraph_runs(e, sec))
                continue
            block = {"type": "p", "runs": self.paragraph_runs(e, sec), "page": e["page"] + 1}
            if e["align"] == "center":
                block["align"] = "center"
            sec["blocks"].append(block)

    # --- diagrams
    def diagram_block(self, idx: int, e: dict, sec: dict) -> dict:
        info = self.diagrams[e["n"]]
        first_main, bold_main = self.lookahead(idx)
        node, units = self.book.diagram(e["n"], info["positions"], first_main, bold_main)
        block = {"type": "diagram", "n": e["n"], "page": e["page"] + 1}
        if node is not None:
            block["node"] = node.id
            printed = info["positions"][0]["placement"]
            if printed != node.placement:
                block["printed"] = printed  # the book's diagram is misprinted
            sec["units"].add(node.unit.id)
            self.report["diagrams"][e["n"]] = f"checkpoint {node.id}"
        else:
            block["units"] = [{"id": u.id, "label": u.label} for u in units]
            for u in units:
                sec["units"].add(u.id)
            self.report["diagrams"][e["n"]] = "root"
        return block

    # --- rows
    def add_row(self, e: dict, sec: dict) -> None:
        seq = row_sequence(e)
        cells: dict = {"n": e["num"]}
        stated = self.stated_side
        self.stated_side = None
        # a row restarting at move 1 after "with Black to move" begins at the diagram,
        # unless it simply continues the printed main line
        key = (seq.moves[0].num, seq.moves[0].color) if seq else None
        continues = any(u.main_end is not None and u.main_end.nxt == key
                        for u in self.book.current)
        from_diagram = bool(seq and stated and seq.moves[0].color == stated
                            and seq.moves[0].num == 1 and not continues)
        anchored = self.book.anchor(seq, from_diagram=from_diagram) if seq else None
        if anchored:
            self.count(anchored, sec, e, f"{e['num']} {e['white']} {e['black']}")
        nodes = list(anchored.nodes) if anchored else []
        for key, color in (("white", "w"), ("black", "b")):
            raw = (e[key] or "").strip()
            if not raw:
                continue
            if raw in ("...", "…"):
                cells[color] = None
                continue
            mine = [k for k, m in enumerate(seq.moves if seq else []) if m.cell == key]
            if not mine:
                cells[color] = {"t": raw}
                continue
            used = 0
            for k in mine:
                mv = seq.moves[k]
                cell = {"t": mv.text}
                if k < len(nodes):
                    cell["m"] = nodes[k].id
                    sec["units"].add(nodes[k].unit.id)
                else:
                    cell["x"] = 1
                cells[mv.color] = cell
                used = raw.find(mv.text, used) + len(mv.text)
            tail = raw[used:].strip()
            if tail:
                cells[seq.moves[mine[-1]].color]["after"] = tail
        last = sec["blocks"][-1] if sec["blocks"] else None
        if last and last["type"] == "rows":
            last["rows"].append(cells)
        else:
            sec["blocks"].append({"type": "rows", "rows": [cells], "page": e["page"] + 1})

    # --- prose
    def paragraph_runs(self, e: dict, sec: dict) -> list[dict]:
        text, bold, ital = flat(e["runs"])
        refs = diagram_refs(text)
        seqs = scan_sequences(text, bold)
        marks: list[tuple[int, int, dict]] = []
        for a, b, nums in refs:
            marks.append((a, b, {"d": nums[0], "t": text[a:b]}))
        # bracket depth: after "(or 4 ♔c2 ♔e3)" the text resumes the line before the bracket
        last_at_depth: dict[int, object] = {}
        last_depth: int | None = None
        here = self.hypotheticals_in(e, text)
        last_node = None
        for seq in seqs:
            active = [(at, h) for at, h in here if at <= seq.start]
            virtual = self.virtual_unit(active[-1][1]) if active else None
            depth = max(0, text.count("(", 0, seq.start) - text.count(")", 0, seq.start))
            prefer = last_at_depth.get(depth) if last_depth is not None and last_depth > depth else None
            before = [r for r in refs if r[1] <= seq.start]
            sentence = [n for a, b, nums in before if a >= seq.sentence_start for n in nums]
            para = [n for a, b, nums in before for n in nums]
            hints = SIDE_HINT_RE.findall(text[:seq.start])
            sides = SIDE_TO_MOVE_RE.findall(text[seq.sentence_start:seq.start])
            from_diagram = bool(sides and seq.moves[0].num == 1
                                and sides[-1][0].lower() == seq.moves[0].color)
            anchored = self.book.anchor(seq, sentence, para[::-1], hints[-1] if hints else None,
                                        from_diagram=from_diagram and virtual is None, prefer=prefer,
                                        virtual=virtual)
            if not anchored.nodes and last_node is not None:
                anchored = self.renumbered(seq, last_node) or anchored
            if anchored.nodes:
                last_node = anchored.nodes[-1]
                last_at_depth[depth] = anchored.nodes[-1]
                for d in [d for d in last_at_depth if d > depth]:
                    del last_at_depth[d]
            last_depth = depth
            self.count(anchored, sec, e, text[seq.start:seq.moves[-1].end],
                       text[max(0, seq.start - 220):seq.moves[-1].end + 60])
            for k, mv in enumerate(seq.moves):
                run = {"t": mv.text}
                if mv.bold:
                    run["b"] = 1
                if k < len(anchored.nodes):
                    run["m"] = anchored.nodes[k].id
                    sec["units"].add(anchored.nodes[k].unit.id)
                else:
                    run["x"] = 1
                marks.append((mv.start, mv.end, run))
        # "Now, with Black to move:" carries over label-only paragraphs ("B") to the next row
        sides = SIDE_TO_MOVE_RE.findall(text)
        if sides:
            self.stated_side = sides[-1][0].lower()
        elif any(r.get("m") or r.get("x") for _, _, r in marks):
            self.stated_side = None
        marks.sort(key=lambda m: m[0])
        out: list[dict] = []
        pos = 0
        for a, b, run in marks:
            if a < pos:
                continue
            out += text_runs(text, bold, ital, pos, a)
            out.append(run)
            pos = b
        out += text_runs(text, bold, ital, pos, len(text))
        return out

    def renumbered(self, seq, last):
        """The book occasionally misnumbers a continuation ("2 ♖xd8 ♔xd8 2 ♔b4" for 3 ♔b4).
        If the moves continue the line just given, one move number off, take them so."""
        num, color = last.nxt
        first = seq.moves[0]
        if first.color != color or abs(first.num - num) != 1:
            return None
        delta = num - first.num
        moves = [replace(mv, num=mv.num + delta) for mv in seq.moves]
        if try_play(last, moves) != len(moves):
            return None
        nodes = play(last, moves, main=False, bold=seq.bold)
        self.book.push_context(nodes[-1], seq.bold)
        return Anchored(seq, nodes, "renumbered")

    def hypotheticals_in(self, e: dict, text: str) -> list[tuple[int, dict]]:
        """(offset, spec) for the hypothetical positions described in this paragraph."""
        out = []
        for h in self.hypotheticals:
            if e["page"] + 1 <= h["page"] <= e["page"] + 2 and h["match"] in text:
                out.append((text.index(h["match"]), h))
        return sorted(out, key=lambda t: t[0])

    def base_placement(self, base) -> tuple[str | None, int]:
        if base is None:
            u = self.book.current[0] if self.book.current else None
            return (u.placement, u.n) if u else (None, 0)
        m = re.fullmatch(r"(\d+)([A-Z]?)", str(base))
        n, part = int(m.group(1)), m.group(2)
        for pos in self.diagrams[n]["positions"]:
            if not part or pos["id"].endswith(part):
                return pos["placement"], n
        raise ValueError(f"no position {base}")

    def virtual_unit(self, h: dict) -> Unit:
        if h["id"] not in self.book.units:
            base, n = self.base_placement(h.get("base"))
            place = positions.build(h, base)
            self.book.virtual(h["id"], place, h["note"], n, h.get("stm"))
        return self.book.units[h["id"]]

    def count(self, anchored, sec: dict, e: dict, snippet: str, context: str = "") -> None:
        how = anchored.how.split(":")[0].replace("+partial", "")
        n_all, n_ok = len(anchored.seq.moves), len(anchored.nodes)
        self.report["how"][how if n_ok else "failed"] += 1
        self.report.setdefault("moves", Counter())["total"] += n_all
        self.report["moves"]["anchored"] += n_ok
        entry = {"section": sec["id"], "page": e["page"] + 1, "text": snippet[:160],
                 "unit": ",".join(u.id for u in self.book.current), "row": e["type"] == "row"}
        if context:
            entry["context"] = context
        if n_ok == 0:
            self.report["failed"].append(entry)
        elif n_ok < n_all:
            self.report["partial"].append(entry)

    # --- output
    def unit_json(self, u: Unit) -> dict:
        def node_json(n: Node) -> dict:
            kids = sorted(n.children.values(), key=lambda c: (not c.main, c.order))
            d = {"f": n.fen, "c": [k.id for k in kids]}
            if n.parent is not None:
                d["p"] = n.parent.id
            if n.san:
                d["s"] = n.san
            if n.annot:
                d["a"] = n.annot
            if n.main:
                d["m"] = 1
            if n.implied and n.san != "--":
                d["i"] = 1  # a forced reply the text leaves out
            return d

        nodes = {u.root.id: node_json(u.root)}
        if u.alt:
            nodes[u.alt.id] = node_json(u.alt)
        for n in u.nodes:
            nodes[n.id] = node_json(n)
        out = {"id": u.id, "n": u.n, "label": u.label, "section": u.section,
               "root": u.root.id, "alt": u.alt.id if u.alt else None, "nodes": nodes}
        if u.note:
            out["note"] = u.note
        return out

    def write(self, out: Path = CONTENT, build: Path = BUILD, meta: dict = BOOK) -> None:
        """Content into `out` (and the QA images next to it), the report into `build`."""
        if out.exists():
            shutil.rmtree(out)
        (out / "sections").mkdir(parents=True)
        stats = {}
        for i, sid in enumerate(self.order):
            sec = self.sections[sid]
            units = {uid: self.unit_json(self.book.units[uid]) for uid in sorted(sec["units"])}
            data = {k: v for k, v in sec.items() if k != "units"}
            data["units"] = units
            data["prev"] = self.order[i - 1] if i else None
            data["next"] = self.order[i + 1] if i + 1 < len(self.order) else None
            (out / "sections" / f"{sid}.json").write_text(
                json.dumps(data, ensure_ascii=False, separators=(",", ":")))
            ds = [b["n"] for b in sec["blocks"] if b["type"] == "diagram"]
            stats[sid] = {"diagrams": [ds[0], ds[-1]] if ds else None, "count": len(ds)}
        toc = build_toc(self.stream["outline"], section_ids(self.stream["outline"]), stats)
        (out / "toc.json").write_text(json.dumps(
            {**meta, "toc": toc, "order": self.order}, ensure_ascii=False, indent=1))
        self.write_qa(out, build)
        rep = self.report
        rep["how"] = dict(rep["how"])
        rep["moves"] = dict(rep["moves"])
        rep["units"] = len(self.book.units)
        rep["unit_nodes"] = sum(len(u.nodes) for u in self.book.units.values())
        rep["unanchored_units"] = [u.id for u in self.book.units.values() if not u.nodes]
        rep["misprints"] = self.book.misprints
        rep["hypotheticals"] = {h["id"]: len(self.book.units[h["id"]].nodes) if h["id"] in self.book.units else None
                                for h in self.hypotheticals}
        build.mkdir(parents=True, exist_ok=True)
        (build / "report.json").write_text(json.dumps(rep, ensure_ascii=False, indent=1))
        seqs = sum(v for v in rep["how"].values())
        print(f"sections {len(self.order)}  units {rep['units']}  nodes {rep['unit_nodes']}")
        print(f"sequences {seqs}: " + ", ".join(f"{k} {v}" for k, v in sorted(rep["how"].items())))
        print(f"moves anchored {rep['moves']['anchored']}/{rep['moves']['total']} "
              f"({100 * rep['moves']['anchored'] / rep['moves']['total']:.1f}%)  "
              f"failed sequences {len(rep['failed'])}  partial {len(rep['partial'])}  "
              f"diagrams without moves {len(rep['unanchored_units'])}  "
              f"misprinted diagrams {len(rep['misprints'])}")
        unused = [k for k, v in rep["hypotheticals"].items() if not v]
        print(f"hypothetical positions {len(rep['hypotheticals'])}, unused: {unused}")


    def write_qa(self, out: Path, build: Path) -> None:
        """Data for the app's /qa page: every diagram with what was recognised, plus the
        sequences that could not be attached to a position."""
        qa_dir = out.parent / "qa"
        if qa_dir.exists():
            shutil.rmtree(qa_dir)
        qa_dir.mkdir(parents=True)
        section_of = {}
        for sid in self.order:
            for b in self.sections[sid]["blocks"]:
                if b["type"] == "diagram":
                    section_of[b["n"]] = sid
        diagrams = []
        for n, info in sorted(self.diagrams.items()):
            src = build / "diagrams" / f"{n:03d}.png"
            if src.exists():
                shutil.copy(src, qa_dir / f"{n:03d}.png")
            diagrams.append({"n": n, "section": section_of.get(n),
                             "status": self.report["diagrams"].get(n, "?"),
                             "positions": info["positions"], "weak": info.get("weak", [])})
        (out / "qa.json").write_text(json.dumps({
            "diagrams": diagrams,
            "failed": self.report["failed"],
            "partial": self.report["partial"],
            "misprints": self.book.misprints,
            "how": dict(self.report["how"]),
            "moves": dict(self.report["moves"]),
        }, ensure_ascii=False))


def main() -> None:
    if "--all" in sys.argv:
        import diagrams
        import extract
        extract.main()
        diagrams.cmd_extract()
        diagrams.cmd_recognise()
    stream = json.loads((BUILD / "stream.json").read_text())
    diags = json.loads((BUILD / "diagrams.json").read_text())
    overrides_path = ROOT / "overrides.json"
    ov = json.loads(overrides_path.read_text()) if overrides_path.exists() else {}
    apply_overrides(diags, ov)
    b = Builder(stream, diags, ov.get("positions", []))
    b.run()
    b.write()


def apply_overrides(diags: dict, ov: dict) -> None:
    """overrides.json "diagrams": {"123": ["<placement>", ...]} replaces recognised
    placements (one per position of that diagram). Its "positions" list (hypothetical
    positions described in the text) is used by the Builder; see overrides.json."""
    for n, places in ov.get("diagrams", {}).items():
        for pos, place in zip(diags[str(n)]["positions"], places):
            pos["placement"] = place


if __name__ == "__main__":
    main()
