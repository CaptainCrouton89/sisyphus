#!/usr/bin/env python3
"""Whip frame renderer — Braille sub-pixel line art.

Each terminal cell is treated as a 2×4 dot grid; lines are drawn on a
high-resolution bitmap then packed into Unicode Braille characters
(U+2800..U+28FF). This gives clean thin curves instead of the stair-
stepped `\\ / _ ~` rasterization a per-cell character picker produces.

Frame spec format (JSON):
{
  "width": 32, "height": 12,
  "duration": 0.04,         # uniform frame duration (speed is encoded as
                            # waypoint distance between frames)
  "shoulder": [0, 8],       # fixed point where the arm attaches to the body
  "frames": [
    {
      "id": "F01 rest",
      "handle": [2, 5],                   # [col, row] of `}=` glyph
      "path": [[6,6], [12,8], ...],       # whip waypoints after the handle
      "glyphs": [{"at":[x,y], "rows":[...]}],  # optional ASCII overlays
      "shoulder": [0, 8]                  # optional per-frame override
    }
  ]
}
"""
from __future__ import annotations
import argparse
import json
import math
import sys
from pathlib import Path

DEFAULT_WIDTH = 32
DEFAULT_HEIGHT = 12
SUBPIX_X = 2
SUBPIX_Y = 4

# Braille dot bits for the (dx, dy) sub-pixel position within a cell.
BRAILLE_BITS = {
    (0, 0): 0x01, (0, 1): 0x02, (0, 2): 0x04, (0, 3): 0x40,
    (1, 0): 0x08, (1, 1): 0x10, (1, 2): 0x20, (1, 3): 0x80,
}


def solve_elbow(shoulder, hand, upper_len, fore_len, bend_down=True):
    """2-bone inverse kinematics. Returns (elbow_x, elbow_y).

    `bend_down=True` places the elbow on the side of the shoulder→hand line
    with larger y (below in screen space, like an arm sagging under gravity).
    If the arm can't reach the hand (d > upper_len + fore_len), the forearm
    would elongate — we clamp the hand to the max reach along the line
    direction so bones stay their configured length.
    """
    sx, sy = shoulder
    hx, hy = hand
    dx, dy = hx - sx, hy - sy
    d = math.hypot(dx, dy)
    if d < 1e-6:
        return (sx + upper_len, sy)
    if d >= upper_len + fore_len:
        # Arm fully extended. Elbow on the line; caller should understand
        # forearm may not reach the hand. We place elbow at upper_len along.
        return (sx + dx * upper_len / d, sy + dy * upper_len / d)
    d_foot = (upper_len * upper_len - fore_len * fore_len + d * d) / (2 * d)
    h = math.sqrt(max(0, upper_len * upper_len - d_foot * d_foot))
    fx = sx + dx * d_foot / d
    fy = sy + dy * d_foot / d
    perp_a = (-dy / d, dx / d)
    perp_b = (dy / d, -dx / d)
    # Pick perpendicular with LARGER y (below the line in screen space).
    down_perp = perp_a if perp_a[1] > perp_b[1] else perp_b
    perp = down_perp if bend_down else (-down_perp[0], -down_perp[1])
    return (fx + perp[0] * h, fy + perp[1] * h)


def catmull_rom(points, steps=60):
    """Catmull-Rom spline through points. Returns list of (x,y) samples."""
    if len(points) < 2:
        return [(p[0], p[1]) for p in points]
    pts = [points[0]] + list(points) + [points[-1]]
    out = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        for j in range(steps):
            t = j / steps
            t2 = t * t
            t3 = t2 * t

            def c(a0, a1, a2, a3):
                return 0.5 * (
                    (2 * a1)
                    + (-a0 + a2) * t
                    + (2 * a0 - 5 * a1 + 4 * a2 - a3) * t2
                    + (-a0 + 3 * a1 - 3 * a2 + a3) * t3
                )

            out.append((c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])))
    out.append(pts[-2])
    return out


def draw_line(bitmap, x0, y0, x1, y1):
    """Bresenham line between two pixel coords."""
    H = len(bitmap)
    W = len(bitmap[0]) if H else 0
    x0, y0, x1, y1 = int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))
    dx = abs(x1 - x0)
    dy = -abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx + dy
    while True:
        if 0 <= x0 < W and 0 <= y0 < H:
            bitmap[y0][x0] = 1
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy


def draw_thick_line(bitmap, x0, y0, x1, y1, thickness=2):
    """Draw a line with given pixel thickness by offsetting parallel Bresenham
    draws perpendicular to the segment direction. Thickness 1 = thin line."""
    dx = x1 - x0
    dy = y1 - y0
    length = math.hypot(dx, dy)
    if length < 0.5 or thickness <= 1:
        draw_line(bitmap, x0, y0, x1, y1)
        return
    px = -dy / length
    py = dx / length
    # Offsets centered around 0: for thickness=2 → [-0.5, 0.5]; thickness=3 → [-1, 0, 1]
    half = (thickness - 1) / 2
    offsets = [i - half for i in range(thickness)]
    for off in offsets:
        ox = off * px
        oy = off * py
        draw_line(bitmap, x0 + ox, y0 + oy, x1 + ox, y1 + oy)


