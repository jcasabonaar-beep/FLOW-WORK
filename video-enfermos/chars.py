"""Personajes: monigote de cabeza grande, simios y esqueleto."""
import math
from engine import *

ARMS = {
    'down': (12, 6), 'hips': (40, -25), 'up': (165, 175), 'point': (88, 92), 'hold': (25, 118),
    'hold_low': (20, 75), 'face': (58, 192), 'shrug': (70, 150), 'front': (18, 60), 'thumb': (30, 150),
    'back': (8, -10), 'wave': (140, 168),
}


def _dir(a, side):
    r = math.radians(a)
    return (side * math.sin(r), math.cos(r))


def person(x, y, s=1.0, face=1, mood='neutral', outfit='fur', hair='cave', arms=('down', 'down'),
           legs='stand', t=0.0, look=(0, 0), bob=True, head_dx=0.0, head_dy=0.0, extras=(), walk=0.0,
           headcol=WHITE, blink=True, seed=0, legs_lost=()):
    """(x, y) = punto entre los pies. Devuelve dict con manos, cabeza, cuello."""
    b = math.sin(t * 2.4 + seed) * 3 * s if bob else 0
    hip = (x, y - 165 * s + b * 0.3)
    nk = (x, y - 318 * s + b)
    hr = 70 * s
    hc = (x + head_dx, nk[1] - 58 * s + head_dy)
    sh = (x, nk[1] + 26 * s)
    out = {'head': hc, 'neck': nk, 'hip': hip, 'r': hr}

    # pelo largo detras
    if hair == 'long':
        pts = [(hc[0] + math.cos(math.radians(a)) * hr * 1.12, hc[1] + math.sin(math.radians(a)) * hr * 1.12)
               for a in range(160, 381, 20)]
        pts += [(hc[0] + hr * 1.05, hc[1] + hr * 1.55), (hc[0] + hr * 0.5, hc[1] + hr * 1.4),
                (hc[0], hc[1] + hr * 1.55), (hc[0] - hr * 0.5, hc[1] + hr * 1.4), (hc[0] - hr * 1.05, hc[1] + hr * 1.55)]
        poly(pts, HAIR, INK, 5 * s)
    if outfit == 'shaman':
        for i, a in enumerate(range(-150, -20, 26)):
            ang = math.radians(a)
            fx, fy = hc[0] + math.cos(ang) * hr * 1.7, hc[1] + math.sin(ang) * hr * 1.7
            ell((hc[0] + fx) / 2, (hc[1] + fy) / 2, hr * 0.75, hr * 0.2, (RED, YEL, BLUE, GREEN, ORANGE)[i % 5],
                INK, 4 * s, rot=ang)

    # piernas
    lw = 7 * s
    if legs == 'walk':
        ph = walk
        feet = [(x + 42 * s * math.sin(ph), y - max(0, 22 * s * math.cos(ph))),
                (x - 42 * s * math.sin(ph), y - max(0, -22 * s * math.cos(ph)))]
    elif legs == 'sit':
        feet = [(x - 60 * s, y), (x + 60 * s, y)]
    else:
        feet = [(x - 34 * s, y), (x + 34 * s, y)]
    for i, f in enumerate(feet):
        side = -1 if i == 0 else 1
        if i in legs_lost:
            kn = (lerp(hip[0], f[0], 0.5) + side * 8 * s, lerp(hip[1], f[1], 0.5))
            line([hip, kn], lw)
            continue
        kn = (lerp(hip[0], f[0], 0.5) + face * 10 * s, lerp(hip[1], f[1], 0.5))
        if legs == 'sit':
            kn = (f[0] + face * 10 * s, hip[1] + 20 * s)
        line([hip, kn, f], lw)
        line([f, (f[0] + face * 22 * s, f[1])], lw)

    # torso
    line([nk, hip], lw)
    if outfit in ('fur', 'shaman'):
        hy = hip[1]
        pts = [(x - 26 * s, nk[1] + 18 * s), (x + 32 * s, nk[1] + 6 * s), (x + 42 * s, hy + 34 * s),
               (x + 28 * s, hy + 50 * s), (x + 14 * s, hy + 36 * s), (x, hy + 52 * s), (x - 14 * s, hy + 36 * s),
               (x - 28 * s, hy + 50 * s), (x - 42 * s, hy + 34 * s), (x - 34 * s, nk[1] + 60 * s)]
        poly(pts, FUR, INK, 5 * s)
        line([(x - 10 * s, nk[1] + 60 * s), (x - 2 * s, nk[1] + 80 * s)], 3 * s, FUR2, amp=0)
        line([(x + 16 * s, hy - 10 * s), (x + 24 * s, hy + 8 * s)], 3 * s, FUR2, amp=0)
        line([(x - 22 * s, hy - 40 * s), (x - 14 * s, hy - 22 * s)], 3 * s, FUR2, amp=0)
    elif outfit == 'coat':
        hy = hip[1]
        poly([(x - 40 * s, nk[1] + 14 * s), (x + 40 * s, nk[1] + 14 * s), (x + 56 * s, hy + 70 * s),
              (x - 56 * s, hy + 70 * s)], WHITE, INK, 5 * s)
        line([(x, nk[1] + 14 * s), (x, hy + 70 * s)], 3 * s)
        line([(x - 20 * s, nk[1] + 14 * s), (x, nk[1] + 60 * s), (x + 20 * s, nk[1] + 14 * s)], 4 * s)
        arc(x, nk[1] + 40 * s, 30 * s, 20, 160, 4 * s, (60, 60, 70))
        dot(x - 26 * s, nk[1] + 72 * s, 8 * s, (90, 90, 100))

    # brazos
    hands = []
    for i, a in enumerate(arms):
        side = -1 if i == 0 else 1
        a1, a2 = ARMS[a] if isinstance(a, str) else a
        d1 = _dir(a1, side); d2 = _dir(a2, side)
        el = (sh[0] + d1[0] * 72 * s, sh[1] + d1[1] * 72 * s)
        hd = (el[0] + d2[0] * 66 * s, el[1] + d2[1] * 66 * s)
        line([sh, el, hd], lw)
        hands.append(hd)
        if 'bandage' in extras and i == 0:
            for k in range(3):
                u = 0.25 + k * 0.22
                p = (lerp(el[0], hd[0], u), lerp(el[1], hd[1], u))
                ell(p[0], p[1], 14 * s, 9 * s, WHITE, INK, 3 * s, rot=math.atan2(d2[1], d2[0]) + 1.57)
    out['hands'] = hands
    out['feet'] = feet

    # cabeza
    hcol = SICK if mood == 'sick' else headcol
    circ(hc[0], hc[1], hr, hcol, INK, 6 * s)
    if 'swollen' in extras:
        circ(hc[0] - face * hr * 0.75, hc[1] + hr * 0.35, hr * 0.42, (255, 210, 210), INK, 5 * s)
    if outfit == 'shaman':
        for k in (-1, 1):
            line([(hc[0] + k * 30 * s, hc[1] + 12 * s), (hc[0] + k * 48 * s, hc[1] + 16 * s)], 5 * s, RED, amp=0)
            line([(hc[0] + k * 30 * s, hc[1] + 24 * s), (hc[0] + k * 48 * s, hc[1] + 28 * s)], 5 * s, RED, amp=0)
    _face(hc, hr, s, face, mood, look, t, blink, seed, extras)
    if hair == 'cave' or hair == 'long':
        pts = [(hc[0] + math.cos(math.radians(a)) * hr * 1.07, hc[1] + math.sin(math.radians(a)) * hr * 1.07)
               for a in range(188, 353, 12)]
        n = 9
        for k in range(n + 1):
            u = 1 - k / n
            px = hc[0] + (u * 2 - 1) * hr * 0.98
            py = hc[1] - hr * (0.42 if k % 2 else 0.6) + abs(u * 2 - 1) ** 2 * hr * 0.25
            pts.append((px, py))
        poly(pts, HAIR, INK, 5 * s, amp=1.2)
    if 'beard' in extras:
        poly([(hc[0] - hr * 0.6, hc[1] + hr * 0.45), (hc[0] + hr * 0.6, hc[1] + hr * 0.45),
              (hc[0] + hr * 0.3, hc[1] + hr * 1.15), (hc[0], hc[1] + hr * 1.3), (hc[0] - hr * 0.3, hc[1] + hr * 1.15)],
             HAIR, INK, 4 * s)
    if 'headband' in extras:
        line([(hc[0] - hr * 0.98, hc[1] - hr * 0.3), (hc[0] + hr * 0.98, hc[1] - hr * 0.3)], 18 * s, WHITE, amp=0.5)
        line([(hc[0] - hr * 0.98, hc[1] - hr * 0.3 - 9 * s), (hc[0] + hr * 0.98, hc[1] - hr * 0.3 - 9 * s)], 3 * s, amp=0.5)
        line([(hc[0] - hr * 0.98, hc[1] - hr * 0.3 + 9 * s), (hc[0] + hr * 0.98, hc[1] - hr * 0.3 + 9 * s)], 3 * s, amp=0.5)
        dot(hc[0] + hr * 0.3, hc[1] - hr * 0.3, 6 * s, RED)
    if 'eyepatch' in extras:
        ex = hc[0] + face * 10 * s - 22 * s
        line([(hc[0] - hr, hc[1] - hr * 0.3), (hc[0] + hr * 0.95, hc[1] - hr * 0.2)], 4 * s, amp=0)
        circ(ex, hc[1] - 2 * s, 15 * s, INK, INK, 2 * s)
    if 'sweat' in extras:
        u = (t * 0.8) % 1
        sx, sy = hc[0] + face * hr * 0.95, hc[1] - hr * 0.3 + u * 40 * s
        poly([(sx, sy - 18 * s), (sx + 10 * s, sy + 2 * s), (sx, sy + 10 * s), (sx - 10 * s, sy + 2 * s)],
             (140, 200, 255), INK, 3 * s, amp=0)
    if 'blush' in extras:
        for k in (-1, 1):
            ell(hc[0] + face * 10 * s + k * 40 * s, hc[1] + 20 * s, 14 * s, 8 * s, PINK, None, 0)
    if 'tears' in extras:
        for k in (-1, 1):
            ex = hc[0] + face * 10 * s + k * 22 * s
            u = (t * 2 + (k + 1) * 0.3) % 1
            line([(ex, hc[1] + 8 * s), (ex + k * 4 * s, hc[1] + 8 * s + u * 90 * s)], 8 * s, (120, 190, 255), amp=0)
    if 'heart_eyes' in extras:
        for k in (-1, 1):
            heart(hc[0] + face * 10 * s + k * 22 * s, hc[1] - 4 * s, 0.6 * s * (1 + 0.15 * math.sin(t * 10)))
    if 'zz' in extras:
        text('Z', hc[0] + hr, hc[1] - hr - 10 * s - (t * 20 % 40) * s, 40 * s, WHITE, INK)
    return out


