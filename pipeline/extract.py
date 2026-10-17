"""Stage 1: PDF -> reading-order stream of headings, paragraphs, main-line rows and diagrams.

Output: build/stream.json
"""
from __future__ import annotations

import json
import re
import unicodedata

import fitz  # PyMuPDF

from config import BUILD, PDF_PATH

BOLD = 16
ITALIC = 2
FIGURINES = set("♔♕♖♗♘♙")

# Diagram images are ~262x225; the cover images are much larger.
def is_diagram_image(info: dict) -> bool:
    return 230 <= info["width"] <= 290 and 215 <= info["height"] <= 260


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"^\s*([A-E]:|[a-e]\))\s*", "", s)
    return re.sub(r"[^a-z]", "", s.lower())


# ----------------------------------------------------------------------------- outline

def read_outline(doc: fitz.Document) -> list[dict]:
    """Outline entries with levels: 1 chapter/front matter, 2 section, 3 'A:' sub, 4 'a)' sub-sub.

    The PDF outline is flat below chapters; nesting is recovered from the printed TOC
    (italic entries are sub-sections) and the A:/a) prefixes.
    """
    italic_titles = set()
    for pno in range(5, 8):
        for b in doc[pno].get_text("dict")["blocks"]:
            for l in b.get("lines", []):
                text = "".join(s["text"] for s in l["spans"]).strip()
                if l["spans"] and l["spans"][0]["flags"] & ITALIC:
                    italic_titles.add(text)
    out = []
    for lvl, title, page, dest in doc.get_toc(simple=False):
        if title in ("Title", "Copyright"):
            continue
        if lvl == 1:
            level = 1
        elif title in italic_titles:
            level = 4 if re.match(r"^[a-e]\)", title) else 3
        else:
            level = 2
        out.append({
            "title": title,
            "level": level,
            "page": page - 1,
            "y": dest["to"].y if dest.get("to") else 0,
        })
    return out


# ----------------------------------------------------------------------------- spans -> runs

def line_runs(line: dict) -> list[dict]:
    """Spans of a line -> runs {t, b, i}. Figurines (Chess font) inherit boldness from the
    neighbouring text span, because the Chess font has no bold face."""
    spans = [s for s in line["spans"] if s["text"]]
    runs = []
    for k, s in enumerate(spans):
        is_fig = s["font"].startswith("Chess")
        if is_fig:
            nb = next((t for t in spans[k + 1:] if not t["font"].startswith("Chess")), None)
            pb = next((t for t in reversed(spans[:k]) if not t["font"].startswith("Chess")), None)
            ref = nb or pb
            bold = bool(ref and ref["flags"] & BOLD)
            italic = bool(ref and ref["flags"] & ITALIC)
        else:
            bold = bool(s["flags"] & BOLD)
            italic = bool(s["flags"] & ITALIC)
        runs.append({"t": s["text"], "b": bold, "i": italic})
    return runs


def merge_runs(runs: list[dict]) -> list[dict]:
    out: list[dict] = []
    for r in runs:
        if not r["t"]:
            continue
        if out and out[-1]["b"] == r["b"] and out[-1]["i"] == r["i"]:
            out[-1]["t"] += r["t"]
        elif out and r["t"].strip() == "" and len(r["t"]) <= 2:
            out[-1]["t"] += r["t"]  # whitespace doesn't deserve its own run
        else:
            out.append(dict(r))
    return out


def join_line_runs(lines: list[list[dict]]) -> list[dict]:
    runs: list[dict] = []
    for k, lr in enumerate(lines):
        if not lr:
            continue
        if runs:
            prev = runs[-1]["t"]
            if prev.endswith("-") or prev.endswith(" "):
                pass
            else:
                # space goes on whichever side keeps formatting continuous
                runs[-1]["t"] += " "
        runs.extend(dict(r) for r in lr)
    return merge_runs(runs)


def fix_text(runs: list[dict]) -> list[dict]:
    for r in runs:
        t = r["t"]
        # source lost the hyphen in "the g- and d-files"
        t = re.sub(r"\b([a-h])and ([a-h])-(file|pawn)", r"\1- and \2-\3", t)
        t = t.replace("\u00a0", " ")
        r["t"] = re.sub(r"[ \t]{2,}", " ", t)
    return runs


# ----------------------------------------------------------------------------- table rows

def as_row(block: dict) -> dict | None:
    """Main-line rows look like three cells on one baseline: '5 | ♔e2 | d3+'."""
    lines = block["lines"]
    if not (2 <= len(lines) <= 3):
        return None
    y0 = lines[0]["bbox"][1]
    if any(abs(l["bbox"][1] - y0) > 4 for l in lines):
        return None
    first = "".join(s["text"] for s in lines[0]["spans"]).strip()
    if not re.fullmatch(r"\d{1,3}", first) or lines[0]["bbox"][0] > 140:
        return None
    # Column positions vary between tables, but the layout is regular: a row with only
    # White's move has two cells, a row with Black's move has three (White's cell is '...').
    cellt = ["".join(s["text"] for s in l["spans"]).strip() for l in lines[1:]]
    white = "..." if cellt[0] in ("...", "…") else cellt[0]
    black = cellt[1] if len(cellt) > 1 else None
    if white is None and black is None:
        return None
    return {"type": "row", "num": int(first), "white": white, "black": black}


