"""Motor de dibujo estilo 'tinta a mano': monigotes, props y texto, con linea temblorosa."""
import math, random, os
from PIL import Image, ImageDraw, ImageFont

W, H, SS = 1920, 1080, 2
HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = {
    'lucky': HERE + '/fonts/LuckiestGuy-Regular.ttf',
    'hand': HERE + '/fonts/PatrickHand-Regular.ttf',
}

INK = (28, 26, 30); WHITE = (255, 255, 255); CREAM = (246, 228, 196)
FUR = (165, 104, 55); FUR2 = (118, 72, 36); HAIR = (92, 56, 28)
YEL = (255, 212, 38); ORANGE = (255, 138, 28); RED = (222, 52, 42)
GREEN = (112, 182, 72); DGREEN = (58, 128, 50); LGREEN = (196, 230, 160)
SKY = (162, 214, 244); GRASS = (156, 204, 98); GRAY = (150, 150, 152)
STONE = (138, 134, 128); LSTONE = (190, 186, 178); BLUE = (70, 140, 230)
BROWN = (142, 96, 58); DBROWN = (96, 62, 36); NIGHT = (36, 32, 46)
BONE = (240, 232, 210); PINK = (240, 150, 160); TAN = (214, 178, 128)
ICE = (200, 232, 248); SICK = (212, 236, 186); PURPLE = (150, 100, 200)


class G:
    img = None; d = None; cam = (1.0, 960.0, 540.0); rot = None
    boil = 0; seed = 0; n = 0; t = 0.0


def begin(t, seed, bg=CREAM):
    G.img = Image.new('RGB', (W * SS, H * SS), bg)
    G.d = ImageDraw.Draw(G.img)
    G.t = t; G.boil = int(t * 6); G.seed = seed; G.n = 0
    G.cam = (1.0, 960.0, 540.0); G.rot = None


def end():
    return G.img.reduce(SS)


def cam(z=1.0, cx=960, cy=540):
    G.cam = (z, cx, cy)


def T(x, y):
    if G.rot:
        a, px, py = G.rot
        c, s = math.cos(a), math.sin(a)
        x, y = px + (x - px) * c - (y - py) * s, py + (x - px) * s + (y - py) * c
    z, cx, cy = G.cam
    return (((x - cx) * z + W / 2) * SS, ((y - cy) * z + H / 2) * SS)


def TW(w):
    return max(1, int(w * G.cam[0] * SS))


def R():
    G.n += 1
    return random.Random((G.seed * 1000003 + G.boil * 7919 + G.n * 104729) & 0xffffffff)


# ---------- utilidades de animacion ----------
def clamp(v, a=0.0, b=1.0):
    return a if v < a else b if v > b else v


def lerp(a, b, u):
    return a + (b - a) * u


def ease(u):
    u = clamp(u); return u * u * (3 - 2 * u)


def eob(u):  # ease out back
    u = clamp(u); c = 1.9
    return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2


def pop(t, t0, d=0.35):
    if t < t0: return 0.0
    return eob((t - t0) / d)


def prog(t, t0, d):
    return ease((t - t0) / d) if d > 0 else (1.0 if t >= t0 else 0.0)


# ---------- primitivas temblorosas ----------
def _dens(pts, closed, step=10):
    seq = list(pts) + ([pts[0]] if closed else [])
    out = []; total = 0.0; nx = ny = 0.0
    for i in range(len(seq) - 1):
        x0, y0 = seq[i]; x1, y1 = seq[i + 1]
        L = math.hypot(x1 - x0, y1 - y0)
        if L > 0: nx, ny = -(y1 - y0) / L, (x1 - x0) / L
        n = max(1, int(L / step))
        for k in range(n):
            u = k / n
            out.append((x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, nx, ny, total + L * u))
        total += L
    if not closed:
        out.append((seq[-1][0], seq[-1][1], nx, ny, total))
    return out


