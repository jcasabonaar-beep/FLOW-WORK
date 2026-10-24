"""LOS VIDEOJUEGOS TE ESTÁN MATANDO — cortometraje animado sin voz (ES / EN).
Reutiliza el motor y el personaje de video-disciplina/corto.py.
Uso:  LANG_VIDEO=es python3 juego.py preview [fraccion] [escenas...]
      LANG_VIDEO=es python3 juego.py full    -> salida/juego_<lang>_sin_audio.mp4"""
import sys, os, math, random, subprocess
BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BASE, '..', 'video-disciplina'))
import corto as C
from corto import (E, G, T, W, H, cam, rect_raw, rect, poly, line, circ, ell, dot, arc, text, prog, pop, ease, lerp,
                   clamp, Image, ImageDraw, glow, glow_poly, ui, typed, flash, shake, blob, head, tube, bg_dark, window,
                   digital, wall_clock, desk, chair, lamp, books, phone, sky_grad, CR, OL, RD, BG, BLUEG, GLOWRED, LAMP,
                   WHITE, INK, YEL)

E.FONTS['pixel'] = os.path.join(BASE, '..', 'video-enfermos', 'fonts', 'PressStart2P-Regular.ttf')
LANG = C.LANG
FPS = 24
OUT = os.path.join(BASE, 'salida')
GREEN = (90, 220, 110); PURP = (150, 110, 210); GOLD = (255, 205, 60)

TX = {
    'lv99': ('NIVEL 99', 'LEVEL 99'), 'levelup': ('¡NIVEL ARRIBA!', 'LEVEL UP!'),
    'hook': ('Nivel 99 en el juego. Nivel 1 en la vida.', 'Level 99 in the game. Level 1 in real life.'),
    'real': ('VIDA REAL', 'REAL LIFE'),
    'health': ('SALUD', 'HEALTH'), 'friends': ('AMIGOS', 'FRIENDS'), 'grades': ('ESTUDIOS', 'GRADES'), 'sleep': ('SUEÑO', 'SLEEP'),
    'surprise': ('¡sorpresa!', 'surprise!'), 'best': ('Fue la mejor noche de su vida.', 'It was the best night of his life.'),
    'bed': ('¡a la cama!', 'bed!'), 'come': ('Amigos: ¿vienes esta noche?', 'Friends: coming tonight?'),
    'onemore': ('UNA MÁS', 'ONE MORE'), 'homework': ('¿y los deberes?', 'homework?'),
    'record': ('¡NUEVO RÉCORD!', 'NEW RECORD!'), 'without': ('Amigos: vale... sin ti.', 'Friends: ok... without you.'),
    'off': ('Cuando la pantalla se apagó... solo quedaba él.', 'When the screen went dark... only he was left.'),
    'mood': ('ÁNIMO', 'MOOD'), 'ghost': ('SOLO UNA PARTIDA...', 'JUST ONE GAME...'),
    'hardest': ('Los primeros días fueron los más duros.', 'The first days were the hardest.'),
    'quest': ('MISIÓN', 'QUEST'), 'q1': ('Salir a correr', 'Go for a run'), 'q2': ('Estudiar 1 hora', 'Study for 1 hour'),
    'q3': ('Quedar con amigos', 'Hang out with friends'), 'q4': ('Dormir 8 horas', 'Sleep 8 hours'),
    'notenemy': ('Los juegos no son el enemigo.', 'Games are not the enemy.'),
    'living': ('Vivir solo dentro de ellos, sí.', 'Living only inside them is.'),
    'restart': ('Tu vida es el único juego\nsin botón de reiniciar.', 'Your life is the only game\nwith no restart button.'),
    'press': ('PULSA START', 'PRESS START'),
    'cta': ('¿Cuántas horas jugaste ayer?', 'How many hours did you play yesterday?'),
    'cta2': ('Sé sincero en los comentarios', 'Be honest in the comments'),
    'next': ('SIGUIENTE\nVIDEO', 'NEXT\nVIDEO'), 'subs': ('SUSCRÍBETE', 'SUBSCRIBE'), 'day': ('DÍA', 'DAY'),
}


def L(k): return TX[k][0 if LANG == 'es' else 1]


def day(n):
    with ui(): text(f"{L('day')} {n}", 70, 70, 44, (190, 190, 196), None, font='mono', anchor='lm')


def px(s):  # estilo retro: mayúsculas sin tilde (la fuente pixelada las aplasta)
    return s.translate(str.maketrans('ÁÉÍÓÚáéíóú', 'AEIOUaeiou'))


def ptext(s, x, y, size, col=GOLD, stroke=INK, sc=1.0, sw=None):
    s = px(s)
    text(s, x, y, size, col, stroke, sw=(size * 0.12 if sw is None else sw) if stroke else None, font='pixel', sc=sc)


def label(x, y, s, size=40, col=(230, 222, 200)):
    w = C.text_w(s, int(size), 'hand') + 40
    rect(x - w / 2, y - size * 0.75, w, size * 1.5, (24, 22, 26), (24, 22, 26), 2, amp=0.5)
    text(s, x, y, size, col, None, font='hand')


