"""DISCIPLINA — cortometraje animado sin voz (versión ES / EN).
Uso:  LANG_VIDEO=es python3 corto.py preview [fraccion] [escenas...]
      LANG_VIDEO=es python3 corto.py full      -> salida/corto_es_sin_audio.mp4
"""
import sys, os, math, random, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'video-enfermos'))
import engine as E
from engine import *
from chars import ARMS, _dir
from PIL import Image, ImageDraw, ImageFilter, ImageChops

E.FONTS['mono'] = '/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Bold.ttf'
LANG = os.environ.get('LANG_VIDEO', 'es')
FPS = 24
BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, 'salida')

TX = {
    'day': ('DÍA', 'DAY'),
    'notalways': ('Pero no siempre fue así...', "It wasn't always like this..."),
    'why': ('¿para qué intentarlo?', 'why even try?'),
    '5min': ('5 minutos más...', '5 more minutes...'),
    'tomorrow': ('mañana empiezas', 'start tomorrow'),
    'lazy': ('eres un vago', "you're lazy"),
    'rb1': ('Pero "vago" no es lo que eres.', "But lazy isn't who you are."),
    'rb2': ('Es lo que repites.', "It's what you repeat."),
    'justone': ('solo uno...', 'just one...'),
    'giveup': ('ríndete', 'give up'),
    'cant': ('no puedes.', "you can't."),
    'save1': ('Nadie va a venir a salvarte.', 'Nobody is coming to save you.'),
    'save2': ('Pero nadie puede detenerte.', 'But nobody can stop you either.'),
    'title': ('DISCIPLINA', 'DISCIPLINE'),
    'sub': ('Día uno, o un día.', 'Day one, or one day.'),
    'decide': ('Tú decides.', 'You decide.'),
    'cta': ('¿Cuál es tu DÍA 1?', "What's your DAY 1?"),
    'cta2': ('Escríbelo en los comentarios', 'Write it in the comments'),
    'next': ('SIGUIENTE\nVIDEO', 'NEXT\nVIDEO'),
    'subs': ('SUSCRÍBETE', 'SUBSCRIBE'),
    'same': ('Todos los días eran iguales.', 'Every day was the same.'),
    'never': ('nunca vas a cambiar.', "you'll never change."),
    'onemore': ('un vídeo más...', 'one more video...'),
    'skipgym': ('hoy llueve... sáltate el gym', "it's raining... skip the gym"),
    'enough': ('ya has hecho suficiente', "that's enough for today"),
    'phone': ('mira el móvil', 'check your phone'),
}


def L(k): return TX[k][0 if LANG == 'es' else 1]


BG = (19, 19, 23); FLOORC = (24, 24, 29); LINEC = (88, 88, 96)
CR = (234, 226, 204); OL = (34, 30, 30); RD = (232, 44, 40)
DEMON = (12, 9, 11); GLOWRED = (255, 40, 30); LAMP = (255, 200, 120); BLUEG = (90, 160, 255)


# ---------------- capa de brillo (glow) ----------------
GW, GH = 480, 270


class GL:
    img = None; d = None


def glow_begin():
    GL.img = Image.new('RGB', (GW, GH), (0, 0, 0)); GL.d = ImageDraw.Draw(GL.img)


def _g(x, y):
    px, py = T(x, y)
    return px / (SS * 4), py / (SS * 4)


def glow(x, y, r, col, a=1.0):
    gx, gy = _g(x, y); rr = r * G.cam[0] / 4
    c = tuple(int(v * a) for v in col)
    GL.d.ellipse([gx - rr, gy - rr, gx + rr, gy + rr], fill=c)


def glow_poly(pts, col, a=1.0):
    GL.d.polygon([_g(*p) for p in pts], fill=tuple(int(v * a) for v in col))


_VIG = None


