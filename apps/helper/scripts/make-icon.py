"""Draws guildie's shield (as in apps/web/public/favicon.svg) into
assets/guildie.ico at 16, 32, 48 and 256 px. Pure Python, no image libraries:
  python3 scripts/make-icon.py
"""
import struct, zlib, os

BG = (0x2B, 0x26, 0x20)
GOLD = (0xD9, 0xB4, 0x5A)

# favicon.svg is a 32x32 viewBox: rounded square, shield path, plus sign.
SHIELD = [(16, 5), (25, 9), (25, 16), (23.5, 21), (20, 24.5), (16, 27), (12, 24.5), (8.5, 21), (7, 16), (7, 9)]

def inside(poly, x, y):
    c = False
    for i in range(len(poly)):
        (x1, y1), (x2, y2) = poly[i], poly[i - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c

def dist_to_edge(poly, x, y):
    best = 1e9
    for i in range(len(poly)):
        (x1, y1), (x2, y2) = poly[i], poly[i - 1]
        dx, dy = x2 - x1, y2 - y1
        t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
        px, py = x1 + t * dx, y1 + t * dy
        best = min(best, ((x - px) ** 2 + (y - py) ** 2) ** 0.5)
    return best

def pixel(u, v):
    """Color at (u, v) in the 32-unit viewBox, or None for transparent."""
    r = 4  # corner radius
    cx, cy = min(max(u, r), 32 - r), min(max(v, r), 32 - r)
    if (u - cx) ** 2 + (v - cy) ** 2 > r * r:
        return None
    if dist_to_edge(SHIELD, u, v) <= 1.0:
        return GOLD
    if inside(SHIELD, u, v) and ((abs(u - 16) <= 1.0 and 11 <= v <= 21) or (abs(v - 16) <= 1.0 and 11 <= u <= 21)):
        return GOLD
    return BG

def png(size):
    ss = 4  # supersampling
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    c = pixel((x + (sx + 0.5) / ss) * 32 / size, (y + (sy + 0.5) / ss) * 32 / size)
                    if c:
                        acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; acc[3] += 255
            n = ss * ss
            a = acc[3] // n
            row += bytes([acc[0] // max(1, acc[3] // 255), acc[1] // max(1, acc[3] // 255), acc[2] // max(1, acc[3] // 255), a] if a else [0, 0, 0, 0])
        rows.append(bytes(row))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b"")

sizes = [16, 32, 48, 256]
images = [png(s) for s in sizes]
header = struct.pack("<HHH", 0, 1, len(sizes))
offset = 6 + 16 * len(sizes)
entries = b""
for s, img in zip(sizes, images):
    entries += struct.pack("<BBBBHHII", s % 256, s % 256, 0, 0, 1, 32, len(img), offset)
    offset += len(img)
out = os.path.join(os.path.dirname(__file__), "..", "assets", "guildie.ico")
with open(out, "wb") as f:
    f.write(header + entries + b"".join(images))
with open(os.path.join(os.path.dirname(__file__), "..", "assets", "guildie-256.png"), "wb") as f:
    f.write(images[-1])
print("wrote", out)