def _face(hc, hr, s, face, mood, look, t, blink, seed, extras):
    ex = hc[0] + face * 10 * s + look[0] * 9 * s
    ey = hc[1] - 4 * s + look[1] * 7 * s
    mx, my = hc[0] + face * 8 * s, hc[1] + 32 * s
    closed = blink and ((t + seed * 0.37) % 3.3) < 0.13
    eyes = [(ex - 22 * s, ey), (ex + 22 * s, ey)]
    if 'heart_eyes' in extras:
        pass
    elif mood in ('happy_closed', 'sleep'):
        for e in eyes: arc(e[0], e[1] + 4 * s, 11 * s, 200, 340, 5 * s)
    elif mood == 'pain':
        for k, e in enumerate(eyes):
            sg = 1 if k == 0 else -1
            line([(e[0] - 10 * s * sg, e[1] - 9 * s), (e[0] + 8 * s * sg, e[1]), (e[0] - 10 * s * sg, e[1] + 9 * s)], 5 * s, amp=0)
    elif mood == 'wink':
        dot(eyes[0][0], eyes[0][1], 7 * s)
        arc(eyes[1][0], eyes[1][1] + 4 * s, 11 * s, 200, 340, 5 * s)
    elif mood == 'faint':
        for e in eyes:
            line([(e[0] - 9 * s, e[1] - 9 * s), (e[0] + 9 * s, e[1] + 9 * s)], 5 * s, amp=0)
            line([(e[0] + 9 * s, e[1] - 9 * s), (e[0] - 9 * s, e[1] + 9 * s)], 5 * s, amp=0)
    elif closed:
        for e in eyes: line([(e[0] - 9 * s, e[1]), (e[0] + 9 * s, e[1])], 5 * s, amp=0)
    elif mood == 'shock':
        for e in eyes:
            circ(e[0], e[1] - 4 * s, 16 * s, WHITE, INK, 4 * s, amp=0.5)
            dot(e[0] + look[0] * 4 * s, e[1] - 4 * s, 6 * s)
    elif mood == 'sick':
        for e in eyes:
            dot(e[0], e[1] + 2 * s, 6 * s)
            line([(e[0] - 12 * s, e[1] - 4 * s), (e[0] + 12 * s, e[1] - 4 * s)], 5 * s, amp=0)
    else:
        for e in eyes: dot(e[0], e[1], 7 * s)

    if mood in ('sad', 'cry', 'worried'):
        line([(eyes[0][0] - 14 * s, ey - 28 * s), (eyes[0][0] + 10 * s, ey - 20 * s)], 4 * s, amp=0)
        line([(eyes[1][0] + 14 * s, ey - 28 * s), (eyes[1][0] - 10 * s, ey - 20 * s)], 4 * s, amp=0)
    if mood == 'angry' or 'brow' in extras:
        line([(eyes[0][0] - 16 * s, ey - 26 * s), (eyes[1][0] + 16 * s, ey - 26 * s)], 9 * s, amp=1)
    if mood == 'skeptic':
        line([(eyes[0][0] - 12 * s, ey - 20 * s), (eyes[0][0] + 12 * s, ey - 20 * s)], 4 * s, amp=0)
        arc(eyes[1][0], ey - 18 * s, 14 * s, 200, 340, 4 * s)

    if mood in ('happy', 'happy_closed', 'wink'):
        arc(mx, my - 8 * s, 20 * s, 20, 160, 5 * s)
    elif mood in ('sad', 'cry'):
        arc(mx, my + 10 * s, 16 * s, 200, 340, 5 * s)
    elif mood == 'shock':
        ell(mx, my + 4 * s, 12 * s, 16 * s, (90, 30, 30), INK, 4 * s)
    elif mood == 'sick':
        line([(mx - 18 * s + i * 6 * s, my + (3 if i % 2 else -3) * s) for i in range(7)], 4 * s, amp=0)
    elif mood == 'pain':
        line([(mx - 20 * s + i * 8 * s, my + (5 if i % 2 else -5) * s) for i in range(6)], 4 * s, amp=0)
    elif mood == 'grin':
        poly([(mx - 30 * s, my - 8 * s), (mx + 30 * s, my - 8 * s), (mx + 18 * s, my + 14 * s), (mx - 18 * s, my + 14 * s)],
             WHITE, INK, 4 * s, amp=0)
        line([(mx - 26 * s, my), (mx + 26 * s, my)], 3 * s, amp=0)
    elif mood == 'worried':
        line([(mx - 14 * s + i * 7 * s, my + (2 if i % 2 else -2) * s) for i in range(5)], 4 * s, amp=0)
    elif mood == 'chew':
        ell(mx, my, 12 * s, (4 + 6 * abs(math.sin(t * 9))) * s, (90, 30, 30), INK, 3 * s)
    elif mood == 'yuck':
        line([(mx - 18 * s, my + 2 * s), (mx - 6 * s, my - 4 * s), (mx + 6 * s, my + 4 * s), (mx + 18 * s, my - 2 * s)], 5 * s, amp=0)
        poly([(mx - 2 * s, my + 2 * s), (mx + 12 * s, my + 2 * s), (mx + 6 * s, my + 20 * s)], PINK, INK, 3 * s, amp=0)
    elif mood == 'faint':
        ell(mx, my, 10 * s, 6 * s, (90, 30, 30), INK, 3 * s)
    elif mood in ('neutral', 'skeptic', 'angry'):
        line([(mx - 12 * s, my), (mx + 12 * s, my)], 5 * s, amp=0)


