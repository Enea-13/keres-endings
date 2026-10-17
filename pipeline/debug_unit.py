"""Debug helper: show the text around a diagram with recognised placement(s).

usage: python debug_unit.py <diagram number> [elements after]
"""
import json
import sys

from config import BUILD

n = int(sys.argv[1])
after = int(sys.argv[2]) if len(sys.argv) > 2 else 12
E = json.loads((BUILD / "stream.json").read_text())["elements"]
D = json.loads((BUILD / "diagrams.json").read_text())
R = json.loads((BUILD / "report.json").read_text())
i = next(k for k, e in enumerate(E) if e["type"] == "diagram" and e["n"] == n)
for e in E[max(0, i - 2):i + after]:
    if e["type"] == "p":
        print("P  ", "".join(("**" + r["t"] + "**") if r["b"] else r["t"] for r in e["runs"])[:600])
    elif e["type"] == "row":
        print("ROW", e["num"], e["white"], e["black"])
    elif e["type"] == "diagram":
        print(f"DIAGRAM {e['n']}", [p["placement"] for p in D[str(e["n"])]["positions"]],
              R["diagrams"].get(str(e["n"])))
    else:
        print("#", e["title"])