def curve_to_bitmap(samples, width, height):
    """Rasterize a list of (col, row) samples onto a sub-pixel bitmap."""
    W = width * SUBPIX_X
    H = height * SUBPIX_Y
    bitmap = [[0] * W for _ in range(H)]
    prev = None
    for (cx, cy) in samples:
        px = cx * SUBPIX_X + SUBPIX_X / 2 - 0.5
        py = cy * SUBPIX_Y + SUBPIX_Y / 2 - 0.5
        if prev is not None:
            draw_line(bitmap, prev[0], prev[1], px, py)
        prev = (px, py)
    return bitmap


def bitmap_to_braille(bitmap, width, height):
    """Pack a sub-pixel bitmap into Braille characters, one per terminal cell."""
    lines = []
    for cy in range(height):
        row_chars = []
        for cx in range(width):
            bits = 0
            for (dx, dy), bit in BRAILLE_BITS.items():
                px = cx * SUBPIX_X + dx
                py = cy * SUBPIX_Y + dy
                if bitmap[py][px]:
                    bits |= bit
            row_chars.append(chr(0x2800 + bits) if bits else " ")
        lines.append("".join(row_chars))
    return lines


def render_frame(
    handle,
    path,
    glyphs=None,
    width=DEFAULT_WIDTH,
    height=DEFAULT_HEIGHT,
    shoulder=None,
    elbow=None,
    arm_length=(4.0, 4.0),
    arm_thickness=2,
    whip_thickness=1,
    hand_glyph="/",
):
    hx, hy = handle
    glyph_len = len(hand_glyph)

    whip_bitmap = [[0] * (width * SUBPIX_X) for _ in range(height * SUBPIX_Y)]
    arm_bitmap = [[0] * (width * SUBPIX_X) for _ in range(height * SUBPIX_Y)]

    # Whip: Catmull-Rom through handle+path waypoints, rasterized onto its
    # own bitmap so we can distinguish it from the arm during char assembly.
    whip_samples = catmull_rom(
        [(hx + glyph_len, hy)] + [tuple(p) for p in path], steps=60
    )
    prev = None
    for (cx, cy) in whip_samples:
        px = cx * SUBPIX_X + SUBPIX_X / 2 - 0.5
        py = cy * SUBPIX_Y + SUBPIX_Y / 2 - 0.5
        if prev is not None:
            draw_thick_line(
                whip_bitmap, prev[0], prev[1], px, py, thickness=whip_thickness
            )
        prev = (px, py)

    # Arm: shoulder → elbow → hand as two straight segments on the arm bitmap.
    # Elbow from JSON if provided, else 2-bone IK with bend_down (elbow on the
    # screen-down side of the shoulder-hand line — the gravity-natural side).
    if shoulder is not None:
        if elbow is None:
            elbow = solve_elbow(
                shoulder,
                (hx - 0.3, hy),
                arm_length[0],
                arm_length[1],
                bend_down=True,
            )
        seg_samples = []
        steps = 30
        for t in range(steps + 1):
            u = t / steps
            seg_samples.append(
                (
                    shoulder[0] + u * (elbow[0] - shoulder[0]),
                    shoulder[1] + u * (elbow[1] - shoulder[1]),
                )
            )
        ax_end = hx - 0.3
        ay_end = hy
        for t in range(steps + 1):
            u = t / steps
            seg_samples.append(
                (
                    elbow[0] + u * (ax_end - elbow[0]),
                    elbow[1] + u * (ay_end - elbow[1]),
                )
            )
        prev = None
        for (cx, cy) in seg_samples:
            px = cx * SUBPIX_X + SUBPIX_X / 2 - 0.5
            py = cy * SUBPIX_Y + SUBPIX_Y / 2 - 0.5
            if prev is not None:
                draw_thick_line(
                    arm_bitmap, prev[0], prev[1], px, py, thickness=arm_thickness
                )
            prev = (px, py)

    # Build the per-cell character grid. Arm cells are wrapped in ANSI bold
    # so the forearm/upper-arm strokes appear thicker than the whip. If a
    # cell has both arm and whip dots, the arm glyph is rendered (and its
    # Braille bits union both layers).
    grid = [[" "] * width for _ in range(height)]
    for cy in range(height):
        for cx in range(width):
            arm_bits = 0
            whip_bits = 0
            for (dx, dy), bit in BRAILLE_BITS.items():
                px = cx * SUBPIX_X + dx
                py = cy * SUBPIX_Y + dy
                if arm_bitmap[py][px]:
                    arm_bits |= bit
                if whip_bitmap[py][px]:
                    whip_bits |= bit
            if arm_bits:
                ch = chr(0x2800 + (arm_bits | whip_bits))
                grid[cy][cx] = f"\033[1m{ch}\033[22m"
            elif whip_bits:
                grid[cy][cx] = chr(0x2800 + whip_bits)

    # Hand glyph overlays Braille/arm/whip on top.
    for i, ch in enumerate(hand_glyph):
        col = hx + i
        if 0 <= hy < height and 0 <= col < width:
            grid[hy][col] = ch

    # Overlay extra ASCII glyphs (sparks, crack starbursts, etc.).
    if glyphs:
        for g in glyphs:
            ax, ay = g["at"]
            for dy, row_str in enumerate(g["rows"]):
                for dx, ch in enumerate(row_str):
                    if ch == " ":
                        continue
                    x, y = ax + dx, ay + dy
                    if 0 <= x < width and 0 <= y < height:
                        grid[y][x] = ch

    return ["".join(r).rstrip() for r in grid]


