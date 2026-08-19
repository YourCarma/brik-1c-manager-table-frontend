#!/usr/bin/env python3
"""Генератор логотипа комплекса «ОПОРА». Советский минимализм: колонна + звезда."""
import math, os, textwrap

OUT = os.path.dirname(os.path.abspath(__file__))

CREAM = "#F0E6D2"
RED   = "#C1121F"
BLACK = "#141210"

# ---------------------------------------------------------------- звезда
def star(cx, cy, R, ratio=0.382, rot=-90):
    pts = []
    for i in range(10):
        r = R if i % 2 == 0 else R * ratio
        a = math.radians(rot + i * 36)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return "M" + " L".join(f"{x:.2f},{y:.2f}" for x, y in pts) + " Z"

# ---------------------------------------------------------------- колонна (пилон)
def pylon(cx, y_top, y_bot, hw_top, hw_bot, flutes=True):
    """Трапециевидный пилон с вертикальными каннелюрами (evenodd-вырезы)."""
    def hw(y):
        t = (y - y_top) / (y_bot - y_top)
        return hw_top + (hw_bot - hw_top) * t
    def X(u, y):
        return cx + u * hw(y)
    d = (f"M{X(-1,y_top):.2f},{y_top:.2f} L{X(1,y_top):.2f},{y_top:.2f} "
         f"L{X(1,y_bot):.2f},{y_bot:.2f} L{X(-1,y_bot):.2f},{y_bot:.2f} Z")
    if flutes:
        for u0, u1 in ((-0.62, -0.40), (-0.11, 0.11), (0.40, 0.62)):
            ya, yb = y_top, y_bot
            d += (f" M{X(u0,ya):.2f},{ya:.2f} L{X(u1,ya):.2f},{ya:.2f} "
                  f"L{X(u1,yb):.2f},{yb:.2f} L{X(u0,yb):.2f},{yb:.2f} Z")
    return d

# ---------------------------------------------------------------- буквы (пути, без шрифтов)
T = 22.0   # толщина штриха
H = 100.0  # высота прописной

LETTERS = {
    "О": (100.0, "M0,50 a50,50 0 1,0 100,0 a50,50 0 1,0 -100,0 "
                 "M22,50 a28,28 0 1,0 56,0 a28,28 0 1,0 -56,0"),
    "П": (78.0,  "M0,0 H78 V100 H56 V22 H22 V100 H0 Z"),
    "Р": (78.0,  "M0,0 H78 V64 H22 V100 H0 Z M22,22 H56 V42 H22 Z"),
    "А": (84.0,  "M31,0 L53,0 L84,100 L0,100 Z "
                 "M42,35.5 L52.7,70 L31.3,70 Z "
                 "M25.72,88 L58.28,88 L62,100 L22,100 Z"),
}

def wordmark(text="ОПОРА", gap=22.0, x=0.0, y=0.0, scale=1.0, fill=BLACK):
    parts, cur = [], 0.0
    for ch in text:
        w, d = LETTERS[ch]
        parts.append(f'<path d="{d}" transform="translate({cur:.2f},0)"/>')
        cur += w + gap
    width = cur - gap
    body = "".join(parts)
    g = (f'<g transform="translate({x:.2f},{y:.2f}) scale({scale:.4f})" '
         f'fill="{fill}" fill-rule="evenodd">{body}</g>')
    return g, width * scale, H * scale

# ---------------------------------------------------------------- эмблема
def emblem(size=200, bg=None, mark=BLACK, star_fill=RED, flutes=True, plinth=True):
    """Знак: звезда над каннелированной колонной с капителью и плинтом."""
    s = size / 200.0
    o = []
    if bg:
        o.append(f'<rect width="{size}" height="{size}" fill="{bg}"/>')
    g = [f'<path d="{star(100, 51, 35)}" fill="{star_fill}"/>']
    if plinth:
        # капитель
        g.append(f'<rect x="63" y="86" width="74" height="13" fill="{mark}"/>')
    g.append(f'<path d="{pylon(100, 99, 158, 28, 38, flutes)}" fill="{mark}" fill-rule="evenodd"/>')
    if plinth:
        g.append(f'<rect x="53" y="158" width="94" height="10" fill="{mark}"/>')
        g.append(f'<rect x="44" y="168" width="112" height="14" fill="{mark}"/>')
    o.append(f'<g transform="translate(0,{1*1:.0f}) scale({s:.5f})">{"".join(g)}</g>')
    return "".join(o)

