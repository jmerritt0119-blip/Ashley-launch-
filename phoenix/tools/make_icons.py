#!/usr/bin/env python3
"""Generate Phoenix app icons (pure stdlib — no Pillow).

Full-bleed square PNGs: deep plum gradient background, warm ember glow,
stylized flame. iOS rounds the corners itself.
"""
import math
import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
SIZES = [512, 192, 180]
SS = 3  # supersampling factor

BG_TOP = (43, 36, 48)      # #2b2430
BG_BOT = (61, 35, 51)      # #3d2333
GLOW = (217, 119, 66)      # #d97742
FLAME_OUTER = (250, 246, 240)  # #faf6f0
FLAME_INNER = (178, 58, 72)    # #b23a48
FLAME_CORE = (224, 138, 85)    # warm core


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def in_flame(nx, ny, cx, tip_y, base_y, width):
    """Teardrop flame pointing up. nx, ny in [0,1]."""
    if ny < tip_y or ny > base_y:
        return False
    t = (ny - tip_y) / (base_y - tip_y)
    # narrow tip, widest ~2/3 down, rounded base
    hw = width * (math.sin(math.pi * t) ** 0.72) * (0.42 + 0.58 * t)
    # gentle S-curve sway in the tip
    sway = 0.045 * width / 0.26 * math.sin(math.pi * (1 - t)) * (1 - t)
    return abs(nx - (cx + sway)) <= hw


def pixel(nx, ny):
    # background gradient
    col = lerp(BG_TOP, BG_BOT, ny)
    # ember glow centered low-middle
    d = math.hypot(nx - 0.5, (ny - 0.72) * 1.15)
    glow = max(0.0, 1.0 - d / 0.55) ** 2 * 0.55
    col = lerp(col, GLOW, glow)
    # flame layers (outer cream, inner red, warm core)
    if in_flame(nx, ny, 0.5, 0.16, 0.80, 0.245):
        col = FLAME_OUTER
        if in_flame(nx, ny, 0.5, 0.34, 0.79, 0.155):
            col = FLAME_INNER
            if in_flame(nx, ny, 0.5, 0.52, 0.78, 0.085):
                col = FLAME_CORE
    return col


def render(size):
    big = size * SS
    rows = []
    for by_block in range(size):
        row = bytearray()
        row.append(0)  # PNG filter type 0
        for bx_block in range(size):
            r = g = b = 0
            for sy in range(SS):
                for sx in range(SS):
                    nx = (bx_block * SS + sx + 0.5) / big
                    ny = (by_block * SS + sy + 0.5) / big
                    c = pixel(nx, ny)
                    r += c[0]
                    g += c[1]
                    b += c[2]
            n = SS * SS
            row += bytes((r // n, g // n, b // n))
        rows.append(bytes(row))
    return b"".join(rows)


def png_chunk(tag, data):
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def write_png(path, size, raw):
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # 8-bit RGB
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(png_chunk(b"IHDR", ihdr))
        f.write(png_chunk(b"IDAT", zlib.compress(raw, 9)))
        f.write(png_chunk(b"IEND", b""))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in SIZES:
        raw = render(size)
        path = os.path.join(OUT_DIR, f"icon-{size}.png")
        write_png(path, size, raw)
        print(f"wrote {path} ({os.path.getsize(path)} bytes)")


if __name__ == "__main__":
    main()