# ---------------- HUD de la vida real ----------------
def hud(vals, lv, t, flashk=None, x=1450, y=40):
    with ui():
        rect(x, y, 430, 270, (16, 16, 22), (90, 90, 110), 4, amp=0.6)
        lvc = RD if lv <= 1 and (t * 3) % 1 < 0.5 else WHITE
        text(px(f"{L('real')} · LV {lv}"), x + 215, y + 32, 22, lvc, None, font='pixel')
        cols = {'health': (230, 70, 70), 'friends': (80, 150, 255), 'grades': (250, 200, 60), 'sleep': (170, 120, 230)}
        for i, k in enumerate(('health', 'friends', 'grades', 'sleep')):
            yy = y + 80 + i * 48
            text(px(L(k)), x + 20, yy, 16, (200, 200, 210), None, font='pixel', anchor='lm')
            rect_raw(x + 190, yy - 12, x + 410, yy + 12, (40, 40, 50))
            v = clamp(vals[k])
            c = cols[k] if not (v < 0.2 and (t * 4) % 1 < 0.5) else (255, 255, 255)
            if v > 0: rect_raw(x + 190, yy - 12, x + 190 + 220 * v, yy + 12, c)
            if flashk == k: rect(x + 186, yy - 16, 228, 32, None, RD, 3, amp=0)


def hv(a, b, t, t0, d=0.6):
    u = prog(t, t0, d)
    return {k: lerp(a[k], b[k], u) for k in a}


FULL = dict(health=1, friends=1, grades=1, sleep=1)


# ---------------- mini-juego pixelado ----------------
def game_screen(x0, y0, w, h, t, level=12, fx=0.0, boss=False):
    rect_raw(x0, y0, x0 + w, y0 + h, (22, 26, 70) if not boss else (60, 16, 30))
    u = h / 20
    r = random.Random(2)
    for i in range(14):
        sx, sy = x0 + r.uniform(0, w), y0 + r.uniform(0, h * 0.5)
        rect_raw(sx, sy, sx + u * 0.4, sy + u * 0.4, (200, 200, 255))
    rect_raw(x0, y0 + h - 3 * u, x0 + w, y0 + h - 2 * u, (70, 190, 80))
    rect_raw(x0, y0 + h - 2 * u, x0 + w, y0 + h, (130, 85, 45))
    for i in range(5):
        cx = x0 + ((i * w / 5 - t * w * 0.35) % w)
        cw = u * 0.9 * abs(math.cos(t * 6 + i)) + u * 0.15
        rect_raw(cx - cw / 2, y0 + h - 7 * u, cx + cw / 2, y0 + h - 6 * u, GOLD)
    ex = x0 + ((w * 0.9 - t * w * 0.2) % w)
    rect_raw(ex, y0 + h - 5 * u, ex + 2 * u, y0 + h - 3 * u, (170, 60, 200))
    hx = x0 + w * 0.28; hy = y0 + h - 3 * u - abs(math.sin(t * 4)) * 3 * u
    rect_raw(hx, hy - 3 * u, hx + 2 * u, hy, CR)
    rect_raw(hx - 0.2 * u, hy - 5 * u, hx + 2.2 * u, hy - 3 * u, CR)
    rect_raw(hx - 0.2 * u, hy - 4.6 * u, hx + 2.2 * u, hy - 4.1 * u, RD)
    text(f'LV {level}', x0 + u, y0 + 1.4 * u, u * 1.1, WHITE, None, font='pixel', anchor='lm')
    rect_raw(x0 + w - 7 * u, y0 + u, x0 + w - u, y0 + 1.8 * u, (50, 50, 80))
    rect_raw(x0 + w - 7 * u, y0 + u, x0 + w - 7 * u + 6 * u * ((t * 0.7) % 1), y0 + 1.8 * u, GREEN)
    if fx > 0:
        ptext('+100 XP', hx + u, hy - 7 * u - fx * 3 * u, u * 1.2, GOLD, None)


def monitor(x, y, w=420, h=260, t=0.0, on=True, level=12, fx=0.0, boss=False, reflect=False):
    line([(x, y + h / 2), (x, y + h / 2 + 70)], 14, (60, 60, 66))
    line([(x - 70, y + h / 2 + 70), (x + 70, y + h / 2 + 70)], 10, (60, 60, 66))
    rect(x - w / 2 - 14, y - h / 2 - 14, w + 28, h + 28, (34, 34, 40), (90, 90, 100), 5, amp=0.6)
    if on:
        game_screen(x - w / 2, y - h / 2, w, h, t, level, fx, boss)
        glow(x, y, w * 0.55, BLUEG if not boss else (255, 60, 80), 0.32)
        glow_poly([(x - w / 2, y - h / 2), (x - w / 2, y + h / 2), (x - w * 2.2, y + h * 1.6), (x - w * 2.2, y - h * 1.2)],
                  BLUEG, 0.07)
    else:
        rect_raw(x - w / 2, y - h / 2, x + w / 2, y + h / 2, (8, 8, 10))
        if reflect:
            ell(x - 40, y + 10, 70, 64, None, (70, 70, 84), 4)
            line([(x - 62, y + 2), (x - 50, y + 4)], 3, (70, 70, 84), amp=0)
            line([(x - 30, y + 4), (x - 18, y + 2)], 3, (70, 70, 84), amp=0)
            arc(x - 40, y + 40, 12, 200, 340, 3, (70, 70, 84))


def controller(x, y, s=1.0):
    ell(x, y, 46 * s, 22 * s, (40, 40, 48), (90, 90, 100), 4 * s)
    for k in (-1, 1): ell(x + k * 34 * s, y + 14 * s, 16 * s, 18 * s, (40, 40, 48), (90, 90, 100), 4 * s)
    dot(x + 18 * s, y - 4 * s, 4 * s, RD); dot(x + 28 * s, y + 2 * s, 4 * s, GREEN); dot(x - 22 * s, y, 4 * s, (150, 150, 160))


def headset(hc, s=1.0, face=1):
    arc(hc[0], hc[1] - 4 * s, 50 * s, 190, 350, 8 * s, (50, 50, 58))
    ell(hc[0] - face * 46 * s, hc[1] + 2 * s, 12 * s, 20 * s, (50, 50, 58), (100, 100, 110), 3 * s)