def svg(w, h, body, bg=None):
    b = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
            f'width="{w}" height="{h}">{b}{body}</svg>')

def write(name, content):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write(content)
    return name

files = []

# 1. Основной знак (без фона, для любых носителей)
files.append(write("opora-mark.svg", svg(200, 200, emblem(200), bg=None)))

# 2. Знак в круглой медали (аватар / печать)
def badge(size=240, field=RED, ring=BLACK, mark=CREAM, star_fill=CREAM):
    c = size / 2
    body = [f'<circle cx="{c}" cy="{c}" r="{c}" fill="{ring}"/>',
            f'<circle cx="{c}" cy="{c}" r="{c*0.955:.2f}" fill="{field}"/>',
            f'<circle cx="{c}" cy="{c}" r="{c*0.885:.2f}" fill="none" stroke="{ring}" stroke-width="{size*0.011:.2f}"/>']
    inner = size * 0.80
    off = (size - inner) / 2
    body.append(f'<g transform="translate({off:.2f},{off:.2f})">'
                f'{emblem(inner, None, mark, star_fill)}</g>')
    return "".join(body)
files.append(write("opora-badge.svg", svg(240, 240, badge(240))))

# 3. Горизонтальный логотип: знак + «ОПОРА»
wm, ww, wh = wordmark(scale=0.62, fill=BLACK)
mark_w = 176
s_m = mark_w / 200.0
pad, gap_mx = 34, 46
Hh = 220
W = pad + mark_w + gap_mx + ww + pad
mark_y = 36 - 14 * s_m                 # содержимое знака: 16..183 в локальных координатах
wm_y = Hh / 2 - wh / 2 - 6             # оптическое выравнивание по центру знака
xw = pad + mark_w + gap_mx
body = (f'<g transform="translate({pad},{mark_y:.1f})">{emblem(mark_w)}</g>'
        f'<g transform="translate({xw:.1f},{wm_y:.1f})">{wm}</g>'
        f'<rect x="{xw:.1f}" y="{wm_y+wh+18:.1f}" width="{ww:.1f}" height="7" fill="{RED}"/>')
files.append(write("opora-lockup-h.svg", svg(round(W), Hh, body, bg=CREAM)))

# 4. Вертикальный логотип с подписью
wm2, ww2, wh2 = wordmark(scale=0.78, fill=BLACK)
W2, H2 = 560, 430
mark_w2 = 180
body = (f'<g transform="translate({(W2-mark_w2)/2:.1f},34)">{emblem(mark_w2)}</g>'
        f'<g transform="translate({(W2-ww2)/2:.1f},252)">{wm2}</g>'
        f'<rect x="{(W2-ww2)/2:.1f}" y="{252+wh2+20:.1f}" width="{ww2:.1f}" height="7" fill="{RED}"/>'
        f'<text x="{W2/2:.1f}" y="{252+wh2+66:.1f}" text-anchor="middle" '
        f'font-family="Arial Narrow, Helvetica Neue, Arial, sans-serif" font-size="18" '
        f'letter-spacing="6" fill="{BLACK}" opacity="0.85">КОМПЛЕКС ИИ-АВТОМАТИЗАЦИИ</text>')
files.append(write("opora-lockup-v.svg", svg(W2, H2, body, bg=CREAM)))

# 5. Монохром (одноцветная печать, штамп, вырубка)
files.append(write("opora-mono.svg", svg(200, 200, emblem(200, None, BLACK, BLACK))))

# 6. Инверсия: кремовый знак на красном поле
inv = (f'<rect width="200" height="200" fill="{RED}"/>' + emblem(200, None, CREAM, CREAM))
files.append(write("opora-invert.svg", svg(200, 200, inv)))

# 7. Иконка 32px: без каннелюр и плинта — читается в мелком размере
icon = (f'<rect width="64" height="64" rx="8" fill="{RED}"/>'
        f'<g transform="translate(6,7)">{emblem(52, None, CREAM, CREAM, flutes=False, plinth=True)}</g>')
files.append(write("opora-icon.svg", svg(64, 64, icon)))

print("\n".join(files))