def wob(pts, amp=2.0, closed=False):
    if amp <= 0 or len(pts) < 2: return list(pts)
    r = R(); p1, p2 = r.uniform(0, 6.28), r.uniform(0, 6.28)
    f1, f2 = r.uniform(0.008, 0.014), r.uniform(0.02, 0.035)
    res = []
    for x, y, nx, ny, s in _dens(pts, closed):
        o = amp * (0.65 * math.sin(s * f1 + p1) + 0.35 * math.sin(s * f2 + p2))
        res.append((x + nx * o, y + ny * o))
    return res


def line(pts, w=6, c=INK, amp=1.8):
    if len(pts) < 2: return
    q = [T(*p) for p in wob(pts, amp)]
    ww = TW(w)
    G.d.line(q, fill=c, width=ww, joint='curve')
    r = ww / 2
    for (x, y) in (q[0], q[-1]):
        G.d.ellipse([x - r, y - r, x + r, y + r], fill=c)


def poly(pts, fill=None, oc=INK, w=6, amp=1.8):
    q = [T(*p) for p in wob(pts, amp, closed=True)]
    if len(q) < 3: return
    if fill: G.d.polygon(q, fill=fill)
    if oc and w > 0: G.d.line(q + [q[0]], fill=oc, width=TW(w), joint='curve')


def ell(x, y, rx, ry, fill=None, oc=INK, w=6, amp=1.6, rot=0.0, n=44):
    r = R(); p1, p2 = r.uniform(0, 6.28), r.uniform(0, 6.28)
    k = amp / max(rx, ry, 1)
    pts = []
    cr, sr = math.cos(rot), math.sin(rot)
    for i in range(n):
        a = 2 * math.pi * i / n
        m = 1 + k * (0.6 * math.sin(2 * a + p1) + 0.4 * math.sin(3 * a + p2))
        px, py = math.cos(a) * rx * m, math.sin(a) * ry * m
        pts.append((x + px * cr - py * sr, y + px * sr + py * cr))
    poly(pts, fill, oc, w, amp=0)


def circ(x, y, r, fill=None, oc=INK, w=6, amp=1.6):
    ell(x, y, r, r, fill, oc, w, amp)


def dot(x, y, r, c=INK):
    (a, b) = T(x, y); rr = r * G.cam[0] * SS
    G.d.ellipse([a - rr, b - rr, a + rr, b + rr], fill=c)


def rect_raw(x0, y0, x1, y1, fill):
    a = T(x0, y0); b = T(x1, y1)
    G.d.rectangle([min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1])], fill=fill)


def rect(x, y, w, h, fill=None, oc=INK, lw=6, amp=1.8):
    poly([(x, y), (x + w, y), (x + w, y + h), (x, y + h)], fill, oc, lw, amp)


def arc(x, y, r, a0, a1, w=6, c=INK, ry=None, n=16):
    ry = ry or r
    pts = [(x + math.cos(math.radians(lerp(a0, a1, i / n))) * r,
            y + math.sin(math.radians(lerp(a0, a1, i / n))) * ry) for i in range(n + 1)]
    line(pts, w, c, amp=0.6)


_fc = {}


def F(name, px):
    k = (name, int(px))
    if k not in _fc: _fc[k] = ImageFont.truetype(FONTS[name], max(4, int(px)))
    return _fc[k]


def text(s, x, y, size=80, fill=YEL, stroke=INK, sw=None, font='lucky', anchor='mm', sc=1.0):
    if sc <= 0.02: return
    px = size * sc * G.cam[0] * SS
    swp = 0
    if stroke:
        swp = int((sw if sw is not None else size * 0.08) * sc * G.cam[0] * SS)
    G.d.multiline_text(T(x, y), s, font=F(font, px), fill=fill, anchor=anchor, stroke_width=swp,
                       stroke_fill=stroke, align='center', spacing=int(px * 0.12))


