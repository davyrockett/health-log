"""Draws the app icons into ../icons. Run: python3 tools/make-icons.py (needs Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
BG = (31, 106, 99)       # --accent
FG = (243, 245, 244)     # --bg
SOFT = (108, 194, 182)   # dark-theme accent


def draw(size: int) -> Image.Image:
    s = 1024  # draw large, then shrink for smooth edges
    img = Image.new("RGB", (s, s), BG)
    d = ImageDraw.Draw(img)

    # A weight trend line falling to a highlighted latest point,
    # kept inside the safe zone iOS/Android won't crop
    pts = [(250, 470), (360, 430), (470, 520), (580, 560), (690, 640), (780, 600)]
    for y in (400, 520, 640, 760):
        d.line([(230, y), (800, y)], fill=SOFT, width=6)
    d.line(pts, fill=FG, width=44, joint="curve")
    for x, y in pts[:-1]:
        d.ellipse([x - 26, y - 26, x + 26, y + 26], fill=FG)
    x, y = pts[-1]
    d.ellipse([x - 52, y - 52, x + 52, y + 52], fill=FG)
    d.ellipse([x - 24, y - 24, x + 24, y + 24], fill=BG)

    return img.resize((size, size), Image.LANCZOS)


OUT.mkdir(exist_ok=True)
for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]:
    draw(size).save(OUT / name, optimize=True)
    print("wrote", OUT / name)