def dark_circles(hc, s=1.0, face=1, a=1.0):
    ex = hc[0] + face * 10 * s
    for k in (-1, 1):
        arc(ex + k * 15 * s, hc[1] + 8 * s, 9 * s, 20, 160, 3 * s, (int(130 * a + 40), int(90 * a + 40), int(150 * a + 40)))


def gamer(x, y, t, mood='happy', tired=0.0, s=1.0, play=True, pale=False):
    jig = math.sin(t * 18) * 3 if play else 0
    arms = ((32, 95 + jig), (42, 100 - jig)) if play else ('down', 'down')
    p = blob(x, y, s, 1, mood, arms=arms, legs='sit', t=t, look=(1, 0), lean=14)
    hc = p['head']
    headset(hc, s)
    if tired > 0: dark_circles(hc, s, 1, tired)
    if play:
        hx = (p['hands'][0][0] + p['hands'][1][0]) / 2; hy = (p['hands'][0][1] + p['hands'][1][1]) / 2
        controller(hx + 6, hy, 0.8 * s)
    glow(hc[0] + 30, hc[1], 70 * s, BLUEG, 0.3 if play else 0)
    return p


def gchair(x, y):
    line([(x - 60, y - 210), (x - 40, y - 80)], 14, (40, 40, 48))
    poly([(x - 80, y - 270), (x - 40, y - 280), (x - 30, y - 120), (x - 70, y - 110)], (180, 40, 40), OL, 4)
    line([(x - 45, y - 80), (x + 45, y - 80)], 12, (40, 40, 48))
    line([(x, y - 80), (x, y - 20)], 8, (60, 60, 66)); line([(x - 40, y), (x + 40, y)], 6, (60, 60, 66))


def gdesk(x, y, w=520):
    line([(x - w / 2, y - 150), (x + w / 2, y - 150)], 12, (52, 46, 44))
    line([(x - w / 2 + 20, y - 150), (x - w / 2 + 20, y)], 8, (52, 46, 44))
    line([(x + w / 2 - 20, y - 150), (x + w / 2 - 20, y)], 8, (52, 46, 44))


def door(x, y, open_=0.0):
    rect(x - 80, y - 330, 160, 330, (30, 26, 24), (90, 80, 70), 5)
    if open_ > 0:
        glow_poly([(x - 80, y - 330), (x - 80 + 160 * open_, y - 330), (x + 300 * open_, y), (x - 80, y)], (255, 220, 160), 0.25 * open_)
        rect_raw(x - 76, y - 326, x - 76 + 152 * open_, y, (200, 170, 120))
    w2 = 160 * (1 - open_ * 0.8)
    poly([(x - 80, y - 330), (x - 80 + w2, y - 330 - 20 * open_), (x - 80 + w2, y + 20 * open_), (x - 80, y)], (70, 52, 40), (110, 90, 70), 5)
    dot(x - 80 + w2 - 20, y - 160, 6, (200, 180, 120))


def mom(x, y, t, mood='happy', arms=('down', 'down'), face=1, s=1.0):
    p = blob(x, y, s, face, mood, arms=arms, t=t, seed=5)
    hc = p['head']
    circ(hc[0] - face * 30 * s, hc[1] - 44 * s, 18 * s, (110, 70, 40), OL, 4 * s)
    pts = [(hc[0] + math.cos(math.radians(a)) * 48 * s, hc[1] + math.sin(math.radians(a)) * 44 * s) for a in range(190, 351, 16)]
    pts += [(hc[0] + 40 * s, hc[1] - 18 * s), (hc[0] - 40 * s, hc[1] - 18 * s)]
    poly(pts, (110, 70, 40), OL, 4 * s, amp=0.8)
    return p


def friend(x, y, t, col, face=1, arms=('down', 'down'), mood='happy', seed=1, legs='stand'):
    p = blob(x, y, 1.0, face, mood, arms=arms, t=t, seed=seed, legs=legs)
    hc = p['head']
    poly([(hc[0] - 46, hc[1] - 10)] + [(hc[0] + math.cos(math.radians(a)) * 48, hc[1] + math.sin(math.radians(a)) * 44) for a in range(190, 351, 20)]
         + [(hc[0] + 46, hc[1] - 10)], col, OL, 4, amp=0.6)
    line([(hc[0], hc[1] - 12), (hc[0] + face * 70, hc[1] - 6)], 8, col, amp=0)
    return p


def gift(x, y, s=1.0, open_=0.0):
    rect(x - 60 * s, y - 100 * s, 120 * s, 100 * s, (210, 50, 50), OL, 4 * s)
    line([(x, y - 100 * s), (x, y)], 14 * s, GOLD, amp=0)
    ly = y - 100 * s - 140 * s * open_
    rect(x - 68 * s, ly - 26 * s, 136 * s, 26 * s, (220, 60, 60), OL, 4 * s)
    line([(x, ly - 26 * s), (x, ly)], 14 * s, GOLD, amp=0)
    for k in (-1, 1): ell(x + k * 22 * s, ly - 36 * s, 22 * s, 12 * s, GOLD, OL, 3 * s, rot=k * 0.4)


def console(x, y, s=1.0, glow_a=1.0):
    rect(x - 80 * s, y - 40 * s, 160 * s, 40 * s, (30, 30, 36), (100, 100, 110), 4 * s)
    line([(x - 50 * s, y - 20 * s), (x - 20 * s, y - 20 * s)], 4 * s, (120, 200, 255), amp=0)
    if glow_a > 0: glow(x, y - 20 * s, 120 * s, BLUEG, 0.5 * glow_a)


def pizza(x, y, n):
    for i in range(n):
        rect(x - 80 + (i % 2) * 8, y - (i + 1) * 22, 160, 22, (220, 190, 140), OL, 3, amp=0.5)


