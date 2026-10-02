"""Read-only export of PCB pad positions and GPIO handoff; run with KiCad Python.

Usage: D:/kicad10/bin/python.exe tools/read-shield-handoff.py HARDWARE_REPO
Prints JSON only; never generates or modifies the source KiCad project.
"""
import json
import sys
from pathlib import Path
import pcbnew

root = Path(sys.argv[1])
result = {"generic": json.loads((root / "firmware/board-mappings.json").read_text(encoding="utf-8")), "compact": {}}
for variant, key, parent in [("pico2w-compact", "pico2w", "pico2w"), ("lcd147a-compact", "lcd147a", "lcd147a"), ("touch2-compact", "touch2_no_camera", "touch2")]:
    base = root / "variants" / variant
    board = pcbnew.LoadBoard(str(base / "hardware/plotterflow-motor-shield.kicad_pcb"))
    parts = {}
    for footprint in board.GetFootprints():
        ref = footprint.GetReference()
        if ref not in ("U1", "U2", "J5", "J6", "J7", "J8", "J9", "J10", "J11", "J12", "J13"):
            continue
        parts[ref] = {"bottom": footprint.IsFlipped(), "pads": {}}
        for pad in footprint.Pads():
            parts[ref]["pads"][pad.GetNumber()] = [round(pcbnew.ToMM(pad.GetPosition().x), 5), round(pcbnew.ToMM(pad.GetPosition().y), 5), pad.GetNetname()]
    result["compact"][parent] = {
        "variant": variant,
        "mapping": json.loads((base / "firmware/board-mappings.json").read_text(encoding="utf-8"))[key],
        "outline": json.loads((base / "design/board-outline.json").read_text(encoding="utf-8")),
        "parts": parts,
    }
print(json.dumps(result, ensure_ascii=True, separators=(",", ":")))