def text_w(s, size, font='lucky'):
    f = F(font, size)
    b = f.getbbox(s)
    return b[2] - b[0]


# ---------- props ----------
def fire(x, y, s=1.0, t=0.0, on=1.0):
    line([(x - 70 * s, y + 5 * s), (x + 70 * s, y - 18 * s)], w=20 * s, c=DBROWN)
    line([(x - 70 * s, y - 18 * s), (x + 70 * s, y + 5 * s)], w=20 * s, c=BROWN)
    if on <= 0.02:
        for i in range(3):
            smoke(x + (i - 1) * 20 * s, y - 40 * s, t + i * 0.5, s * 0.6)
        return
    for col, k in ((ORANGE, 1.0), (YEL, 0.58)):
        bw = 62 * s * k * on; h = 170 * s * k * on
        pts = []
        for i in range(9):
            u = -1 + i / 4
            hm = h * (1 - abs(u) ** 2)
            if i % 2 == 1:
                hy = hm * (0.78 + 0.22 * math.sin(t * 11 + i * 2.1))
            else:
                hy = hm * 0.42 * (0.85 + 0.15 * math.sin(t * 7 + i))
            pts.append((x + u * bw + math.sin(t * 5 + i) * 4 * s, y - 8 * s - hy))
        pts += [(x + bw * 0.85, y - 6 * s), (x, y + 4 * s), (x - bw * 0.85, y - 6 * s)]
        poly(pts, col, INK if k == 1.0 else None, 5 * s, amp=1.0)


def glow(x, y, rx, ry, col):
    ell(x, y, rx, ry, col, None, 0, amp=3)


def smoke(x, y, t, s=1.0):
    for i in range(3):
        u = ((t * 0.5 + i / 3) % 1.0)
        circ(x + math.sin(u * 6 + i) * 25 * s, y - u * 160 * s, (14 + u * 26) * s,
             (200, 200, 205), (120, 120, 125), 3 * s, amp=2)


def stone_knife(x, y, s=1.0, ang=0.0):
    pts = [(-10, 40), (12, 38), (16, -10), (2, -60), (-14, -8)]
    c, sn = math.cos(ang), math.sin(ang)
    q = [(x + (px * c - py * sn) * s, y + (px * sn + py * c) * s) for px, py in pts]
    poly(q, LSTONE, INK, 5 * s)
    line([q[2], q[3]], 3 * s, (230, 230, 235), amp=0)


def leaf(x, y, s=1.0, ang=0.0, col=GREEN):
    c, sn = math.cos(ang), math.sin(ang)
    def P(px, py): return (x + (px * c - py * sn) * s, y + (px * sn + py * c) * s)
    pts = [P(0, 0)] + [P(lerp(0, 60, i / 8), -18 * math.sin(math.pi * i / 8)) for i in range(1, 8)] + \
          [P(60, 0)] + [P(lerp(60, 0, i / 8), 18 * math.sin(math.pi * i / 8)) for i in range(1, 8)]
    poly(pts, col, INK, 4 * s, amp=0.6)
    line([P(0, 0), P(55, 0)], 3 * s, INK, amp=0.3)


def plant(x, y, s=1.0, col=GREEN, t=0.0):
    sw = math.sin(t * 2) * 4 * s
    line([(x, y), (x + sw, y - 120 * s)], 6 * s, DGREEN)
    for i, (dy, side) in enumerate([(30, -1), (55, 1), (80, -1), (105, 1)]):
        a = math.radians(-30 if side > 0 else -150)
        leaf(x + sw * dy / 120, y - dy * s, 0.8 * s, a, col)


def berry(x, y, r=12, col=PURPLE):
    circ(x, y, r, col, INK, 3)
    dot(x - r * 0.3, y - r * 0.3, r * 0.25, WHITE)