def can(x, y, col=(80, 200, 80)):
    rect(x - 14, y - 46, 28, 46, col, OL, 3, amp=0.3)


def exam(x, y, score, good=False, ang=-0.08):
    c, s_ = math.cos(ang), math.sin(ang)
    P = lambda px, py: (x + px * c - py * s_, y + px * s_ + py * c)
    poly([P(-130, -170), P(130, -170), P(130, 170), P(-130, 170)], (245, 245, 240), OL, 4)
    for k in range(6): line([P(-100, -90 + k * 40), P(100, -90 + k * 40)], 3, (180, 180, 190), amp=0)
    cx, cy = P(40, -120)
    text(score, cx, cy, 80, (60, 170, 70) if good else RD, None, font='hand')
    ell(cx, cy, 90, 54, None, (60, 170, 70) if good else RD, 5)


def cardbox(x, y, close=0.0, glow_a=0.0):
    if glow_a > 0: glow(x, y - 80, 160, BLUEG, glow_a)
    rect(x - 110, y - 150, 220, 150, (170, 125, 80), OL, 5)
    fl = lerp(-60, 0, close)
    poly([(x - 110, y - 150), (x - 110 - 70 * (1 - close), y - 150 + fl), (x, y - 150 + fl * 0.2), (x, y - 150)], (190, 145, 95), OL, 4)
    poly([(x + 110, y - 150), (x + 110 + 70 * (1 - close), y - 150 + fl), (x, y - 150 + fl * 0.2), (x, y - 150)], (190, 145, 95), OL, 4)


def quest(t, t0, key, done_t, xp):
    with ui():
        k = pop(t, t0, 0.3)
        if not k: return
        rect(560, 40, 800, 130, (16, 16, 24), GOLD, 5, amp=0.6)
        text(px(f"{L('quest')}:"), 620, 80, 24, GOLD, None, font='pixel', anchor='lm')
        text(L(key), 620, 132, 46, WHITE, None, font='hand', anchor='lm', sc=k)
        if t > done_t:
            check(1290, 105, 1.0 * pop(t, done_t, 0.25))
            ptext(f'+{xp} XP', 1100, 230 - (t - done_t) * 40, 34, GOLD, INK, sc=pop(t, done_t, 0.25))


from engine import check


def room(lamp_on=False, win_x=1500, moon=True):
    bg_dark()
    window(win_x, 300, moon)


# ---------------- escenas ----------------
SC = []


def scene(dur, chapter=None, ev=None):
    def deco(f):
        SC.append({'f': f, 'dur': dur, 'name': f.__name__, 'chapter': chapter, 'ev': ev or (lambda D: [])}); return f
    return deco


CH = {'hook': ('Nivel 99', 'Level 99'), 'gift': ('El regalo', 'The gift'), 'more': ('Solo una más', 'Just one more'),
      'over': ('Game over', 'Game over'), 'unplug': ('Desconectar', 'Unplug'),
      'levelup': ('Subir de nivel de verdad', 'Leveling up for real'), 'final': ('Pulsa start', 'Press start')}


@scene(8.6, 'hook', lambda D: [(0, 'chipfast'), (0.3, 'coin'), (0.6, 'coin'), (0.9, 'coin'), (1.2, 'levelup'), (1.3, 'coins'),
                              (2.2, 'coin'), (3.4, 'glitch'), (3.4, 'boom'), (3.6, 'lowbeep'), (4.1, 'type:hook')])
def g01_hook(t, D):
    if t < 3.4:
        cam(lerp(1.0, 1.08, t / 3.4), 960, 540)
        game_screen(-100, -60, 2120, 1200, t, 99, fx=(t % 0.6) / 0.6 if t < 1.1 else 0)
        k = pop(t, 1.2, 0.3)
        if k:
            for i in range(24):
                a = i * 0.26; u = clamp((t - 1.2) / 1.2)
                rect_raw(960 + math.cos(a) * 700 * u - 14, 520 + math.sin(a) * 400 * u - 14 + 200 * u * u,
                         960 + math.cos(a) * 700 * u + 14, 520 + math.sin(a) * 400 * u + 14 + 200 * u * u, GOLD)
            ptext(L('levelup'), 960, 400, 90, GOLD, INK, sc=k)
            ptext(L('lv99'), 960, 560, 70, WHITE, INK, sc=pop(t, 1.5, 0.3))
        return
    sx = shake(t, 3.4, 0.4, 16)
    cam(1.25, 980 + sx, 560)
    room()
    gdesk(1250, 780); monitor(1300, 520, t=t, level=99)
    gchair(820, 780)
    gamer(880, 780, t, 'tired', tired=1.0)
    for i in range(3): can(1080 + i * 40, 630, [(80, 200, 80), (60, 120, 220), (230, 70, 70)][i])
    hud(dict(health=0.12, friends=0.05, grades=0.08, sleep=0.1), 1, t)
    flash(t, 3.4, 0.06)
    typed(L('hook'), 960, 960, 54, t, 4.1, WHITE, fixed=True)


@scene(1.6, None, lambda D: [(0, 'rewind')])
def g02_rewind(t, D):
    rect_raw(-500, -500, 2500, 1600, (10, 10, 12))
    r = random.Random(int(t * 30))
    for i in range(14):
        y = r.uniform(0, 1080); rect_raw(0, y, 1920, y + r.uniform(2, 10), (60, 60, 70))
    for k in (0, 1):
        x = 900 + k * 90; poly([(x + 60, 470), (x + 60, 610), (x - 20, 540)], WHITE, None, 0)
    n = int(lerp(400, 1, ease(t / (D - 0.2))))
    text(f"{L('day')} {n}", 960, 760, 70, WHITE, None, font='mono')