def ape(x, y, s=1.0, kind='chimp', mood='neutral', t=0.0, arm=None, face=1, extras=()):
    """Simio sentado. (x,y) = suelo. arm: angulos del brazo derecho (o None)."""
    body = (60, 44, 38) if kind == 'chimp' else (214, 110, 40)
    facec = (214, 180, 150) if kind == 'chimp' else (200, 150, 110)
    b = math.sin(t * 2.2) * 3 * s
    ell(x, y - 120 * s + b, 110 * s, 125 * s, body, INK, 6 * s)
    for k in (-1, 1):
        ell(x + k * 70 * s, y - 15 * s, 50 * s, 22 * s, body, INK, 5 * s)
    line([(x - 80 * s, y - 170 * s + b), (x - 120 * s, y - 70 * s), (x - 90 * s, y - 20 * s)], 26 * s, INK)
    line([(x - 80 * s, y - 170 * s + b), (x - 120 * s, y - 70 * s), (x - 90 * s, y - 20 * s)], 18 * s, body)
    hc = (x + face * 10 * s, y - 280 * s + b)
    hand = None
    if arm is not None:
        a1, a2 = arm
        sh = (x + 80 * s, y - 170 * s + b)
        el = (sh[0] + math.sin(math.radians(a1)) * 85 * s, sh[1] + math.cos(math.radians(a1)) * 85 * s)
        hand = (el[0] + math.sin(math.radians(a2)) * 80 * s, el[1] + math.cos(math.radians(a2)) * 80 * s)
    if kind == 'chimp':
        for k in (-1, 1): circ(hc[0] + k * 82 * s, hc[1] + 5 * s, 24 * s, facec, INK, 5 * s)
    circ(hc[0], hc[1], 80 * s, body, INK, 6 * s)
    if kind == 'orangutan':
        for k in (-1, 1): ell(hc[0] + k * 72 * s, hc[1] + 15 * s, 34 * s, 50 * s, (180, 120, 80), INK, 5 * s)
    ell(hc[0], hc[1] + 12 * s, 58 * s, 56 * s, facec, INK, 5 * s)
    ell(hc[0], hc[1] + 44 * s, 42 * s, 26 * s, facec, INK, 4 * s)
    if 'wound' in extras:
        w = extras['wound'] if isinstance(extras, dict) else 1.0
        if w > 0.02:
            ell(hc[0] - face * 40 * s, hc[1] + 6 * s, 16 * s * w, 10 * s * w, RED, INK, 3 * s)
    if isinstance(extras, dict) and extras.get('paste', 0) > 0:
        ell(hc[0] - face * 40 * s, hc[1] + 6 * s, 22 * s, 16 * s * extras['paste'], GREEN, INK, 3 * s)
    if mood == 'yuck':
        for k in (-1, 1):
            line([(hc[0] + k * 30 * s, hc[1] - 18 * s), (hc[0] + k * 14 * s, hc[1] - 6 * s), (hc[0] + k * 30 * s, hc[1] + 4 * s)], 5 * s, amp=0)
    else:
        for k in (-1, 1): dot(hc[0] + k * 22 * s, hc[1] - 6 * s, 7 * s)
    dot(hc[0] - 8 * s, hc[1] + 30 * s, 3 * s); dot(hc[0] + 8 * s, hc[1] + 30 * s, 3 * s)
    if mood == 'chew' or mood == 'yuck':
        ell(hc[0], hc[1] + 50 * s, 14 * s, (3 + 6 * abs(math.sin(t * 8))) * s, (90, 30, 30), INK, 3 * s)
    elif mood == 'happy':
        arc(hc[0], hc[1] + 40 * s, 18 * s, 20, 160, 5 * s)
    else:
        line([(hc[0] - 14 * s, hc[1] + 50 * s), (hc[0] + 14 * s, hc[1] + 50 * s)], 5 * s, amp=0)
    if arm is not None:
        line([sh, el, hand], 26 * s, INK); line([sh, el, hand], 18 * s, body)
    return {'head': hc, 'hand': hand}