def mushroom_bracket(x, y, s=1.0):
    poly([(x - 30 * s, y), (x + 30 * s, y)] + [(x + 30 * s * math.cos(a), y + 26 * s * math.sin(a))
         for a in [i * math.pi / 8 for i in range(1, 8)]], (232, 210, 170), INK, 4 * s)
    line([(x - 20 * s, y + 8 * s), (x + 20 * s, y + 8 * s)], 2 * s, DBROWN, amp=0.5)


def magnifier(x, y, s=1.0):
    line([(x + 45 * s, y + 45 * s), (x + 110 * s, y + 110 * s)], 16 * s, DBROWN)
    circ(x, y, 62 * s, (205, 235, 250), INK, 9 * s)
    arc(x - 8 * s, y - 8 * s, 38 * s, 200, 260, 6 * s, WHITE)


def tree(x, y, s=1.0, col=GREEN):
    poly([(x - 22 * s, y), (x - 14 * s, y - 200 * s), (x + 14 * s, y - 200 * s), (x + 22 * s, y)], BROWN, INK, 5 * s)
    for dx, dy, r in ((-70, -230, 90), (70, -240, 95), (0, -320, 110)):
        circ(x + dx * s, y + dy * s, r * s, col, INK, 6 * s, amp=5)


def acacia(x, y, s=1.0):
    line([(x, y), (x - 10 * s, y - 120 * s), (x - 60 * s, y - 190 * s)], 16 * s, BROWN)
    line([(x - 10 * s, y - 120 * s), (x + 50 * s, y - 200 * s)], 14 * s, BROWN)
    ell(x - 10 * s, y - 215 * s, 170 * s, 45 * s, DGREEN, INK, 5 * s, amp=4)


def sign(x, y, w, h, txt, size=46, col=(222, 186, 130), fill=INK, stroke=None):
    line([(x, y), (x, y - h - 40)], 12, DBROWN)
    rect(x - w / 2, y - h - 110, w, 110 + 0 * h, col, INK, 6)
    text(txt, x, y - h - 55, size, fill, stroke, font='lucky')


def bottle(x, y, s=1.0, label='', col=(150, 200, 230)):
    poly([(x - 34 * s, y), (x - 34 * s, y - 80 * s), (x - 14 * s, y - 100 * s), (x - 14 * s, y - 128 * s),
          (x + 14 * s, y - 128 * s), (x + 14 * s, y - 100 * s), (x + 34 * s, y - 80 * s), (x + 34 * s, y)], col, INK, 5 * s)
    rect(x - 18 * s, y - 146 * s, 36 * s, 20 * s, BROWN, INK, 4 * s)
    if label:
        rect(x - 30 * s, y - 68 * s, 60 * s, 40 * s, WHITE, INK, 3 * s)
        text(label, x, y - 48 * s, 15 * s, INK, None)


def skull(x, y, s=1.0, hole=0.0, healed=0.0, col=BONE):
    circ(x, y, 70 * s, col, INK, 6 * s)
    poly([(x - 40 * s, y + 40 * s), (x + 40 * s, y + 40 * s), (x + 32 * s, y + 85 * s), (x - 32 * s, y + 85 * s)], col, INK, 6 * s)
    ell(x - 26 * s, y + 8 * s, 18 * s, 22 * s, INK, None, 0)
    ell(x + 26 * s, y + 8 * s, 18 * s, 22 * s, INK, None, 0)
    poly([(x, y + 32 * s), (x - 8 * s, y + 48 * s), (x + 8 * s, y + 48 * s)], INK, None, 0)
    for i in range(-2, 3):
        line([(x + i * 13 * s, y + 66 * s), (x + i * 13 * s, y + 84 * s)], 3 * s, INK, amp=0.3)
    if hole > 0:
        hx, hy = x + 18 * s, y - 42 * s
        ell(hx, hy, 18 * s * hole, 14 * s * hole, (60, 50, 50), INK, 4 * s)
        if healed > 0:
            ell(hx, hy, (18 + 10 * healed) * s * hole, (14 + 8 * healed) * s * hole, None, (210, 190, 150), 6 * s * healed)