@scene(9.0, 'gift', lambda D: [(0.3, 'door'), (0.8, 'steps'), (2.0, 'label'), (3.6, 'rustle'), (4.0, 'jingle'), (4.0, 'sparkle')])
def g03_gift(t, D):
    cam(1.3, 960, 600)
    room()
    day(1)
    door(420, 780, prog(t, 0.3, 0.6))
    mx = lerp(300, 700, prog(t, 0.8, 1.2))
    op = prog(t, 3.6, 0.5)
    p = mom(mx, 780, t, 'happy', arms=('down', (20, 70)) if op == 0 else ('down', 'down'))
    jump = abs(math.sin((t - 4.0) * 6)) * 30 if 4.0 < t < 5.6 else 0
    kid = blob(1020, 780 - jump, 1.0, -1, 'happy' if op > 0 else 'shock', t=t, arms=(('up', 'up') if jump else ('down', 'down')))
    if op == 0:
        gift(p['hands'][1][0] + 50, p['hands'][1][1] + 40, 0.9)
    else:
        gift(860, 780, 1.0, op)
        console(860, 700 - 60 * op, 0.9, op)
    if 2.0 < t < 4.0: label(mx + 60, 470, L('surprise'), 42)


@scene(8.0, None, lambda D: [(0, 'chipbgm'), (1.0, 'type:best'), (3.0, 'coin'), (4.5, 'label'), (5.5, 'coin'), (6.0, 'hudin'),
                             (6.6, 'coin'), (7.2, 'coin')])
def g04_night(t, D):
    cam(1.3, 1000, 580)
    room()
    day(1)
    wall_clock(820, 230, t, speed=60 * 60)
    gdesk(1250, 780); monitor(1300, 520, t=t, level=1 + int(t * 1.5), fx=(t % 1.0))
    gchair(820, 780)
    gamer(880, 780, t, 'happy')
    with ui():
        typed(L('best'), 960, 960, 54, t, 1.0, WHITE)
        if 4.5 < t < 6.2: label(150, 600, L('bed'), 42)
    if t > 6.0:
        with ui():
            sl = 1 - ease((t - 6.0) / 0.5)
            G.cam = (1.0, 960 - 600 * sl, 540)
            hud(FULL, 1, t)


@scene(7.0, 'more', lambda D: [(0, 'chipbgm'), (1.0, 'buzz'), (1.0, 'notif'), (2.5, 'decline'), (2.6, 'bloop'), (3.2, 'coin'),
                               (3.6, 'xp'), (4.2, 'blip'), (5.0, 'coin'), (5.8, 'coin')])
def g05_friends(t, D):
    cam(1.3, 1000, 580)
    room()
    day(12)
    gdesk(1250, 780); monitor(1300, 520, t=t, level=14 + int(t), fx=prog(t, 3.2, 0.8) if t < 4.2 else 0)
    gchair(820, 780)
    gamer(880, 780, t, 'happy', tired=0.2)
    if 1.0 < t < 2.5:
        sh = math.sin(t * 60) * 4
        phone(1080 + sh, 620, 0.0)
        with ui(): label(960, 960, L('come'), 44)
    if t > 4.2:
        with ui(): ptext(L('onemore'), 1300 * 0 + 1210, 360, 40, GOLD, INK, sc=pop(t, 4.2, 0.2))
    hud(hv(dict(health=0.95, friends=0.9, grades=0.9, sleep=0.85), dict(health=0.95, friends=0.5, grades=0.9, sleep=0.85), t, 2.6),
        2, t, 'friends' if 2.6 < t < 3.6 else None)


@scene(6.0, None, lambda D: [(0, 'chipbgm'), (0.8, 'door'), (1.4, 'label'), (2.4, 'bloop'), (3.0, 'coin'), (3.6, 'xp'), (4.8, 'coin')])
def g06_homework(t, D):
    cam(1.3, 960, 580)
    room()
    day(40)
    door(420, 780, prog(t, 0.8, 0.4))
    gdesk(1250, 780); monitor(1300, 520, t=t, level=45, fx=prog(t, 3.0, 0.8) if t < 3.9 else 0)
    books(1090, 630, 3 + int(prog(t, 0, D) * 5))
    gchair(820, 780)
    gamer(880, 780, t, 'neutral', tired=0.4)
    if t > 1.0: mom(560, 780, t, 'sad')
    if 1.4 < t < 3.6: label(560, 430, L('homework'), 42)
    hud(hv(dict(health=0.9, friends=0.45, grades=0.85, sleep=0.8), dict(health=0.9, friends=0.45, grades=0.4, sleep=0.8), t, 2.4),
        3, t, 'grades' if 2.4 < t < 3.4 else None)


@scene(6.0, None, lambda D: [(0, 'chipbgm'), (1.0, 'birds'), (2.0, 'bloop'), (2.6, 'yawn'), (3.4, 'coin'), (4.4, 'coin')])
def g07_sunrise(t, D):
    cam(1.3, 1000, 580)
    sun = prog(t, 0.2, 2.5)
    bg_dark()
    rect(1420, 220, 160, 160, tuple(int(lerp(a, b, sun)) for a, b in zip((24, 28, 40), (250, 160, 90))), (120, 124, 140), 5)
    line([(1500, 220), (1500, 380)], 4, (120, 124, 140)); line([(1420, 300), (1580, 300)], 4, (120, 124, 140))
    glow_poly([(1420, 220), (1580, 220), (1200, 800), (700, 800)], (255, 160, 90), 0.18 * sun)
    day(90)
    digital(560, 600, '07:00', 0.7, t=t)
    gdesk(1250, 780); monitor(1300, 520, t=t, level=68)
    gchair(820, 780)
    yawn = 2.6 < t < 3.6
    gamer(880, 780, t, 'shock' if yawn else 'tired', tired=0.8)
    hud(hv(dict(health=0.85, friends=0.4, grades=0.4, sleep=0.75), dict(health=0.85, friends=0.4, grades=0.4, sleep=0.25), t, 2.0),
        4, t, 'sleep' if 2.0 < t < 3.0 else None)


