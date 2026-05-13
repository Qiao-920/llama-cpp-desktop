#!/usr/bin/env bash
# Linux/macOS icon generation script
# Requires: python3 with Pillow (sudo apt install python3-pil)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

python3 << 'PYEOF'
import sys
from PIL import Image, ImageDraw, ImageFont

SIZE = int(sys.argv[1]) if len(sys.argv) > 1 else 256
OUT = sys.argv[2] if len(sys.argv) > 2 else None

img = Image.new("RGBA", (SIZE, SIZE))
draw = ImageDraw.Draw(img)
s = SIZE / 256.0

def round_rect(xy, r, fill):
    x1, y1, x2, y2 = xy
    d = r * 2
    draw.pieslice([x1, y1, x1+d, y1+d], 180, 270, fill=fill)
    draw.pieslice([x2-d, y1, x2, y1+d], 270, 360, fill=fill)
    draw.pieslice([x1, y2-d, x1+d, y2], 90, 180, fill=fill)
    draw.pieslice([x2-d, y2-d, x2, y2], 0, 90, fill=fill)
    draw.rectangle([x1+d, y1, x2-d, y2], fill=fill)
    draw.rectangle([x1, y1+d, x2, y2-d], fill=fill)

# Background rounded rect
round_rect([12*s, 12*s, 244*s, 244*s], 46*s, fill=(17, 22, 17))

# Accent diagonal line
accent = (207, 235, 196, 150)
draw.line([70*s, 184*s, 188*s, 70*s], fill=accent, width=max(1, int(7*s)))

# Dot
dot = (216, 240, 207)
dr = 11.5 * s
draw.ellipse([177*s-dr, 59*s-dr, 177*s+dr, 59*s+dr], fill=dot)

# Text
try:
    fl = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", int(78*s))
    fs = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", int(33*s))
except Exception:
    fl = fs = ImageFont.load_default()

draw.text((54*s, 57*s), "ll", fill=(245, 250, 241), font=fl)
draw.text((88*s, 143*s), "cpp", fill=(216, 235, 207, 235), font=fs)

# Tray icon (32px)
tray = img.resize((32, 32), Image.LANCZOS)

if OUT:
    img.save(OUT, "PNG")
    print(f"Created {OUT}")
else:
    img.save("assets/llama-cpp.png", "PNG")
    tray.save("assets/llama-cpp-tray.png", "PNG")
    print("Created assets/llama-cpp.png (256x256)")
    print("Created assets/llama-cpp-tray.png (32x32)")
PYEOF
