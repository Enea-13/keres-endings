"""Stage 2: diagram images -> FEN piece placement.

All 879 diagrams are rendered in one uniform print style, so a nearest-template
classifier over 8x8 cell crops is enough. Templates are seeded from a few hand-picked
cells (templates/exemplars.json) and refined over every cell in the book.

Usage:
  python diagrams.py extract     # dump diagram images from the PDF (build/diagrams)
  python diagrams.py train       # exemplars -> templates/templates.npz (+ QA sheets)
  python diagrams.py recognise   # classify all diagrams -> build/diagrams.json
"""
from __future__ import annotations

import io
import json
import sys

import numpy as np
from PIL import Image, ImageDraw

from config import BUILD, PDF_PATH, ROOT

DIAGRAM_DIR = BUILD / "diagrams"
QA_DIR = BUILD / "qa"
TEMPLATE_DIR = ROOT / "templates"
FEAT = 24      # cells are resampled to FEAT x FEAT
INSET = 1      # pixels trimmed from each cell edge
SHIFT = 2      # matching tolerates +-SHIFT feature pixels of misalignment
CORE = FEAT - 2 * SHIFT
LABELS = ".KQRBNPkqrbnp"


# ----------------------------------------------------------------------------- geometry

def _first(series, start, step, thresh):
    i = start
    while 0 <= i < len(series):
        if series[i] > thresh:
            return i
        i += step
    raise ValueError("frame line not found")


def frame_box(a: np.ndarray, thresh: float = 0.85) -> tuple[int, int, int, int]:
    """Playing-area box (x0, y0, x1, y1), inclusive, from the frame lines nearest the centre.

    The printed frame is a double line on some sides, so scan outwards from the middle and
    stop at the first near-solid line on each side. Rows are measured only between the
    vertical frame lines, because the diagram number sits in a margin on the left.
    """
    dark = a < 128
    h, w = dark.shape
    col = dark.mean(0)
    cx = (w * 3) // 5  # the label margin is on the left, so bias the centre right
    x0 = _first(col, cx, -1, thresh) + 1
    x1 = _first(col, cx, 1, thresh) - 1
    row = dark[:, x0:x1 + 1].mean(1)
    cy = h // 2
    y0 = _first(row, cy, -1, thresh) + 1
    y1 = _first(row, cy, 1, thresh) - 1
    return x0, y0, x1, y1