@scene(6.0, None, lambda D: [(0, 'chipbgm'), (0.5, 'thud'), (1.2, 'thud'), (2.2, 'bloop'), (3.0, 'record'), (3.0, 'coins')])
def g08_pizza(t, D):
    cam(1.3, 1000, 580)
    room()
    day(150)
    gdesk(1250, 780); monitor(1300, 520, t=t, level=99, boss=True)
    pizza(560, 780, 2 + int(prog(t, 0.3, 1.5) * 4))
    for i in range(int(prog(t, 0.5, 1.5) * 5)): can(1060 + i * 34, 630, [(80, 200, 80), (60, 120, 220), (230, 70, 70)][i % 3])
    gchair(820, 780)
    gamer(880, 780, t, 'tired', tired=1.0)
    if t > 3.0:
        with ui(): ptext(L('record'), 1210, 360, 34, GOLD, INK, sc=pop(t, 3.0, 0.2))
    hud(hv(dict(health=0.8, friends=0.35, grades=0.35, sleep=0.25), dict(health=0.3, friends=0.35, grades=0.35, sleep=0.25), t, 2.2),
        5, t, 'health' if 2.2 < t < 3.2 else None)


@scene(3.0, None, lambda D: [(k * 0.375, 'coin' if k % 2 == 0 else 'bloop') for k in range(8)])
def g09_montage(t, D):
    k = int(t / 0.375)
    fns = [g05_friends, g07_sunrise, g08_pizza, g06_homework]
    fns[k % 4](2.0 + (t % 0.375), 6.0)
    with ui():
        rect_raw(0, 20, 560, 120, BG)
        rect_raw(1440, 30, 1900, 330, (16, 16, 22))
    day(151 + k * 31)
    u = t / D
    hud(dict(health=lerp(0.3, 0.12, u), friends=lerp(0.35, 0.05, u), grades=lerp(0.35, 0.08, u), sleep=lerp(0.25, 0.1, u)), 1, t)
    flash(t % 0.375, 0, 0.04, (60, 60, 70))


@scene(12.0, 'over', lambda D: [(0, 'chipbgm_end'), (0.5, 'whoosh'), (0.9, 'fail'), (3.0, 'buzz'), (3.0, 'notif'),
                                (6.0, 'powercut'), (7.5, 'type:off')])
def g10_gameover(t, D):
    if t < 6.0:
        cam(1.3, 1000, 580)
        room()
        day(400)
        gdesk(1250, 780); monitor(1300, 520, t=t, level=99, boss=True)
        gchair(820, 780)
        gamer(880, 780, t, 'shock' if t > 0.9 else 'tired', tired=1.0, play=t < 0.9)
        if t > 0.5:
            exam(lerp(-200, 560, ease((t - 0.5) / 0.4)), 520, '3/10')
        if 3.0 < t < 5.6:
            phone(1080 + math.sin(t * 60) * 4, 620, 0.0)
            with ui(): label(960, 960, L('without'), 44)
        hud(dict(health=0.12, friends=0.0 if t > 3.2 else 0.05, grades=0.0 if t > 0.9 else 0.08, sleep=0.1), 1, t,
            'grades' if 0.9 < t < 2.0 else ('friends' if 3.2 < t < 4.2 else None))
        return
    rect_raw(-500, -500, 2500, 1600, (6, 6, 8))
    cam(lerp(1.3, 1.7, ease((t - 6.0) / (D - 6.0))), 1280, 520)
    rect_raw(-500, 780, 2500, 1600, (9, 9, 11))
    monitor(1300, 520, t=t, on=False, reflect=True)
    blob(880, 780, 1.0, 1, 'sad', legs='sit', t=t, look=(1, 0), lean=14)
    rect_raw(-500, -500, 2500, 1600, (0, 0, 0)) if 6.0 <= t < 6.15 else None
    typed(L('off'), 960, 960, 54, t, 7.5, (220, 220, 225), cps=14, fixed=True)


@scene(10.0, 'unplug', lambda D: [(0, 'pianosad'), (1.5, 'unplug'), (2.0, 'bloopdown'), (3.5, 'steps'), (5.0, 'rustle'),
                                  (6.6, 'boxclose'), (7.5, 'sigh')])
def g11_unplug(t, D):
    cam(1.25, 980, 580)
    room(moon=False)
    glow_poly([(1420, 220), (1580, 220), (1200, 800), (700, 800)], (200, 190, 160), 0.12)
    day(1)
    gdesk(1250, 780); monitor(1300, 520, t=t, on=False)
    pull = prog(t, 1.5, 0.4)
    line([(1330, 640), (1500, 700), (lerp(1640, 1560, pull), 760)], 5, (30, 30, 34))
    rect(1650 - 90 * pull, 700, 30, 70, (200, 200, 205), OL, 3)
    pack = prog(t, 3.5, 2.5)
    cx = lerp(1120, 700, pack); cy = lerp(630, 640 + 0 * pack, pack)
    if t < 6.2: console(cx, cy, 0.8, 0.3 * (1 - pull))
    cardbox(560, 780, prog(t, 6.2, 0.5))
    bx = lerp(900, 760, pack)
    blob(bx, 780, 1.0, -1 if pack > 0 else 1, 'determined' if t > 1.0 else 'sad', t=t,
         arms=('down', (40, 100)) if 0 < pack < 1 else ('down', 'down'))
    hud(dict(health=0.12, friends=0.0, grades=0.0, sleep=0.1), 1, t)