def bone(x0, y0, x1, y1, w=26, col=BONE, crack=0.0, gap=0.0, callus=0.0):
    ang = math.atan2(y1 - y0, x1 - x0); L = math.hypot(x1 - x0, y1 - y0)
    ux, uy = math.cos(ang), math.sin(ang); px, py = -uy, ux
    def seg(a, b):
        A = (x0 + ux * a, y0 + uy * a); B = (x0 + ux * b, y0 + uy * b)
        poly([(A[0] + px * w / 2, A[1] + py * w / 2), (B[0] + px * w / 2, B[1] + py * w / 2),
              (B[0] - px * w / 2, B[1] - py * w / 2), (A[0] - px * w / 2, A[1] - py * w / 2)], col, INK, 5)
    mid = L / 2
    if gap > 0:
        seg(0, mid - gap / 2); seg(mid + gap / 2, L)
    else:
        seg(0, L)
    for (cx, cy) in ((x0, y0), (x1, y1)):
        circ(cx + px * w * 0.45, cy + py * w * 0.45, w * 0.6, col, INK, 5)
        circ(cx - px * w * 0.45, cy - py * w * 0.45, w * 0.6, col, INK, 5)
    if gap <= 0:
        seg(w * 0.2, L - w * 0.2)
    if crack > 0 and gap <= 0:
        M = (x0 + ux * mid, y0 + uy * mid)
        zz = [(M[0] + px * w / 2 * k + ux * (6 if i % 2 else -6), M[1] + py * w / 2 * k + uy * (6 if i % 2 else -6))
              for i, k in enumerate([1, 0.5, 0, -0.5, -1])]
        line(zz, 4, RED if crack < 1 else INK, amp=0)
    if callus > 0:
        M = (x0 + ux * mid, y0 + uy * mid)
        ell(M[0], M[1], w * 1.0 * callus + 1, w * 0.85 * callus + 1, col, INK, 5, rot=ang)


def tooth(x, y, s=1.0, col=WHITE):
    pts = [(x - 90 * s, y - 60 * s), (x - 40 * s, y - 100 * s), (x, y - 80 * s), (x + 40 * s, y - 100 * s),
           (x + 90 * s, y - 60 * s), (x + 80 * s, y + 20 * s), (x + 55 * s, y + 130 * s), (x + 25 * s, y + 140 * s),
           (x + 10 * s, y + 50 * s), (x - 10 * s, y + 50 * s), (x - 25 * s, y + 140 * s), (x - 55 * s, y + 130 * s),
           (x - 80 * s, y + 20 * s)]
    poly(pts, col, INK, 8 * s)
    poly([(x - 80 * s, y - 10 * s), (x + 80 * s, y - 10 * s), (x + 78 * s, y + 18 * s), (x - 78 * s, y + 18 * s)],
         (225, 200, 120), INK, 4 * s)


def qmark(x, y, s=1.0, col=YEL):
    text('?', x, y, 120 * s, col, INK)


def check(x, y, s=1.0, col=GREEN):
    line([(x - 40 * s, y), (x - 10 * s, y + 32 * s), (x + 48 * s, y - 40 * s)], 18 * s, col, amp=1)


def cross(x, y, s=1.0, col=RED):
    line([(x - 45 * s, y - 45 * s), (x + 45 * s, y + 45 * s)], 16 * s, col, amp=1)
    line([(x + 45 * s, y - 45 * s), (x - 45 * s, y + 45 * s)], 16 * s, col, amp=1)


def worm(x, y, s=1.0, t=0.0, col=PINK, face=1):
    pts = [(x + face * i * 10 * s, y + math.sin(t * 8 + i * 0.9) * 8 * s) for i in range(7)]
    line(pts, 16 * s, INK, amp=0); line(pts, 10 * s, col, amp=0)
    dot(pts[-1][0], pts[-1][1] - 3 * s, 2.5 * s, INK)