def skeleton(x, y, s=1.0, lost_leg=True):
    """Esqueleto tumbado. (x,y) = centro de la pelvis."""
    sk = (x - 330 * s, y)
    circ(sk[0], sk[1], 58 * s, BONE, INK, 5 * s)
    for k in (-1, 1): ell(sk[0] + 8 * s, sk[1] + k * 22 * s, 14 * s, 12 * s, INK, None, 0)
    line([(sk[0] + 55 * s, y), (x - 20 * s, y)], 12 * s, BONE)
    line([(sk[0] + 55 * s, y), (x - 20 * s, y)], 3 * s, INK, amp=0)
    for i in range(6):
        rx = x - 230 * s + i * 30 * s
        arc(rx, y, 60 * s - i * 4 * s, 250, 290 + 0, 8 * s, BONE, ry=60 * s - i * 4 * s)
        line([(rx, y - (58 - i * 4) * s), (rx + 6 * s, y), (rx, y + (58 - i * 4) * s)], 8 * s, BONE, amp=0.5)
    ell(x, y, 38 * s, 46 * s, BONE, INK, 5 * s)
    for k in (-1, 1):
        bone(x - 230 * s, y + k * 64 * s, x - 100 * s, y + k * 90 * s, w=12 * s)
        bone(x - 100 * s, y + k * 90 * s, x + 10 * s, y + k * 105 * s, w=11 * s)
    bone(x + 30 * s, y - 25 * s, x + 200 * s, y - 34 * s, w=16 * s)
    bone(x + 200 * s, y - 34 * s, x + 360 * s, y - 40 * s, w=14 * s)
    bone(x + 30 * s, y + 25 * s, x + 200 * s, y + 34 * s, w=16 * s)
    if not lost_leg:
        bone(x + 200 * s, y + 34 * s, x + 360 * s, y + 40 * s, w=14 * s)