@scene(11.0, None, lambda D: [(0, 'pianosad'), (0.5, 'heartbeat'), (1.6, 'heartbeat'), (2.0, 'ghost'), (2.7, 'heartbeat'),
                              (3.8, 'heartbeat'), (5.0, 'type:hardest'), (4.9, 'heartbeat')])
def g12_withdrawal(t, D):
    cam(1.25, 960, 580)
    room()
    day(1 + int(prog(t, 0, D) * 6))
    C.bed(1250, 780, 440)
    pulse = 0.5 + 0.5 * math.sin(t * 4)
    cardbox(560, 780, 1.0, glow_a=0.35 * pulse if t > 1.8 else 0)
    shake_ = math.sin(t * 40) * 2
    p = blob(1150 + shake_, 780, 1.0, -1, 'sad', legs='sit', t=t, look=(-1, 0))
    hc = p['head']
    text(px(L('mood')), hc[0], hc[1] - 110, 18, (200, 200, 205), None, font='pixel')
    rect(hc[0] - 80, hc[1] - 90, 160, 22, (30, 30, 36), (120, 120, 130), 3, amp=0)
    rect_raw(hc[0] - 76, hc[1] - 86, hc[0] - 76 + 152 * (0.12 + 0.04 * math.sin(t * 7)), hc[1] - 72, RD)
    if 2.0 < t < 4.6: ptext(L('ghost'), 560, 520, 24, (140, 190, 255), INK, sc=pop(t, 2.0, 0.2))
    typed(L('hardest'), 960, 960, 54, t, 5.0, WHITE, fixed=True)


def outdoor(t):
    sky_grad((70, 100, 170), (250, 180, 130), -300, 760)
    circ(1500, 620, 70, (255, 220, 160), None, 0); glow(1500, 620, 200, (255, 170, 100), 0.5)
    for i in range(7):
        x = ((i * 330 - t * 200) % 2600) - 300
        poly([(x - 90, 780), (x, 520 - (i % 3) * 40), (x + 90, 780)], (40, 70, 60), (30, 50, 40), 4)
    rect_raw(-500, 780, 2500, 1600, (70, 110, 70)); line([(-300, 780), (2300, 780)], 4, (40, 70, 40))


def lvup(t, t0, lv):
    if t < t0: return
    with ui():
        k = pop(t, t0, 0.25)
        ptext(L('levelup'), 960, 470, 80, GOLD, INK, sc=k)
        ptext(f'LV {lv}', 960, 590, 60, WHITE, INK, sc=pop(t, t0 + 0.2, 0.25))


@scene(6.0, 'levelup', lambda D: [(0, 'uplift'), (0.3, 'quest'), (0, 'runsteps'), (3.6, 'done'), (3.6, 'xp'), (4.2, 'hudup')])
def g13_run(t, D):
    cam(1.25, 960, 600)
    outdoor(t)
    blob(880, 780, 1.0, 1, 'determined', arms=((50 + 40 * math.sin(t * 12), 120), (50 - 40 * math.sin(t * 12), 120)),
         legs='run', walk=t * 12, t=t, lean=18)
    day(9)
    quest(t, 0.3, 'q1', 3.6, 50)
    hud(hv(dict(health=0.12, friends=0.0, grades=0.0, sleep=0.1), dict(health=0.4, friends=0.0, grades=0.0, sleep=0.1), t, 4.2), 1, t)


@scene(6.0, None, lambda D: [(0, 'uplift'), (0.3, 'quest'), (0.6, 'pages'), (3.6, 'done'), (3.6, 'xp'), (4.2, 'hudup')])
def g14_study(t, D):
    cam(1.3, 960, 600)
    room(moon=False)
    day(23)
    desk(1150, 780); lamp(1340, 630); books(1240, 630, 3)
    rect(1000, 560, 120, 70, (40, 40, 46), (90, 90, 100), 4)
    C.chair(800, 780)
    p = blob(820, 780, 1.0, 1, 'determined', arms=((40, 110), (55, 120)), legs='sit', t=t, lean=12)
    h = p['hands'][1]
    poly([(h[0] - 10, h[1] - 30), (h[0] + 70, h[1] - 50), (h[0] + 80, h[1]), (h[0], h[1] + 10)], (240, 236, 220), OL, 3)
    quest(t, 0.3, 'q2', 3.6, 80)
    hud(hv(dict(health=0.4, friends=0.0, grades=0.0, sleep=0.1), dict(health=0.45, friends=0.0, grades=0.5, sleep=0.1), t, 4.2), 1, t)


@scene(6.5, None, lambda D: [(0, 'uplift'), (0.3, 'quest'), (1.0, 'steps'), (2.8, 'clap'), (3.0, 'laugh'), (3.6, 'done'),
                             (3.6, 'xp'), (4.2, 'hudup')])
def g15_friends(t, D):
    cam(1.25, 960, 600)
    outdoor(0)
    day(37)
    x = lerp(300, 760, prog(t, 0.6, 1.8))
    five = 2.6 < t < 3.2
    blob(x, 780, 1.0, 1, 'happy', t=t, legs='walk' if t < 2.4 else 'stand', walk=t * 6,
         arms=('down', (150, 170)) if five else ('down', 'down'))
    friend(1000, 780, t, (80, 150, 255), -1, arms=((150, 170), 'down') if five else ('down', 'down'))
    friend(1220, 780, t, (230, 90, 90), -1, seed=3)
    friend(1430, 780, t, (90, 200, 120), -1, seed=4, mood='happy')
    quest(t, 0.3, 'q3', 3.6, 120)
    hud(hv(dict(health=0.45, friends=0.0, grades=0.5, sleep=0.1), dict(health=0.5, friends=0.7, grades=0.5, sleep=0.1), t, 4.2), 1, t)