def bubble(x, y, w, h, txt, tail=None, size=54, font='hand', col=WHITE):
    if tail:
        poly([(x - w * 0.12, y + h * 0.3), tail, (x + w * 0.08, y + h * 0.38)], col, INK, 5)
    ell(x, y, w / 2, h / 2, col, INK, 6, amp=2)
    if tail:
        poly([(x - w * 0.10, y + h * 0.26), (tail[0] * 0.15 + x * 0.85, tail[1] * 0.15 + y * 0.85 + h * 0.1),
              (x + w * 0.06, y + h * 0.34)], col, None, 0)
    text(txt, x, y, size, INK, None, font=font)


def thought(x, y, w, h, tail):
    for i, k in enumerate((0.25, 0.5)):
        circ(lerp(tail[0], x, k), lerp(tail[1], y + h / 2, k), 10 + i * 8, WHITE, INK, 4)
    ell(x, y, w / 2, h / 2, WHITE, INK, 6, amp=6)


def sub_button(x, y, s=1.0, done=False):
    col = (120, 120, 120) if done else (230, 30, 30)
    rect(x - 210 * s, y - 55 * s, 420 * s, 110 * s, col, INK, 6 * s)
    text('SUSCRITO' if done else 'SUSCRÍBETE', x, y + 6 * s, 54 * s, WHITE, None)


def cave_entrance(x, y, s=1.0, col=(150, 130, 112), inside=(30, 26, 30)):
    poly([(x - 380 * s, y), (x - 330 * s, y - 260 * s), (x - 180 * s, y - 380 * s), (x + 40 * s, y - 410 * s),
          (x + 260 * s, y - 330 * s), (x + 380 * s, y - 180 * s), (x + 420 * s, y)], col, INK, 7 * s, amp=4)
    poly([(x - 200 * s, y), (x - 170 * s, y - 170 * s), (x - 60 * s, y - 250 * s), (x + 80 * s, y - 240 * s),
          (x + 190 * s, y - 150 * s), (x + 220 * s, y)], inside, INK, 6 * s, amp=3)
    for dx, dy in ((-250, -120), (250, -90), (120, -320), (-160, -300)):
        line([(x + dx * s, y + dy * s), (x + (dx + 40) * s, y + (dy + 18) * s)], 4 * s, (110, 95, 85))


def hospital(x, y, s=1.0):
    rect(x - 90 * s, y - 160 * s, 180 * s, 160 * s, WHITE, INK, 5 * s)
    rect(x - 25 * s, y - 60 * s, 50 * s, 60 * s, SKY, INK, 4 * s)
    rect(x - 18 * s, y - 140 * s, 36 * s, 60 * s, RED, None, 0, amp=0)
    rect(x - 40 * s, y - 120 * s, 80 * s, 22 * s, RED, None, 0, amp=0)


def pill(x, y, s=1.0, ang=0.4):
    c, sn = math.cos(ang), math.sin(ang)
    ell(x, y, 70 * s, 30 * s, WHITE, INK, 6 * s, rot=ang)
    pts = [(x + (px * c - py * sn) * s, y + (px * sn + py * c) * s) for px, py in
           [(0, -30), (40, -27), (62, -15), (70, 0), (62, 15), (40, 27), (0, 30)]]
    poly(pts, RED, INK, 6 * s, amp=0.5)


def spear(x0, y0, x1, y1, s=1.0):
    line([(x0, y0), (x1, y1)], 9 * s, BROWN)
    a = math.atan2(y1 - y0, x1 - x0)
    tip = (x1 + math.cos(a) * 50 * s, y1 + math.sin(a) * 50 * s)
    pa = a + math.pi / 2
    poly([tip, (x1 + math.cos(pa) * 16 * s, y1 + math.sin(pa) * 16 * s),
          (x1 - math.cos(pa) * 16 * s, y1 - math.sin(pa) * 16 * s)], LSTONE, INK, 4 * s)