# ----------------------------------------------------------------------------- main

def extract() -> dict:
    doc = fitz.open(PDF_PATH)
    outline = read_outline(doc)
    anchors: dict[int, list[int]] = {}
    for i, o in enumerate(outline):
        anchors.setdefault(o["page"], []).append(i)

    elements: list[dict] = []
    diagram_no = 0
    first_page = outline[0]["page"]

    intro_page = next(o["page"] for o in outline if o["title"] == "Introduction")
    in_contents = False
    for pno in range(first_page, doc.page_count):
        page = doc[pno]
        head = page.get_text()[:200]
        if first_page < pno < intro_page and head.lstrip().startswith("Contents"):
            in_contents = True
        if in_contents and pno < intro_page:
            continue
        if pno > 600 and "BATSFORD CHESS" in head:
            break  # publisher's adverts, then the copyright page
        infos = [i for i in page.get_image_info(xrefs=True) if is_diagram_image(i)]
        pending = sorted(anchors.get(pno, []), key=lambda i: outline[i]["y"])
        blocks = page.get_text("dict")["blocks"]
        heading_open: dict | None = None  # heading currently collecting continuation lines
        first_text_on_page = True

        for b in blocks:
            top = b["bbox"][1]
            # emit headings whose anchor lies above this block
            if b["type"] == 0 and pending and top >= outline[pending[0]]["y"] - 25:
                oi = pending.pop(0)
                o = outline[oi]
                elements.append({"type": "heading", "outline": oi, "title": o["title"],
                                 "level": o["level"], "page": pno})
                heading_open = {"bottom": b["bbox"][3]}
                first_text_on_page = False
                continue  # the block itself is the printed heading
            if b["type"] == 1:
                bb = b["bbox"]
                info = next((i for i in infos if abs(i["bbox"][1] - bb[1]) < 3), None)
                if info is None:
                    continue
                diagram_no += 1
                elements.append({"type": "diagram", "n": diagram_no, "xref": info["xref"],
                                 "page": pno, "bbox": [round(v, 1) for v in bb],
                                 # one image holding two half-board positions (diagram 295)
                                 "split": info["height"] > 240})
                heading_open = None
                continue

            # continuation lines of a multi-block heading ("Queen against" / "Rook and Pawn")
            if heading_open is not None:
                x0 = b["bbox"][0]
                spans = [s for l in b["lines"] for s in l["spans"] if s["text"].strip()]
                styled = spans and all((s["flags"] & (BOLD | ITALIC)) for s in spans)
                if styled and x0 > 100 and top - heading_open["bottom"] < 12:
                    heading_open["bottom"] = b["bbox"][3]
                    continue
            heading_open = None

            row = as_row(b)
            if row:
                row["page"] = pno
                elements.append(row)
                first_text_on_page = False
                continue

            lines = [line_runs(l) for l in b["lines"]]
            runs = fix_text(join_line_runs(lines))
            text = "".join(r["t"] for r in runs).strip()
            if not text:
                continue
            x0 = b["bbox"][0]
            first_x = b["lines"][0]["bbox"][0]
            centered = x0 > 90 and b["bbox"][2] < 530
            para = {"type": "p", "align": "center" if centered else "left",
                    "runs": runs, "page": pno}
            prev = elements[-1] if elements else None
            # paragraph continued from the previous page (no first-line indent)
            if (first_text_on_page and prev and prev["type"] == "p" and prev["align"] == "left"
                    and not centered and first_x < 55):
                prev["runs"] = merge_runs(prev["runs"] + [{"t": " ", "b": False, "i": False}] + runs)
            else:
                elements.append(para)
            first_text_on_page = False

        for oi in pending:  # anchors at the very bottom of a page
            o = outline[oi]
            elements.append({"type": "heading", "outline": oi, "title": o["title"],
                             "level": o["level"], "page": pno})

    # a row broken by a page break: "3 | …" at the foot, "♔c2" alone at the next page's top
    lone_move = re.compile(r"^[♔♕♖♗♘]?[a-h]?x?[a-h][1-8][+#!?]*$")
    fixed = []
    for e in elements:
        prev = fixed[-1] if fixed else None
        text = "".join(r["t"] for r in e.get("runs", [])).strip()
        if (e["type"] == "p" and prev and prev["type"] == "row" and prev["black"] is None
                and prev["white"] in ("...", "…") and lone_move.match(text)):
            prev["black"] = text
            continue
        fixed.append(e)
    elements = fixed

    for e in elements:
        if e["type"] == "p":
            e["runs"][0]["t"] = e["runs"][0]["t"].lstrip()
            e["runs"][-1]["t"] = e["runs"][-1]["t"].rstrip()
            e["runs"] = [r for r in e["runs"] if r["t"]]
    return {"outline": outline, "elements": elements, "diagrams": diagram_no}


def main() -> None:
    BUILD.mkdir(parents=True, exist_ok=True)
    data = extract()
    (BUILD / "stream.json").write_text(json.dumps(data, ensure_ascii=False, indent=1))
    counts: dict[str, int] = {}
    for e in data["elements"]:
        counts[e["type"]] = counts.get(e["type"], 0) + 1
    print(f"outline entries: {len(data['outline'])}  diagrams: {data['diagrams']}  elements: {counts}")


if __name__ == "__main__":
    main()