@scene(7.0, None, lambda D: [(0, 'uplift'), (0.3, 'quest'), (1.0, 'snore'), (3.6, 'done'), (4.2, 'hudup'), (4.8, 'levelup'),
                             (4.9, 'coins')])
def g16_sleep(t, D):
    cam(1.3, 900, 600)
    room()
    day(60)
    C.bed(900, 780)
    head(670, 692, 0.95, 1, 'sleep', t)
    C.blanket(900, 780, b=math.sin(t * 1.5) * 4)
    digital(330, 650, '23:00', 0.7, t=t, col=(120, 200, 255))
    quest(t, 0.3, 'q4', 3.6, 100)
    hud(hv(dict(health=0.5, friends=0.7, grades=0.5, sleep=0.1), dict(health=0.6, friends=0.7, grades=0.55, sleep=0.8), t, 4.2),
        1 if t < 4.8 else 2, t)
    lvup(t, 4.8, 2)


@scene(6.0, None, lambda D: [(0, 'uplift'), (0.5, 'whoosh'), (1.0, 'done'), (1.6, 'cheer'), (3.0, 'levelup'), (3.1, 'coins')])
def g17_exam(t, D):
    cam(1.25, 960, 600)
    room(moon=False)
    day(180)
    exam(lerp(-200, 1300, ease((t - 0.5) / 0.4)) if t > 0.5 else -400, 600, '9/10', good=True, ang=0.06)
    mom(480, 780, t, 'happy', arms=('down', (150, 170)) if t > 1.6 else ('down', 'down'))
    blob(740, 780 - (abs(math.sin(t * 6)) * 25 if 1.6 < t < 3 else 0), 1.0, -1, 'happy', t=t,
         arms=(('up', 'up') if 1.6 < t < 3 else ('down', 'down')))
    hud(dict(health=0.85, friends=0.85, grades=0.9, sleep=0.85), 10 if t > 3.0 else 2, t)
    lvup(t, 3.0, 10)


@scene(10.0, 'final', lambda D: [(0, 'warm'), (0.5, 'chipsoft'), (1.0, 'laugh'), (2.0, 'type:notenemy'), (5.5, 'type:living'),
                                 (8.0, 'click')])
def g18_balance(t, D):
    cam(1.2, 960, 580)
    room()
    day(365)
    C.wall_clock(960, 230, t)
    sofa_y = 780
    rect(560, sofa_y - 120, 720, 120, (70, 50, 60), (110, 90, 100), 5)
    monitor(1500, 470, 380, 230, t=t, on=t < 8.0, level=12)
    for i, (x, col) in enumerate(((700, None), (880, (80, 150, 255)), (1060, (230, 90, 90)))):
        play = t < 8.0
        jig = math.sin(t * 16 + i) * 3 if play else 0
        arms = ((32, 95 + jig), (42, 100 - jig)) if play else ('down', 'down')
        if col: p = friend(x, sofa_y, t, col, 1, arms=arms, legs='sit', seed=i + 2, mood='happy')
        else: p = blob(x, sofa_y, 1.0, 1, 'happy', arms=arms, legs='sit', t=t)
        if play:
            hx = (p['hands'][0][0] + p['hands'][1][0]) / 2; hy = (p['hands'][0][1] + p['hands'][1][1]) / 2
            controller(hx + 6, hy, 0.7)
    typed(L('notenemy'), 960, 900, 54, t, 2.0, WHITE, fixed=True)
    typed(L('living'), 960, 980, 54, t, 5.5, GOLD, fixed=True)


@scene(8.0, None, lambda D: [(0, 'pianoend'), (0.3, 'type:restart'), (4.0, 'blip'), (4.6, 'blip'), (5.2, 'blip'), (5.8, 'blip'),
                             (6.4, 'blip'), (7.0, 'blip')])
def g19_title(t, D):
    rect_raw(-500, -500, 2500, 1600, (10, 10, 12))
    typed(L('restart'), 960, 420, 70, t, 0.3, WHITE, cps=16)
    if t > 4.0 and (t * 1.6) % 1 < 0.65:
        ptext(L('press'), 960, 700, 60, GOLD, None)


@scene(15.0, None, lambda D: [(0, 'chipsoft'), (0.3, 'blip'), (0.6, 'blip')])
def g20_end(t, D):
    bg_dark()
    p = blob(330, 780, 1.1, 1, 'happy', arms=('down', (140, 160 + 25 * math.sin(t * 6))), t=t)
    text(L('cta'), 960, 160, 74, WHITE, None, font='lucky', sc=pop(t, 0.3))
    text(L('cta2'), 960, 260, 48, (200, 200, 205), None, font='hand', sc=pop(t, 0.6))
    rect(800, 360, 760, 430, (30, 30, 36), (200, 200, 210), 6)
    text(L('next'), 1180, 575, 80, WHITE, None)
    circ(560, 520, 95, (40, 40, 46), (200, 200, 210), 6)
    rect(420, 640, 280, 70, RD, OL, 4)
    text(L('subs'), 560, 676, 38, WHITE, None)


# ---------------- render ----------------
def frame(i, t):
    sc = SC[i]
    E.begin(t, i + 1, BG); C.glow_begin()
    sc['f'](t, sc['dur'])
    im = C.finish()
    if t < 0.18 and i > 0 and sc['name'] not in ('g02_rewind', 'g09_montage'):
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
    p.stdin.close(); p.wait(); return path


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
                        os.path.join(OUT, f'juego_{LANG}_sin_audio.mp4')], check=True)
        ch, tot = capitulos(); print('\n'.join(ch)); print('total', tot)