def board_regions(a: np.ndarray, split: bool) -> list[tuple[np.ndarray, int]]:
    """Regions of 8 (or 4) ranks. A split diagram holds two half-boards: ranks 8-5 of one
    position above ranks 4-1 of another, separated by a white gap."""
    if not split:
        x0, y0, x1, y1 = frame_box(a)
        return [(a[y0:y1 + 1, x0:x1 + 1], 8)]
    dark = a < 128
    col = dark.mean(0)
    cx = (a.shape[1] * 3) // 5
    x0 = _first(col, cx, -1, 0.6) + 1
    x1 = _first(col, cx, 1, 0.6) - 1
    row = dark[:, x0:x1 + 1].mean(1)
    h = len(row)
    gap = [i for i in range(int(0.3 * h), int(0.7 * h)) if row[i] < 0.02]
    g0, g1 = gap[0], gap[-1]
    top_y0 = _first(row, g0 // 2, -1, 0.85) + 1
    bot_y1 = _first(row, (g1 + h) // 2, 1, 0.85) - 1
    # trim the cut edges (a thin rule or white) next to the gap
    top_y1 = g0 - 1
    while row[top_y1] > 0.85 or a[top_y1, x0:x1].mean() > 250:
        top_y1 -= 1
    bot_y0 = g1 + 1
    while row[bot_y0] > 0.85 or a[bot_y0, x0:x1].mean() > 250:
        bot_y0 += 1
    return [(a[top_y0:top_y1 + 1, x0:x1 + 1], 4), (a[bot_y0:bot_y1 + 1, x0:x1 + 1], 4)]


def cells(region: np.ndarray, ranks: int) -> np.ndarray:
    """Row-major cell crops (top rank first), each resampled to FEAT x FEAT in [0, 1]."""
    h, w = region.shape
    cw, ch = w / 8, h / ranks
    out = []
    for r in range(ranks):
        for f in range(8):
            x0, y0 = int(round(f * cw)) + INSET, int(round(r * ch)) + INSET
            x1, y1 = int(round((f + 1) * cw)) - INSET, int(round((r + 1) * ch)) - INSET
            crop = Image.fromarray(region[y0:y1, x0:x1].astype(np.uint8))
            out.append(np.asarray(crop.resize((FEAT, FEAT), Image.BILINEAR), dtype=np.float32) / 255.0)
    return np.array(out)


def load(n: int) -> np.ndarray:
    return np.asarray(Image.open(DIAGRAM_DIR / f"{n:03d}.png").convert("L"), dtype=np.float32)


def diagram_list() -> list[dict]:
    stream = json.loads((BUILD / "stream.json").read_text())
    return [e for e in stream["elements"] if e["type"] == "diagram"]


def is_light(file: int, rank: int) -> bool:
    return (file + rank) % 2 == 0  # a1 = (0 + 1) is dark


def diagram_cells(d: dict):
    """Yields (part, square, light, feature) for every cell of a diagram."""
    a = load(d["n"])
    for part, (region, ranks) in enumerate(board_regions(a, d.get("split", False))):
        top = 8 if part == 0 else 4
        for k, v in enumerate(cells(region, ranks)):
            r, f = divmod(k, 8)
            rank = top - r
            yield part, "abcdefgh"[f] + str(rank), is_light(f, rank), v


# ----------------------------------------------------------------------------- matching

def windows(v: np.ndarray) -> np.ndarray:
    """All CORE x CORE windows of a cell for shifts in [-SHIFT, SHIFT]^2 -> (S, CORE*CORE)."""
    out = []
    for dy in range(2 * SHIFT + 1):
        for dx in range(2 * SHIFT + 1):
            out.append(v[dy:dy + CORE, dx:dx + CORE].ravel())
    return np.array(out)


def distances(feats: np.ndarray, tvecs: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """feats (N, FEAT, FEAT), tvecs (T, CORE*CORE) -> (N, T) min RMS distance and best shift."""
    W = np.stack([windows(v) for v in feats])               # (N, S, C)
    d = ((W[:, :, None, :] - tvecs[None, None]) ** 2).mean(-1)  # (N, S, T)
    return np.sqrt(d.min(1)), d.argmin(1)


def core(v: np.ndarray) -> np.ndarray:
    return v[SHIFT:SHIFT + CORE, SHIFT:SHIFT + CORE].ravel()


# ----------------------------------------------------------------------------- commands

def cmd_extract() -> None:
    import fitz
    DIAGRAM_DIR.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(PDF_PATH)
    for d in diagram_list():
        img = doc.extract_image(d["xref"])
        Image.open(io.BytesIO(img["image"])).convert("L").save(DIAGRAM_DIR / f"{d['n']:03d}.png")
    print("extracted", len(diagram_list()))


def collect() -> list[tuple[int, int, str, bool, np.ndarray]]:
    rows = []
    for d in diagram_list():
        for part, sq, light, v in diagram_cells(d):
            rows.append((d["n"], part, sq, light, v))
    return rows


def sheet(items: list[tuple[str, np.ndarray, float]], path, per: int = 24) -> None:
    """Contact sheet: one row per label, worst-matching cells first."""
    s = FEAT * 2
    groups: dict[str, list] = {}
    for lab, v, dist in items:
        groups.setdefault(lab, []).append((dist, v))
    labs = sorted(groups)
    img = Image.new("L", (60 + per * (s + 2), len(labs) * (s + 6)), 255)
    draw = ImageDraw.Draw(img)
    for j, lab in enumerate(labs):
        g = sorted(groups[lab], key=lambda t: -t[0])[:per]
        draw.text((4, j * (s + 6) + 8), f"{lab} {len(groups[lab])}", fill=0)
        draw.text((4, j * (s + 6) + 24), f"{g[0][0]:.3f}", fill=90)
        for m, (dist, v) in enumerate(g):
            im = Image.fromarray((v * 255).astype(np.uint8)).resize((s, s), Image.NEAREST)
            img.paste(im, (60 + m * (s + 2), j * (s + 6)))
    img.save(path)


def candidate_keys(tpl: dict, light: bool) -> list[tuple[str, bool]]:
    """Templates to try for a cell. Some diagrams print a piece on a dark square inside a
    white knock-out box, which looks exactly like the piece on a light square."""
    keys = [k for k in tpl if k[1] == light]
    if not light:
        keys += [k for k in tpl if k[1] and k[0] != "."]
    return keys


def cmd_train(iters: int = 3) -> None:
    QA_DIR.mkdir(parents=True, exist_ok=True)
    rows = collect()
    index = {(n, part, sq): (light, v) for n, part, sq, light, v in rows}
    seeds = json.loads((TEMPLATE_DIR / "exemplars.json").read_text())
    tpl: dict[tuple[str, bool], np.ndarray] = {}
    for lab, refs in seeds.items():
        if lab.startswith("_"):
            continue
        by_colour: dict[bool, list] = {}
        for ref in refs:
            key, sq = ref.split(":")
            part = 1 if key.endswith("b") else 0
            light, v = index[(int(key.rstrip("b")), part, sq)]
            by_colour.setdefault(light, []).append(core(v))
        for light, vs in by_colour.items():
            tpl[(lab, light)] = np.mean(vs, 0)
    missing = [(l, c) for l in LABELS for c in (True, False) if (l, c) not in tpl]
    assert not missing, f"no exemplar for {missing}"

    for it in range(iters + 1):
        assigned: dict[tuple[str, bool], list] = {}
        report = {True: [], False: []}
        for light in (True, False):
            keys = candidate_keys(tpl, light)
            tvecs = np.array([tpl[k] for k in keys])
            feats = np.array([v for (_, _, _, l, v) in rows if l == light])
            for start in range(0, len(feats), 2048):
                chunk = feats[start:start + 2048]
                d, shift = distances(chunk, tvecs)
                best = d.argmin(1)
                for i, v in enumerate(chunk):
                    b = best[i]
                    s = shift[i, b]
                    dy, dx = divmod(int(s), 2 * SHIFT + 1)
                    assigned.setdefault(keys[b], []).append(v[dy:dy + CORE, dx:dx + CORE].ravel())
                    report[light].append((keys[b][0], v, float(d[i, b])))
        counts = {f"{k[0]}{'L' if k[1] else 'D'}": len(v) for k, v in sorted(assigned.items())}
        print(f"iter {it}: {counts}")
        if it < iters:
            tpl = {k: np.mean(vs, 0) for k, vs in assigned.items()}
    for light in (True, False):
        sheet(report[light], QA_DIR / f"labels_{'light' if light else 'dark'}.png")
    keys = sorted(tpl)
    np.savez(TEMPLATE_DIR / "templates.npz",
             vecs=np.array([tpl[k] for k in keys]),
             labels=np.array([k[0] for k in keys]),
             light=np.array([k[1] for k in keys]))
    print("templates saved:", len(keys))


def load_templates():
    t = np.load(TEMPLATE_DIR / "templates.npz")
    tpl = {(str(l), bool(c)): v for v, l, c in zip(t["vecs"], t["labels"], t["light"])}
    out = {}
    for light in (True, False):
        keys = candidate_keys(tpl, light)
        out[light] = (np.array([tpl[k] for k in keys]), np.array([k[0] for k in keys]))
    return out


def placement(grid: list[list[str]]) -> str:
    rows = []
    for rank in grid:
        s, run = "", 0
        for p in rank:
            if p == ".":
                run += 1
            else:
                if run:
                    s += str(run)
                    run = 0
                s += p
        rows.append(s + (str(run) if run else ""))
    return "/".join(rows)


def sanity(grid: list[list[str]]) -> list[str]:
    flat = [p for r in grid for p in r]
    issues = []
    if flat.count("K") != 1:
        issues.append(f"{flat.count('K')} white kings")
    if flat.count("k") != 1:
        issues.append(f"{flat.count('k')} black kings")
    if any(p in "Pp" for p in grid[0] + grid[7]):
        issues.append("pawn on back rank")
    if sum(p.isupper() for p in flat) > 16 or sum(p.islower() for p in flat) > 16:
        issues.append("too many pieces")
    return issues


def recognise_diagram(d: dict, tpl) -> list[dict]:
    parts: dict[int, dict] = {}
    for part, sq, light, v in diagram_cells(d):
        tvecs, labels = tpl[light]
        dist, _ = distances(v[None], tvecs)
        dist = dist[0]
        order = np.argsort(dist)
        lab = str(labels[order[0]])
        other = next((j for j in order[1:] if labels[j] != labels[order[0]]), order[0])
        margin = float(dist[other] - dist[order[0]])
        p = parts.setdefault(part, {"grid": [["."] * 8 for _ in range(8)], "weak": []})
        f, rank = "abcdefgh".index(sq[0]), int(sq[1])
        p["grid"][8 - rank][f] = lab
        if margin < 0.05:
            p["weak"].append({"sq": sq, "label": lab, "dist": round(float(dist[order[0]]), 3),
                              "alt": str(labels[other]), "margin": round(margin, 3)})
    if len(parts) == 2:  # one image, two half-boards stacked (diagram 295)
        grids = [(parts[0]["grid"], "top"), (parts[1]["grid"], "bottom")]
    else:
        grids = split_side_by_side(parts[0]["grid"])
    weak = [w for p in parts.values() for w in p["weak"]]
    positions = []
    for k, (grid, label) in enumerate(grids):
        pid = f"{d['n']}" if label is None else f"{d['n']}{label[0].upper()}"
        positions.append({"id": pid, "label": label, "placement": placement(grid),
                          "issues": sanity(grid)})
    return {"positions": positions, "weak": weak}


def split_side_by_side(grid: list[list[str]]) -> list[tuple[list[list[str]], str | None]]:
    """Some diagrams print two positions on one board (two kings of each colour), either
    side by side or one above the other. Try every file and rank cut that leaves one king
    of each colour per side and keep the one giving the most compact pair of positions."""
    flat = [p for r in grid for p in r]
    if flat.count("K") != 2 or flat.count("k") != 2:
        return [(grid, None)]

    def spread(cells):
        if not cells:
            return 0
        rs = [r for r, _ in cells]
        fs = [f for _, f in cells]
        return (max(rs) - min(rs)) + (max(fs) - min(fs))

    best = None
    for axis in ("file", "rank"):
        for cut in range(1, 8):
            a = [[p if ((f if axis == "file" else r) < cut) else "." for f, p in enumerate(row)]
                 for r, row in enumerate(grid)]
            b = [[p if ((f if axis == "file" else r) >= cut) else "." for f, p in enumerate(row)]
                 for r, row in enumerate(grid)]
            fa = [p for row in a for p in row]
            if fa.count("K") != 1 or fa.count("k") != 1:
                continue
            ca = [(r, f) for r, row in enumerate(a) for f, p in enumerate(row) if p != "."]
            cb = [(r, f) for r, row in enumerate(b) for f, p in enumerate(row) if p != "."]
            score = (spread(ca) + spread(cb), abs(cut - 4))
            labels = ("left", "right") if axis == "file" else ("top", "bottom")
            if best is None or score < best[0]:
                best = (score, [(a, labels[0]), (b, labels[1])])
    return best[1] if best else [(grid, None)]


def cmd_recognise() -> None:
    tpl = load_templates()
    out = {}
    for d in diagram_list():
        res = recognise_diagram(d, tpl)
        out[d["n"]] = res
        for pos in res["positions"]:
            if pos["issues"] or pos["label"]:
                print(pos["id"], pos["placement"], pos["issues"])
    (BUILD / "diagrams.json").write_text(json.dumps(out, indent=1))
    n_pos = sum(len(r["positions"]) for r in out.values())
    bad = sum(bool(p["issues"]) for r in out.values() for p in r["positions"])
    weak = sum(len(r["weak"]) for r in out.values())
    print(f"recognised {len(out)} diagrams -> {n_pos} positions; {bad} with issues; {weak} weak cells")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "recognise"
    {"extract": cmd_extract, "train": cmd_train, "recognise": cmd_recognise}[cmd]()
