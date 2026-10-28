#!/usr/bin/env python3
"""Crops a WeChat Work group-QR export down to the QR and writes public/home/wechat-qr.png.

    python3 scripts/wechat-qr.py ~/Downloads/new-group-qr.png

The export is the phone/desktop "save group QR" card (logo, group name, QR,
expiry line). The QR is the dark block in the middle 30-80% of its height; it
is cut out with a white quiet zone and scaled up without smoothing so it
stays sharp. Needs Pillow.
"""
import sys
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "public" / "home" / "wechat-qr.png"
SIZE = 600

src = Image.open(sys.argv[1]).convert("L")
w, h = src.size
top, bottom = int(h * 0.3), int(h * 0.8)
px = src.load()
dark = [(x, y) for y in range(top, bottom) for x in range(w) if px[x, y] < 80]
if not dark:
    sys.exit("no QR found in the middle of the image")
x0, x1 = min(p[0] for p in dark), max(p[0] for p in dark)
y0, y1 = min(p[1] for p in dark), max(p[1] for p in dark)
side = max(x1 - x0, y1 - y0) + 1
pad = round(side * 0.08)
qr = Image.new("L", (side + 2 * pad, side + 2 * pad), 255)
qr.paste(src.crop((x0, y0, x0 + side, y0 + side)), (pad, pad))
qr.resize((SIZE, SIZE), Image.NEAREST).save(OUT, optimize=True)
print(f"wrote {OUT} ({SIZE}x{SIZE}) from a {side}px QR at ({x0},{y0})")