def finish(blur=9):
    global _VIG
    im = E.end()
    g = GL.img.filter(ImageFilter.GaussianBlur(blur)).resize((W, H), Image.BILINEAR)
    im = ImageChops.screen(im, g)
    if _VIG is None:
        v = Image.new('L', (W // 8, H // 8), 0); dv = ImageDraw.Draw(v)
        for i in range(40):
            k = i / 40
            c = int(140 + 115 * k)
            dv.ellipse([k * W / 16 - 40, k * H / 16 - 30, W / 8 - k * W / 16 + 40, H / 8 - k * H / 16 + 30], fill=c)
        _VIG = Image.merge('RGB', [v.filter(ImageFilter.GaussianBlur(8)).resize((W, H), Image.BILINEAR)] * 3)
    return ImageChops.multiply(im, _VIG)


# ---------------- utilidades ----------------
def shake(t, t0, d=0.4, a=8):
    return math.sin(t * 60) * a * (1 - (t - t0) / d) if t0 <= t < t0 + d else 0.0


def bg_dark(floor=780):
    rect_raw(-500, -500, 2500, floor, BG)
    rect_raw(-500, floor, 2500, 1600, FLOORC)
    line([(-300, floor), (2300, floor)], 3, LINEC, amp=1)


class ui:  # textos fijos en pantalla aunque la cámara haga zoom
    def __enter__(self): self.c = G.cam; G.cam = (1.0, 960, 540)
    def __exit__(self, *a): G.cam = self.c


def day_label(n, t=0):
    with ui():
        text(f"{L('day')} {n}", 70, 70, 44, (190, 190, 196), None, font='mono', anchor='lm')


def typed(s, x, y, size, t, t0, col=WHITE, cps=16, font='hand', glowc=None, anchor='mm', fixed=False):
    if t < t0: return
    if fixed:
        with ui(): return typed(s, x, y, size, t, t0, col, cps, font, glowc, anchor)
    n = min(len(s), int((t - t0) * cps) + 1)
    if glowc:
        glow(x, y, size * 0.6 * max(1, n / 4), glowc, 0.25)
    text(s[:n] if anchor == 'lm' else s[:n], x, y, size, col, None, font=font, anchor=anchor)


def flash(t, t0, d=0.12, col=WHITE):
    if t0 <= t < t0 + d: rect_raw(-500, -500, 2500, 1600, col)


# ---------------- personaje ----------------
def tube(pts, lw, iw, body, outl):
    line(pts, lw, outl, amp=0.8); line(pts, iw, body, amp=0.5)


def _eyes(hc, s, face, mood, t, seed, look, demon):
    ex = hc[0] + face * 10 * s + look[0] * 6 * s; ey = hc[1] - 2 * s + look[1] * 5 * s
    es = [(ex - 15 * s, ey), (ex + 15 * s, ey)]
    mx, my = hc[0] + face * 8 * s, hc[1] + 20 * s
    if demon:
        for k, e in enumerate(es):
            sg = -1 if k == 0 else 1
            line([(e[0] - 9 * s * sg, e[1] - 6 * s), (e[0] + 9 * s * sg, e[1] + 2 * s)], 6 * s, RD, amp=0)
        arc(mx, my - 8 * s, 18 * s, 25, 155, 5 * s, RD)
        glow(hc[0], hc[1], 30 * s, GLOWRED, 0.5)
        return
    blink = ((t + seed * 0.41) % 3.7) < 0.12
    if mood == 'sleep' or blink:
        for e in es: arc(e[0], e[1] - 2 * s, 7 * s, 20, 160, 4 * s, OL)
    elif mood == 'shock':
        for e in es: circ(e[0], e[1], 8 * s, WHITE, OL, 3 * s, amp=0); dot(e[0], e[1], 3.5 * s, OL)
    elif mood == 'happy':
        for e in es: arc(e[0], e[1] + 3 * s, 7 * s, 200, 340, 4 * s, OL)
    elif mood == 'strain':
        for k, e in enumerate(es):
            sg = 1 if k == 0 else -1
            line([(e[0] - 6 * s * sg, e[1] - 6 * s), (e[0] + 5 * s * sg, e[1]), (e[0] - 6 * s * sg, e[1] + 6 * s)], 4 * s, OL, amp=0)
    else:
        for e in es: dot(e[0], e[1] + 1 * s, 4.5 * s, OL)
    if mood == 'tired':
        for e in es: line([(e[0] - 8 * s, e[1] - 3 * s), (e[0] + 8 * s, e[1] - 3 * s)], 4 * s, OL, amp=0)
    if mood in ('determined', 'strain'):
        line([(es[0][0] - 10 * s, es[0][1] - 14 * s), (es[0][0] + 7 * s, es[0][1] - 8 * s)], 5 * s, OL, amp=0)
        line([(es[1][0] + 10 * s, es[1][1] - 14 * s), (es[1][0] - 7 * s, es[1][1] - 8 * s)], 5 * s, OL, amp=0)
    if mood == 'sad':
        line([(es[0][0] - 9 * s, es[0][1] - 9 * s), (es[0][0] + 6 * s, es[0][1] - 14 * s)], 4 * s, OL, amp=0)
        line([(es[1][0] + 9 * s, es[1][1] - 9 * s), (es[1][0] - 6 * s, es[1][1] - 14 * s)], 4 * s, OL, amp=0)
    if mood == 'happy': arc(mx, my - 6 * s, 11 * s, 20, 160, 4 * s, OL)
    elif mood == 'sad': arc(mx, my + 6 * s, 9 * s, 200, 340, 4 * s, OL)
    elif mood == 'shock': ell(mx, my + 2 * s, 6 * s, 8 * s, OL, None, 0)
    elif mood == 'strain':
        poly([(mx - 12 * s, my - 4 * s), (mx + 12 * s, my - 4 * s), (mx + 9 * s, my + 6 * s), (mx - 9 * s, my + 6 * s)], WHITE, OL, 3 * s, amp=0)
    elif mood != 'sleep':
        line([(mx - 7 * s, my), (mx + 7 * s, my)], 4 * s, OL, amp=0)


def headband(hc, s, face, t):
    y = hc[1] - 20 * s
    line([(hc[0] - 44 * s, y + 4 * s), (hc[0] + 44 * s, y - 2 * s)], 11 * s, RD, amp=0.5)
    bx = hc[0] - face * 44 * s
    for k in (0, 1):
        w = math.sin(t * 9 + k) * 8 * s
        line([(bx, y + 2 * s), (bx - face * 26 * s, y + (8 + k * 12) * s + w), (bx - face * 46 * s, y + (14 + k * 16) * s - w)],
             6 * s, RD, amp=0.3)


def head(x, y, s=1.0, face=1, mood='tired', t=0, seed=0, look=(0, 0), band=False, body=CR, outl=OL, demon=False):
    ell(x, y, 46 * s, 42 * s, body, outl, 5 * s, amp=1)
    _eyes((x, y), s, face, mood, t, seed, look, demon)
    if band: headband((x, y), s, face, t)


def blob(x, y, s=1.0, face=1, mood='tired', arms=('down', 'down'), legs='stand', t=0, walk=0.0, band=False,
         demon=False, seed=0, look=(0, 0), head_dy=0, lean=0, legs_lost=()):
    body = DEMON if demon else CR
    outl = RD if demon else OL
    b = math.sin(t * 2 + seed) * 2 * s
    hip = (x + lean * 0.3, y - 95 * s)
    if legs == 'sit': hip = (x, y - 70 * s)
    nk = (x + lean, hip[1] - 92 * s + b)
    hc = (x + lean * 1.25 + face * 4 * s, nk[1] - 40 * s + head_dy)
    lw, iw = 24 * s, 15 * s
    if demon:
        glow(x + lean * 0.5, hip[1] - 30 * s, 120 * s, GLOWRED, 0.35)
    # piernas
    if legs in ('walk', 'run'):
        amp = 40 if legs == 'walk' else 62
        feet = [(x + amp * s * math.sin(walk), y - max(0, 26 * s * math.cos(walk))),
                (x - amp * s * math.sin(walk), y - max(0, -26 * s * math.cos(walk)))]
    elif legs == 'sit':
        feet = [(x + face * 70 * s, y), (x + face * 80 * s, y)]
    else:
        feet = [(x - 20 * s, y), (x + 20 * s, y)]
    for i, f in enumerate(feet):
        if i in legs_lost: continue
        if legs == 'sit':
            kn = (x + face * 72 * s, hip[1] - 4 * s)
        else:
            kn = (lerp(hip[0], f[0], 0.5) + face * (14 if legs == 'run' else 6) * s, lerp(hip[1], f[1], 0.5))
        tube([hip, kn, f], lw, iw, body, outl)
        line([f, (f[0] + face * 16 * s, f[1])], lw, outl, amp=0)
        line([f, (f[0] + face * 16 * s, f[1])], iw, body, amp=0)
    # torso
    ang = math.atan2(hip[0] - nk[0], nk[1] - hip[1])
    ell((nk[0] + hip[0]) / 2, (nk[1] + hip[1]) / 2 + 6 * s, 30 * s, 56 * s, body, outl, 5 * s, rot=-ang)
    # brazos
    sh = (nk[0], nk[1] + 18 * s); hands = []
    for i, a in enumerate(arms):
        side = -1 if i == 0 else 1
        a1, a2 = ARMS[a] if isinstance(a, str) else a
        d1, d2 = _dir(a1, side), _dir(a2, side)
        el = (sh[0] + d1[0] * 52 * s, sh[1] + d1[1] * 52 * s)
        hd = (el[0] + d2[0] * 48 * s, el[1] + d2[1] * 48 * s)
        tube([sh, el, hd], lw * 0.92, iw * 0.92, body, outl)
        circ(hd[0], hd[1], 11 * s, body, outl, 4 * s, amp=0.5)
        hands.append(hd)
    head(hc[0], hc[1], s, face, mood, t, seed, look, band, body, outl, demon)
    return {'hands': hands, 'head': hc, 'neck': nk, 'hip': hip}


def curl(x, y, s=1.0, t=0):
    """Sentado abrazando las rodillas, cabeza gacha."""
    b = math.sin(t * 1.4) * 2 * s
    tube([(x - 30 * s, y - 40 * s), (x + 30 * s, y - 120 * s), (x + 60 * s, y)], 26 * s, 17 * s, CR, OL)
    ell(x - 40 * s, y - 85 * s + b, 34 * s, 58 * s, CR, OL, 5 * s, rot=0.35)
    tube([(x - 30 * s, y - 120 * s + b), (x + 10 * s, y - 90 * s), (x + 34 * s, y - 100 * s)], 22 * s, 14 * s, CR, OL)
    head(x - 10 * s, y - 150 * s + b, s, 1, 'sad', t, 0, (0, 1))


# ---------------- props ----------------
def desk(x, y, w=420):
    line([(x - w / 2, y - 150), (x + w / 2, y - 150)], 12, (70, 56, 46))
    line([(x - w / 2 + 20, y - 150), (x - w / 2 + 20, y)], 8, (70, 56, 46))
    line([(x + w / 2 - 20, y - 150), (x + w / 2 - 20, y)], 8, (70, 56, 46))


def chair(x, y, face=1):
    line([(x - face * 40, y - 80), (x + face * 40, y - 80)], 8, (80, 80, 86))
    line([(x - face * 40, y - 80), (x - face * 40, y - 200)], 8, (80, 80, 86))
    line([(x - face * 35, y - 80), (x - face * 35, y)], 6, (80, 80, 86))
    line([(x + face * 35, y - 80), (x + face * 35, y)], 6, (80, 80, 86))


def lamp(x, y, on=1.0):
    line([(x, y), (x - 10, y - 90), (x + 30, y - 150)], 7, (110, 110, 116))
    poly([(x + 10, y - 165), (x + 60, y - 175), (x + 70, y - 130)], (150, 150, 156), OL, 4)
    if on:
        glow_poly([(x + 55, y - 150), (x - 160, y + 30), (x + 260, y + 30)], LAMP, 0.35 * on)
        glow(x + 60, y - 145, 40, LAMP, 0.8 * on)


def books(x, y, n=3):
    cols = [(180, 60, 60), (60, 90, 160), (60, 130, 90), (200, 160, 60), (140, 80, 150)]
    for i in range(n):
        rect(x - 60 + (i % 2) * 6, y - (i + 1) * 20, 120, 20, cols[i % 5], OL, 3, amp=0.5)


def wall_clock(x, y, t, speed=1.0, r=55):
    circ(x, y, r, (30, 30, 34), (130, 130, 136), 5)
    a = t * speed * 2 * math.pi / 60
    line([(x, y), (x + math.sin(a) * r * 0.8, y - math.cos(a) * r * 0.8)], 3, (200, 200, 200), amp=0)
    line([(x, y), (x + math.sin(a / 12 + 1) * r * 0.5, y - math.cos(a / 12 + 1) * r * 0.5)], 5, (200, 200, 200), amp=0)


def digital(x, y, txt, s=1.0, on=True, col=RD, ring=False, t=0):
    sx = math.sin(t * 50) * 5 * s if ring else 0
    rect(x - 95 * s + sx, y - 50 * s, 190 * s, 100 * s, (28, 26, 28), (110, 100, 100), 5 * s)
    if on:
        text(txt, x + sx, y + 2 * s, 66 * s, col, None, font='mono')
        glow(x + sx, y, 70 * s, col, 0.45)
    if ring:
        for k in (-1, 1):
            for j in range(3):
                line([(x + k * (115 + j * 22) * s, y - 30 * s), (x + k * (125 + j * 22) * s, y + 30 * s)], 4 * s, (200, 200, 200), amp=0)


def bed(x, y, w=520):
    rect(x - w / 2, y - 60, w, 40, (52, 52, 60), (110, 110, 118), 4)
    line([(x - w / 2, y - 140), (x - w / 2, y)], 10, (110, 110, 118))
    line([(x + w / 2, y - 60), (x + w / 2, y)], 8, (110, 110, 118))
    ell(x - w / 2 + 70, y - 82, 60, 24, (200, 200, 206), OL, 4)


def blanket(x, y, w=520, b=0.0):
    poly([(x - w / 2 + 90, y - 60), (x - w / 2 + 110, y - 120 - b), (x + 40, y - 135 - b), (x + w / 2 - 20, y - 110),
          (x + w / 2 + 10, y - 60)], (52, 62, 104), (120, 130, 170), 4)


def window(x, y, moon=True):
    rect(x - 80, y - 80, 160, 160, (24, 28, 40), (120, 124, 140), 5)
    line([(x, y - 80), (x, y + 80)], 4, (120, 124, 140)); line([(x - 80, y), (x + 80, y)], 4, (120, 124, 140))
    if moon:
        circ(x + 35, y - 40, 18, (230, 230, 230), None, 0); glow(x + 35, y - 40, 30, (200, 210, 255), 0.6)
        glow_poly([(x - 80, y - 80), (x + 80, y - 80), (x - 140, y + 400), (x - 500, y + 400)], (120, 130, 170), 0.12)


def phone(x, y, ang=0.3, on=True):
    c, s_ = math.cos(ang), math.sin(ang)
    P = lambda px, py: (x + px * c - py * s_, y + px * s_ + py * c)
    poly([P(-16, -30), P(16, -30), P(16, 30), P(-16, 30)], (40, 70, 120) if on else (30, 30, 34), OL, 4, amp=0)
    if on: glow(x, y, 90, BLUEG, 0.55)


def mirror(x, y, crack=0.0, t=0, reflect=True):
    line([(x, y), (x, y - 120)], 10, (110, 110, 118)); line([(x - 60, y), (x + 60, y)], 10, (110, 110, 118))
    ell(x, y - 300, 120, 190, (34, 36, 44), (150, 150, 160), 8)
    if reflect:
        blob(x, y - 140, 0.9, -1, 'tired', t=t, demon=True, seed=4)
    if crack > 0:
        r = random.Random(11)
        for k in range(9):
            a = r.uniform(0, 6.28); L_ = r.uniform(70, 180) * crack
            p = [(x, y - 300)]
            for j in range(3):
                a += r.uniform(-0.4, 0.4)
                p.append((p[-1][0] + math.cos(a) * L_ / 3, p[-1][1] + math.sin(a) * L_ / 3 * 1.4))
            line(p, 3, (230, 230, 240), amp=0)


def fridge(x, y, open_=1.0):
    rect(x - 110, y - 330, 220, 330, (200, 204, 210), OL, 5)
    if open_ > 0:
        rect(x - 100, y - 320, 200, 310, (250, 248, 230), None, 0, amp=0)
        glow(x, y - 170, 200, (255, 250, 220), 0.5 * open_)
        for k in range(3): line([(x - 100, y - 240 + k * 80), (x + 100, y - 240 + k * 80)], 4, (180, 180, 185), amp=0)
        poly([(x + 110, y - 330), (x + 110 + 120 * open_, y - 350), (x + 110 + 120 * open_, y + 20), (x + 110, y)],
             (180, 184, 190), OL, 5)


def apple(x, y, s=1.0):
    circ(x, y, 22 * s, (210, 50, 50), OL, 3 * s); line([(x, y - 22 * s), (x + 4 * s, y - 34 * s)], 4 * s, (90, 60, 30), amp=0)


def cake(x, y, s=1.0):
    poly([(x - 30 * s, y), (x + 30 * s, y), (x + 30 * s, y - 34 * s), (x - 30 * s, y - 34 * s)], (240, 200, 150), OL, 3 * s, amp=0)
    rect(x - 30 * s, y - 44 * s, 60 * s, 12 * s, (250, 150, 180), OL, 3 * s, amp=0)


def rain(t, n=90, col=(120, 130, 160), seed=3):
    r = random.Random(seed)
    for i in range(n):
        x0 = r.uniform(-100, 2000); sp = r.uniform(900, 1300); ph = r.uniform(0, 1)
        y = ((t * sp / 1100 + ph) % 1) * 1250 - 100
        line([(x0 - y * 0.15, y), (x0 - y * 0.15 - 8, y + 34)], 2, col, amp=0)


def city(off, lamps=True):
    r = random.Random(5)
    for i in range(18):
        bw = r.uniform(120, 220); bh = r.uniform(200, 520)
        bx = ((i * 190 - off) % 3420) - 300
        rect(bx, 780 - bh, bw, bh, (30, 32, 44), (60, 62, 80), 3, amp=0.5)
        for wy in range(int(780 - bh + 30), 760, 60):
            for wx in range(int(bx + 20), int(bx + bw - 20), 45):
                if r.random() < 0.25: rect_raw(wx, wy, wx + 18, wy + 26, (200, 180, 110))
    if lamps:
        for i in range(6):
            lx = ((i * 380 - off * 1.2) % 2280) - 180
            line([(lx, 780), (lx, 560)], 6, (90, 90, 100))
            circ(lx, 555, 10, (255, 220, 150), None, 0)
            glow(lx, 560, 60, (255, 200, 120), 0.6)
            glow_poly([(lx, 560), (lx - 120, 780), (lx + 120, 780)], (255, 200, 120), 0.15)


def sky_grad(top, bot, y0=-300, y1=800, n=24):
    for i in range(n):
        u = i / n
        c = tuple(int(lerp(top[k], bot[k], u)) for k in range(3))
        rect_raw(-500, lerp(y0, y1, u), 2500, lerp(y0, y1, (i + 1) / n) + 2, c)


def hill(peak=(1250, 560)):
    pts = [(-300, 1200), (-300, 900)]
    for i in range(30):
        x = -300 + i * 90
        y = peak[1] + ((x - peak[0]) / 900) ** 2 * 420
        pts.append((x, min(1000, y)))
    pts += [(2400, 1200)]
    poly(pts, (26, 18, 22), (60, 40, 40), 4, amp=2)


def stairs(n=11, x0=280, y0=1060, sw=110, sh=52):
    pts = [(x0, y0 + 200), (x0, y0)]
    for i in range(n):
        pts += [(x0 + i * sw, y0 - (i + 1) * sh), (x0 + (i + 1) * sw, y0 - (i + 1) * sh)]
    pts += [(x0 + n * sw, y0 + 200)]
    poly(pts, (28, 28, 34), (110, 110, 120), 4, amp=1)


def step_pos(k, x0=280, y0=1060, sw=110, sh=52):
    i = int(k); f = k - i
    x = x0 + (i + 0.5 + f) * sw
    y = y0 - (i + 1) * sh - (sh if f > 0.5 else 0) * 0
    return x, y


def tempt(x, y, s, t, t_in, key, t_out=None, face=-1, ty=None, size=50):
    """La sombra aparece, susurra y, si la ignora, se encoge y se deshace en humo."""
    if t < t_in: return
    k = prog(t, t_in, 0.4)
    out = prog(t, t_out, 0.5) if t_out is not None else 0.0
    sc = s * lerp(0.6, 1.0, k) * (1 - out)
    if sc > 0.03:
        blob(x, y, sc, face, 'tired', t=t, demon=True, seed=9)
    if 0 < out < 1:
        for i in range(5):
            a = i * 1.26
            circ(x + math.cos(a) * 80 * s * out, y - 130 * s - math.sin(a) * 60 * s * out - 60 * out, 30 * s * (1 - out) + 2,
                 (70, 66, 70), None, 0)
    if out < 0.4:
        typed(L(key), x, ty if ty is not None else y - 330 * s, size, t, t_in + 0.2, RD, glowc=GLOWRED)


# ---------------- escenas ----------------
SC = []


def scene(dur, chapter=None):
    def deco(f):
        SC.append({'f': f, 'dur': dur, 'name': f.__name__, 'chapter': chapter}); return f
    return deco


CH = {'hook': ('Día 365', 'Day 365'), 'same': ('Todos los días eran iguales', 'Every day was the same'),
      'mirror': ('El espejo', 'The mirror'), 'rock': ('Tocar fondo', 'Rock bottom'), 'day1': ('Día 1', 'Day 1'),
      'grind': ('La rutina', 'The grind'), 'fight': ('La pelea final', 'The final fight'),
      'summit': ('La cima', 'The summit'), 'end': ('Día uno, o un día', 'Day one, or one day')}


@scene(8.8, 'hook')
def c01_hook(t, D):
    if t < 1.6:
        rect_raw(-500, -500, 2500, 1600, (8, 7, 9))
        cam(lerp(2.0, 2.3, t / 1.6), 960, 600)
        blob(960, 900, 1.6, -1, 'tired', t=t, demon=True, seed=1)
        typed(L('never'), 960, 170, 96, t, 0.15, RD, cps=18, glowc=GLOWRED, fixed=True)
        return
    T0 = t; t = t - 1.6; D = D - 1.6
    cam(lerp(1.15, 1.0, ease(t / D)), 960, 540)
    sky_grad((40, 20, 40), (240, 120, 60), -300, 700)
    sun_y = lerp(720, 600, t / D)
    circ(1250, sun_y, 90, (255, 210, 140), None, 0); glow(1250, sun_y, 260, (255, 140, 60), 0.7)
    hill()
    up = prog(t, 1.0, 1.2)
    blob(1250, 562, 1.0, -1, 'determined', arms=('down', (lerp(10, 170, up), lerp(5, 175, up))), t=t, band=True)
    cam(1, 960, 540)
    day_label(365)
    if t > 3.4: typed(L('notalways'), 960, 900, 62, t, 3.4, WHITE, fixed=True)
    flash(T0, 1.6, 0.07)


@scene(1.6)
def c02_rewind(t, D):
    rect_raw(-500, -500, 2500, 1600, (10, 10, 12))
    r = random.Random(int(t * 30))
    for i in range(14):
        y = r.uniform(0, 1080); rect_raw(0, y, 1920, y + r.uniform(2, 10), (60, 60, 70))
    for k in (0, 1):
        x = 900 + k * 90
        poly([(x + 60, 470), (x + 60, 610), (x - 20, 540)], WHITE, None, 0)
    n = int(lerp(365, 47, ease(t / (D - 0.2))))
    text(f"{L('day')} {n}", 960, 760, 70, WHITE, None, font='mono')


@scene(5.0, 'same')
def c03_desk(t, D):
    cam(1.35, 880, 610)
    bg_dark()
    day_label(47)
    wall_clock(960, 260, t)
    desk(1100, 780); lamp(1260, 630); books(1180, 630, 3)
    chair(800, 780)
    drop = prog(t, D * 0.62, 0.6)
    p = blob(800, 780, 1.0, 1, 'tired', arms=((40, 95), (50, 100)), legs='sit', t=t, lean=lerp(30, 90, drop),
             head_dy=lerp(0, 30, drop))
    line([p['hands'][1], (p['hands'][1][0] + 90, 632)], 4, (220, 220, 220), amp=0)
    if t > 1.0:
        k = prog(t, 1.0, 0.8)
        blob(520, 780, 1.15, 1, 'tired', arms=('down', (40 + 40 * k, 90 + 30 * k)), t=t, demon=True, seed=3)
    typed(L('why'), 600, 420, 62, t, 2.0, RD, glowc=GLOWRED)


@scene(3.5)
def c04_phone(t, D):
    cam(1.3, 820, 610)
    bg_dark()
    day_label(63)
    bed(900, 780); window(1500, 340)
    head(670, 690, 1.0, 1, 'tired', t, look=(1, -0.5))
    blanket(900, 780, b=math.sin(t * 2) * 3)
    hx, hy = 760, 650 + math.sin(t * 6) * 2
    phone(hx, hy, -0.4)
    glow(700, 690, 70, BLUEG, 0.35)
    digital(330, 640, '03:12', 0.8, t=t)
    tempt(1250, 780, 0.8, t, 1.5, 'onemore', ty=430)
    for k, tp in enumerate((1.2, 2.6, 3.8)):
        if tp < t < tp + 0.6: text('•', hx + 30, hy - 60 - (t - tp) * 60, 60, BLUEG, None, font='hand')


@scene(3.5)
def c05_alarm(t, D):
    cam(1.25, 960, 600)
    bg_dark()
    day_label(88)
    bed(1000, 780)
    ring = t < D * 0.48
    digital(450, 620, '07:00', 0.9, ring=ring, t=t)
    head(770, 690, 1.0, 1, 'sleep', t)
    blanket(1000, 780)
    reach = prog(t, D * 0.3, 0.5) * (1 - prog(t, D * 0.6, 0.5))
    ax = lerp(720, 480, reach)
    tube([(760, 720), (ax, lerp(720, 580, reach))], 22, 14, CR, OL)
    circ(ax, lerp(720, 580, reach), 12, CR, OL, 4)
    blob(1500, 780, 0.9, -1, 'tired', t=t, demon=True, seed=2)
    typed(L('5min'), 1400, 440, 56, t, D * 0.5, RD, glowc=GLOWRED)
    if t > D * 0.65: text('z', 820 + (t * 30 % 40), 600 - (t * 40 % 60), 40, (180, 180, 190), None, font='hand')


@scene(3.6)
def c06_sleep(t, D):
    cam(1.3, 820, 610)
    bg_dark()
    day_label(150)
    bed(820, 780); window(1500, 300)
    digital(330, 650, '13:26', 0.7, t=t)
    head(590, 692, 0.95, 1, 'sleep', t)
    blanket(820, 780, b=math.sin(t * 1.5) * 4)
    for k in range(2):
        u = (t * 0.5 + k * 0.5) % 1
        text('z', 650 + k * 25 + u * 30, 600 - u * 80, 36 + k * 10, (170, 170, 180), None, font='hand')
    if t > 1.0: typed(L('same'), 960, 940, 56, t, 1.0, (200, 200, 205), fixed=True)


@scene(2.5)
def c07_montage(t, D):
    k = int(t / 0.42)
    n = 151 + k * 6
    fns = [c03_desk, c04_phone, c06_sleep, c05_alarm]
    fns[k % 4](1.3 + (t % 0.42), 5.0)
    with ui(): rect_raw(0, 20, 520, 120, BG)
    day_label(n)
    flash(t % 0.42, 0, 0.04, (60, 60, 66))


@scene(10.5, 'mirror')
def c08_mirror(t, D):
    bg_dark()
    day_label(201)
    cam(lerp(1.25, 1.4, ease(t / D)), 960, 540)
    glow(960, 300, 300, (120, 120, 140), 0.18)
    crack = prog(t, D * 0.62, 0.25)
    mirror(1150, 780, crack, t)
    step = prog(t, D * 0.66, 0.5)
    blob(lerp(760, 680, step), 780, 1.0, 1, 'sad' if t > D * 0.4 else 'tired', t=t, look=(1, 0))
    cam(1, 960, 540)
    if t > D * 0.32:
        text(L('lazy'), 1150, 290, 96, RD, None, font='hand', sc=pop(t, D * 0.32, 0.25))
        glow(1150, 290, 220, GLOWRED, 0.3)
    flash(t, D * 0.62, 0.08, (90, 90, 100))


@scene(11.0, 'rock')
def c09_rock(t, D):
    rect_raw(-500, -500, 2500, 1600, (10, 10, 12))
    rect_raw(-500, 760, 2500, 1600, (15, 15, 18))
    glow_poly([(900, -50), (1020, -50), (1260, 760), (660, 760)], (200, 200, 210), 0.22)
    ell(960, 765, 300, 30, (34, 34, 38), None, 0)
    curl(960, 760, 1.0, t)
    typed(L('rb1'), 960, 300, 60, t, 2.0, WHITE, cps=14)
    typed(L('rb2'), 960, 390, 66, t, 6.0, WHITE, cps=12)


@scene(5.5, 'day1')
def c10_day1(t, D):
    rect_raw(-500, -500, 2500, 1600, (12, 12, 14))
    if t < 1.6:
        sx = shake(t, 0.25, 0.35, 12)
        text(f"{L('day')} 1", 960 + sx, 540, 200, WHITE, None, font='mono', sc=pop(t, 0.15, 0.2))
        glow(960, 540, 300, (255, 255, 255), 0.15)
        return
    cam(1.6, 900, 560)
    press = prog(t, D * 0.62, 0.15)
    digital(900, 600, '05:00', 1.6, ring=press < 1, t=t, on=True)
    ax = lerp(1500, 1000, prog(t, 1.8, D * 0.62 - 1.8))
    ay = lerp(400, 470 + 20 * press, prog(t, 1.8, 1.2))
    tube([(1800, 300), (ax, ay)], 40, 28, CR, OL)
    circ(ax, ay, 22, CR, OL, 5)
    cam(1, 960, 540)
    if press >= 1:
        text('OFF', 960, 860, 90, WHITE, None, font='mono', sc=pop(t, D * 0.62, 0.2))
    flash(t, D * 0.62, 0.06)


@scene(6.0)
def c11_wake(t, D):
    cam(1.3, 820, 590)
    bg_dark()
    day_label(1)
    window(1500, 300, moon=False)
    glow_poly([(1420, 220), (1580, 220), (1200, 800), (700, 800)], (180, 170, 140), 0.12)
    bed(700, 780, 440)
    tie = prog(t, 1.0, 1.4)
    stand = prog(t, 3.0, 0.8)
    p = blob(lerp(760, 1000, stand), 780 if stand > 0 else 740, 1.0, 1, 'determined',
             arms=((lerp(20, 150, tie) * (1 - stand), lerp(10, 200, tie) * (1 - stand)),
                   (lerp(20, 150, tie) * (1 - stand), lerp(10, 200, tie) * (1 - stand))),
             legs='sit' if stand == 0 else 'stand', t=t, band=tie > 0.6)
    if 3.4 < t:
        blob(300, 780, 0.8, 1, 'tired', t=t, demon=True, seed=7)
        typed(L('tomorrow'), 330, 470, 46, t, 3.6, (150, 40, 40))


@scene(7.0, 'grind')
def c12_run(t, D):
    cam(1.3, 920, 620)
    rect_raw(-500, -500, 2500, 1600, (16, 18, 28))
    city(t * 260)
    rect_raw(-500, 780, 2500, 1600, (22, 24, 34))
    line([(-300, 780), (2300, 780)], 3, (80, 84, 100))
    for i in range(10):
        rx = ((i * 260 - t * 500) % 2600) - 300
        ell(rx, 830, 60, 6, (60, 70, 100), None, 0)
    dx = 1350 - t * 260
    if dx > -300:
        blob(dx, 780, 0.8, -1, 'tired', t=t, demon=True, seed=9)
        typed(L('skipgym'), dx, 470, 46, t, 0.5, RD, glowc=GLOWRED)
    blob(900, 780, 1.0, 1, 'determined', arms=((50 + 40 * math.sin(t * 12), 120), (50 - 40 * math.sin(t * 12), 120)),
         legs='run', walk=t * 12, t=t, band=True, lean=18)
    rain(t)
    day_label(int(lerp(2, 105, t / D)))


@scene(5.0)
def c13_pushups(t, D):
    cam(1.4, 1020, 640)
    bg_dark()
    glow(960, 300, 380, (140, 140, 160), 0.12)
    day_label(int(lerp(106, 140, t / D)))
    rep = math.sin(t * 5)
    G.rot = (math.radians(-56 + rep * 5), 1150, 780)
    blob(1150, 780, 1.0, -1, 'strain', arms=((60, 60 + 35 * (1 - rep)), (-60, -60 - 35 * (1 - rep))), t=t, band=True)
    G.rot = None
    tempt(1500, 780, 0.6, t, 1.0, 'enough', t_out=D * 0.8, ty=520, size=44)
    n = 17 + int((t * 5 + math.pi / 2) / (2 * math.pi))
    text(str(n), 960, 300, 120, WHITE, None, font='mono')


@scene(5.0)
def c14_study(t, D):
    cam(1.35, 960, 610)
    bg_dark()
    day_label(int(lerp(141, 175, t / D)))
    wall_clock(960, 240, t, speed=60 * 12)
    desk(1100, 780); lamp(1300, 630)
    books(1240, 630, 2 + int(t / D * 6))
    chair(800, 780)
    tempt(520, 780, 0.55, t, 0.8, 'phone', t_out=D * 0.75, face=1, ty=560, size=44)
    if 0.8 < t < D * 0.75: phone(560, 690, 0.3)
    p = blob(800, 780, 1.0, 1, 'determined', arms=((40, 110), (55, 120)), legs='sit', t=t, band=True, lean=12)
    h = p['hands'][1]
    poly([(h[0] - 10, h[1] - 30), (h[0] + 70, h[1] - 50), (h[0] + 80, h[1]), (h[0], h[1] + 10)], (240, 236, 220), OL, 3)


@scene(5.5)
def c15_fridge(t, D):
    cam(1.3, 1080, 600)
    bg_dark()
    day_label(220)
    fridge(1100, 780, prog(t, 0.3, 0.5))
    pick = prog(t, D * 0.55, 0.5)
    apple(1060, 520); cake(1160, 610)
    p = blob(780, 780, 1.0, 1, 'determined', arms=('down', (40 + 50 * pick, 100 + 20 * pick)), t=t, band=True)
    if pick > 0.9:
        h = p['hands'][1]; apple(h[0], h[1] - 10)
    tempt(1500, 780, 0.5, t, 1.0, 'justone', t_out=D * 0.8, ty=560, size=44)
    if pick > 0.9: text('✓', 900, 360, 90, (120, 220, 120), None, font='hand', sc=pop(t, D * 0.55 + 0.5))


@scene(7.0)
def c16_fall(t, D):
    cam(1.25, 1080, 600)
    rect_raw(-500, -500, 2500, 1600, (14, 15, 24))
    city(1200 + t * 120 * (1 - prog(t, 1.2, 0.3)))
    rect_raw(-500, 780, 2500, 1600, (22, 24, 34)); line([(-300, 780), (2300, 780)], 3, (80, 84, 100))
    day_label(241)
    fall = prog(t, 1.0, 0.35); rise = prog(t, D * 0.62, 1.0)
    G.rot = (math.radians(lerp(0, 82, fall) * (1 - rise)), 900, 780)
    blob(900, 780, 1.0, 1, 'strain' if fall > 0.5 and rise < 1 else 'determined', t=t, band=True,
         arms=('down', 'down') if fall < 1 or rise > 0.5 else ((60, 20), (70, 30)))
    G.rot = None
    if t > 1.6:
        demon_k = 1 - prog(t, D * 0.7, 0.6)
        if demon_k > 0.02:
            blob(1450, 780, 1.1 * demon_k + 0.01, -1, 'tired', t=t, demon=True, seed=6)
            typed(L('giveup'), 1450, 420, 60, t, 1.8, RD, glowc=GLOWRED)
    rain(t, 110)


@scene(13.0, 'fight')
def c17_fight(t, D):
    cam(0.9, 1000, 500)
    bg_dark(1100)
    day_label(270)
    stairs()
    k = lerp(0, 8.5, prog(t, 0.5, D * 0.62))
    x, y = step_pos(k)
    bob = abs(math.sin(k * math.pi)) * 18
    hit = D * 0.74
    blob(x, y - bob, 0.9, 1, 'strain' if t > D * 0.4 else 'determined', legs='walk', walk=k * math.pi, t=t, band=True,
         lean=14, arms=('down', (lerp(30, 170, prog(t, hit - 0.6, 0.4)), lerp(60, 175, prog(t, hit - 0.6, 0.4)))))
    sx = shake(t, hit, 0.6, 22)
    cam(0.9 + (0.08 if hit < t < hit + 0.3 else 0), 1000 + sx, 500)
    if t < hit:
        gs = lerp(1.3, 2.0, prog(t, 1.0, hit - 1.0))
        lunge = prog(t, hit - 0.8, 0.8)
        blob(lerp(1560, 1420, lunge), 488, gs, -1, 'tired', arms=('down', (lerp(40, 100, lunge), 95)), t=t, demon=True, seed=1)
        typed(L('cant'), 1180, 230, 80, t, 2.0, RD, glowc=GLOWRED)
    else:
        r = random.Random(4); u = t - hit
        for i in range(90):
            a = r.uniform(0, 6.28); sp = r.uniform(200, 900)
            px, py = 1500 + math.cos(a) * sp * u, 300 + math.sin(a) * sp * u + 300 * u * u
            if u < 1.8: dot(px, py, r.uniform(4, 12) * (1 - u / 1.8), RD); glow(px, py, 14, GLOWRED, 0.4 * (1 - u / 1.8))
        glow(1500, 300, 400 * (1 - clamp(u)), (255, 255, 255), 0.5)
    cam(1, 960, 540)
    flash(t, hit, 0.14)


@scene(12.0, 'summit')
def c18_summit(t, D):
    cam(lerp(1.0, 1.08, t / D), 960, 540)
    sky_grad((30, 18, 40), (250, 130, 60), -300, 700)
    sun_y = lerp(760, 560, t / D)
    circ(1250, sun_y, 90, (255, 214, 150), None, 0); glow(1250, sun_y, 300, (255, 140, 60), 0.7)
    hill()
    walk_k = prog(t, 0, 3.5)
    x = lerp(800, 1250, walk_k)
    y = 560 + ((x - 1250) / 900) ** 2 * 420 + 2
    up = prog(t, 4.0, 1.2)
    blob(x, y, 1.0, -1 if walk_k >= 1 else 1, 'determined', legs='walk' if walk_k < 1 else 'stand', walk=t * 6, t=t,
         band=True, arms=('down', (lerp(10, 170, up), lerp(5, 175, up))))
    cam(1, 960, 540)
    day_label(365)
    typed(L('save1'), 960, 860, 64, t, 4.6, WHITE, cps=14, fixed=True)
    typed(L('save2'), 960, 950, 64, t, 8.0, (255, 220, 170), cps=14, fixed=True)


@scene(8.0, 'end')
def c19_title(t, D):
    rect_raw(-500, -500, 2500, 1600, (10, 10, 12))
    text(L('title'), 960, 430, 170, WHITE, None, font='lucky', sc=pop(t, 0.3, 0.4))
    u = prog(t, 1.0, 0.8)
    if u: line([(960 - 420 * u, 540), (960 + 420 * u, 540)], 10, RD)
    typed(L('sub'), 960, 640, 64, t, 2.4, WHITE, cps=14)
    typed(L('decide'), 960, 740, 70, t, 4.6, RD, cps=10)


@scene(15.0)
def c20_end(t, D):
    bg_dark()
    blob(330, 780, 1.1, 1, 'happy', arms=('down', (140, 160 + 25 * math.sin(t * 6))), t=t, band=True)
    text(L('cta'), 960, 160, 84, WHITE, None, font='lucky', sc=pop(t, 0.3))
    text(L('cta2'), 960, 260, 48, (200, 200, 205), None, font='hand', sc=pop(t, 0.6))
    rect(800, 360, 760, 430, (30, 30, 36), (200, 200, 210), 6)
    text(L('next'), 1180, 575, 80, WHITE, None)
    circ(560, 520, 95, (40, 40, 46), (200, 200, 210), 6)
    rect(420, 640, 280, 70, RD, OL, 4)
    text(L('subs'), 560, 676, 38, WHITE, None)


def dur(sc): return sc['dur']


def frame(i, t):
    sc = SC[i]
    E.begin(t, i + 1, BG); glow_begin()
    sc['f'](t, sc['dur'])
    im = finish()
    if t < 0.18 and i > 0 and sc['name'] not in ('c02_rewind', 'c07_montage'):
        z = 1 + 0.04 * (1 - E.ease(t / 0.18))
        w_, h_ = int(W / z), int(H / z)
        im = im.crop(((W - w_) // 2, (H - h_) // 2, (W - w_) // 2 + w_, (H - h_) // 2 + h_)).resize((W, H), Image.BILINEAR)
    return im


def render_clip(i):
    sc = SC[i]; n = int(round(sc['dur'] * FPS))
    path = os.path.join(OUT, f'clips_{LANG}', f'{i + 1:02d}_{sc["name"]}.mp4')
    p = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}',
                          '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19',
                          '-pix_fmt', 'yuv420p', path], stdin=subprocess.PIPE)
    for f in range(n): p.stdin.write(frame(i, f / FPS).tobytes())
    p.stdin.close(); p.wait()
    return path


def capitulos():
    acc = 0.0; out = []
    for sc in SC:
        if sc['chapter']:
            out.append(f"{int(acc // 60)}:{int(acc % 60):02d} {CH[sc['chapter']][0 if LANG == 'es' else 1]}")
        acc += round(sc['dur'] * FPS) / FPS
    return out, acc


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'preview'
    if mode == 'preview':
        frac = float(sys.argv[2]) if len(sys.argv) > 2 else 0.7
        only = [int(a) - 1 for a in sys.argv[3:]] or range(len(SC))
        os.makedirs(os.path.join(BASE, 'previews'), exist_ok=True)
        th = [frame(i, SC[i]['dur'] * frac).resize((480, 270)) for i in only]
        cols = 5; rows = (len(th) + cols - 1) // cols
        sh = Image.new('RGB', (cols * 480, rows * 270), 'white')
        for k, im in enumerate(th): sh.paste(im, ((k % cols) * 480, (k // cols) * 270))
        sh.save(os.path.join(BASE, 'previews', 'hoja.png')); print('ok')
    else:
        from multiprocessing import Pool
        os.makedirs(os.path.join(OUT, f'clips_{LANG}'), exist_ok=True)
        with Pool(4) as pool: paths = pool.map(render_clip, range(len(SC)), chunksize=1)
        lst = os.path.join(OUT, f'lista_{LANG}.txt')
        open(lst, 'w').write(''.join(f"file '{p}'\n" for p in paths))
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy',
                        os.path.join(OUT, f'corto_{LANG}_sin_audio.mp4')], check=True)
        ch, tot = capitulos(); print('\n'.join(ch)); print('total', tot)