def emit_preview(spec):
    width = spec.get("width", DEFAULT_WIDTH)
    height = spec.get("height", DEFAULT_HEIGHT)
    default_dur = spec.get("duration", 0.04)
    default_shoulder = spec.get("shoulder")
    for f in spec["frames"]:
        lines = render_frame(
            f["handle"],
            f["path"],
            f.get("glyphs"),
            width=width,
            height=height,
            shoulder=f.get("shoulder", default_shoulder),
            elbow=f.get("elbow"),
            arm_length=tuple(spec.get("arm_length", (4.0, 4.0))),
            arm_thickness=spec.get("arm_thickness", 3),
            whip_thickness=spec.get("whip_thickness", 1),
            hand_glyph=f.get("hand_glyph", spec.get("hand_glyph", "O=")),
        )
        print(f"=== {f.get('id', 'frame')}  sleep={f.get('duration', default_dur)}s ===")
        print("+" + "-" * width + "+")
        for i in range(height):
            line = lines[i] if i < len(lines) else ""
            print(f"|{line:<{width}}|")
        print("+" + "-" * width + "+")
        print()


def emit_bash(spec, source_path=None):
    width = spec.get("width", DEFAULT_WIDTH)
    height = spec.get("height", DEFAULT_HEIGHT)
    header = spec.get("header", "")
    lines_out = []
    lines_out.append("#!/usr/bin/env bash")
    if source_path:
        lines_out.append(f"# Generated from {source_path}. Edit the JSON, not this file.")
    if header:
        for line in header.rstrip().split("\n"):
            lines_out.append(f"# {line}")
    lines_out.append("")
    lines_out.append(f"HEIGHT={height}")
    lines_out.append("")
    lines_out.append("printf '\\033[?25l'")
    lines_out.append("trap 'printf \"\\033[?25h\"' EXIT")
    lines_out.append("")
    lines_out.append("frame() {")
    lines_out.append("  printf '\\033[2J\\033[H'")
    lines_out.append("  local row=1")
    lines_out.append("  for line in \"$@\"; do")
    lines_out.append("    printf '\\033[%d;1H%s' \"$row\" \"$line\"")
    lines_out.append("    (( row++ ))")
    lines_out.append("  done")
    lines_out.append("}")
    lines_out.append("")

    default_dur = spec.get("duration", 0.04)
    default_shoulder = spec.get("shoulder")
    for f in spec["frames"]:
        rendered = render_frame(
            f["handle"],
            f["path"],
            f.get("glyphs"),
            width=width,
            height=height,
            shoulder=f.get("shoulder", default_shoulder),
            elbow=f.get("elbow"),
            arm_length=tuple(spec.get("arm_length", (4.0, 4.0))),
            arm_thickness=spec.get("arm_thickness", 3),
            whip_thickness=spec.get("whip_thickness", 1),
            hand_glyph=f.get("hand_glyph", spec.get("hand_glyph", "O=")),
        )
        while len(rendered) < height:
            rendered.append("")
        rendered = rendered[:height]
        lines_out.append(f"# {f.get('id', '')}")
        lines_out.append("frame \\")
        for i, line in enumerate(rendered):
            esc = line.replace("\\", "\\\\").replace("`", "\\`").replace('"', '\\"')
            sep = " \\" if i < len(rendered) - 1 else ""
            lines_out.append(f'  "{esc}"{sep}')
        lines_out.append(f"sleep {f.get('duration', default_dur)}")
        lines_out.append("")

    return "\n".join(lines_out) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("spec", help="Path to frames JSON")
    ap.add_argument(
        "--emit",
        choices=["preview", "bash"],
        default="preview",
    )
    ap.add_argument("-o", "--output", help="Write bash output to this path (default stdout)")
    args = ap.parse_args()

    spec = json.loads(Path(args.spec).read_text())
    if args.emit == "preview":
        emit_preview(spec)
    else:
        bash = emit_bash(spec, source_path=args.spec)
        if args.output:
            Path(args.output).write_text(bash)
            Path(args.output).chmod(0o755)
            print(f"wrote {args.output}", file=sys.stderr)
        else:
            sys.stdout.write(bash)


if __name__ == "__main__":
    main()