def pot(x, y, s=1.0):
    poly([(x - 40 * s, y - 120 * s), (x + 40 * s, y - 120 * s), (x + 30 * s, y - 100 * s), (x + 70 * s, y - 50 * s),
          (x + 50 * s, y), (x - 50 * s, y), (x - 70 * s, y - 50 * s), (x - 30 * s, y - 100 * s)], (205, 120, 70), INK, 6 * s)
    line([(x - 60 * s, y - 55 * s), (x + 60 * s, y - 55 * s)], 4 * s)


def meat(x, y, s=1.0):
    bone(x - 60 * s, y, x + 60 * s, y, w=14 * s)
    ell(x, y, 50 * s, 36 * s, (190, 80, 60), INK, 6 * s)


def heart(x, y, s=1.0, col=RED):
    pts = []
    for i in range(40):
        a = 2 * math.pi * i / 40
        hx = 16 * math.sin(a) ** 3
        hy = -(13 * math.cos(a) - 5 * math.cos(2 * a) - 2 * math.cos(3 * a) - math.cos(4 * a))
        pts.append((x + hx * 3 * s, y + hy * 3 * s))
    poly(pts, col, INK, 5 * s, amp=0.5)


def kit(x, y, s=1.0):
    rect(x - 70 * s, y - 100 * s, 140 * s, 100 * s, (220, 200, 160), INK, 6 * s)
    rect(x - 12 * s, y - 85 * s, 24 * s, 70 * s, RED, None, 0, amp=0)
    rect(x - 35 * s, y - 62 * s, 70 * s, 24 * s, RED, None, 0, amp=0)
    line([(x - 25 * s, y - 100 * s), (x - 20 * s, y - 120 * s), (x + 20 * s, y - 120 * s), (x + 25 * s, y - 100 * s)], 6 * s)


def bird(x, y, s=1.0, t=0.0):
    f = math.sin(t * 8) * 14 * s
    line([(x - 30 * s, y - f), (x, y), (x + 30 * s, y - f)], 6 * s)


def stars(seed=1, n=40, ymax=500):
    r = random.Random(seed)
    for i in range(n):
        x, y = r.uniform(0, 1920), r.uniform(0, ymax)
        tw = 0.5 + 0.5 * math.sin(G.t * 3 + i)
        dot(x, y, 2 + 2 * tw, (255, 250, 210))


def notes(x, y, t, s=1.0):
    for i in range(3):
        u = (t * 0.6 + i / 3) % 1
        nx, ny = x + i * 50 * s + math.sin(u * 6) * 15, y - u * 140 * s
        text('♪', nx, ny, 60 * s, WHITE, INK, font='hand')


def dashed_circle(x, y, r, col=RED, w=7):
    for i in range(16):
        a0 = i * 360 / 16; a1 = a0 + 14 + 0 * w
        arc(x, y, r, a0 + G.t * 20, a1 + G.t * 20, w, col)


def arrow(x0, y0, x1, y1, w=10, col=INK):
    line([(x0, y0), (x1, y1)], w, col)
    a = math.atan2(y1 - y0, x1 - x0)
    for d in (2.6, -2.6):
        line([(x1, y1), (x1 + math.cos(a + d) * 36, y1 + math.sin(a + d) * 36)], w, col)


def dotted(x0, y0, x1, y1, n=18, col=INK, r=4):
    for i in range(n + 1):
        u = i / n
        dot(lerp(x0, x1, u), lerp(y0, y1, u), r, col)


# ---------- fondos ----------
def bg_plain(ground=860, grass=True, col=CREAM):
    rect_raw(0, -400, 1920, 1500, col)
    rect_raw(-400, ground, 2400, 1500, (226, 196, 150))
    line([(-200, ground), (2200, ground)], 6, INK, amp=2)
    if grass:
        r = random.Random(7)
        for i in range(14):
            gx = r.uniform(-100, 2000)
            line([(gx, ground + 30), (gx + 8, ground + 8)], 4, (140, 110, 80), amp=0)
            line([(gx + 14, ground + 30), (gx + 22, ground + 12)], 4, (140, 110, 80), amp=0)


def bg_paper():
    rect_raw(-400, -400, 2400, 1500, CREAM)


def bg_savanna(ground=820, t=0.0):
    rect_raw(-400, -400, 2400, ground, SKY)
    circ(1650, 170, 70, YEL, INK, 5)
    poly([(-300, ground), (-300, ground - 90), (300, ground - 160), (900, ground - 80), (1500, ground - 170),
          (2300, ground - 60), (2300, ground)], (190, 220, 130), INK, 5, amp=4)
    rect_raw(-400, ground, 2400, 1500, GRASS)
    line([(-300, ground), (2300, ground)], 6)
    r = random.Random(3)
    for i in range(18):
        gx, gy = r.uniform(-100, 2000), r.uniform(ground + 30, 1060)
        line([(gx, gy), (gx - 8, gy - 22)], 4, DGREEN, amp=0)
        line([(gx + 6, gy), (gx + 10, gy - 26)], 4, DGREEN, amp=0)


def bg_jungle(ground=850, t=0.0):
    rect_raw(-400, -400, 2400, 1500, (190, 228, 170))
    for i, x in enumerate(range(-200, 2300, 260)):
        h = 300 + (i * 97) % 200
        line([(x, ground), (x + 20, ground - h)], 26, BROWN)
        for k in range(5):
            a = math.radians(-160 + k * 35 + math.sin(t + i + k) * 3)
            leaf(x + 20, ground - h, 2.4, a, DGREEN if (i + k) % 2 else GREEN)
    rect_raw(-400, ground, 2400, 1500, (120, 170, 80))
    line([(-300, ground), (2300, ground)], 6)
    for x in range(-100, 2100, 170):
        for k in range(3):
            leaf(x, ground + 10, 1.3, math.radians(-150 + k * 60), DGREEN)


def bg_mountain(ground=820):
    rect_raw(-400, -400, 2400, ground, (190, 222, 245))
    for (mx, mh, mw) in ((300, 520, 520), (900, 640, 600), (1550, 560, 560)):
        pk = (mx, ground - mh)
        poly([(mx - mw, ground), pk, (mx + mw, ground)], (150, 150, 165), INK, 6, amp=3)
        poly([pk, (mx - mw * 0.32, ground - mh * 0.68), (mx - mw * 0.12, ground - mh * 0.74),
              (mx + mw * 0.05, ground - mh * 0.64), (mx + mw * 0.3, ground - mh * 0.7)], WHITE, INK, 5, amp=2)
    rect_raw(-400, ground, 2400, 1500, (245, 248, 252))
    line([(-300, ground), (2300, ground)], 6)


def bg_cave_night(ground=850):
    rect_raw(-400, -400, 2400, 1500, NIGHT)
    poly([(-300, -300), (2300, -300), (2300, 120), (1700, 60), (1300, 140), (900, 70), (500, 130), (100, 60), (-300, 140)],
         (70, 60, 62), INK, 6, amp=4)
    poly([(-300, 140), (100, 60), (200, 400), (60, 700), (-300, 900)], (64, 55, 58), INK, 6, amp=4)
    poly([(2300, 120), (1700, 60), (1820, 380), (1760, 720), (2300, 900)], (64, 55, 58), INK, 6, amp=4)
    rect_raw(-400, ground, 2400, 1500, (70, 58, 52))
    line([(-300, ground), (2300, ground)], 6, (20, 18, 20))


def bg_black():
    rect_raw(-400, -400, 2400, 1500, (12, 12, 14))
