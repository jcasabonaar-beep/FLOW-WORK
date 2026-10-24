"""Tres miniaturas 1280x720 para 'Probar y comparar' de YouTube. Uso: LANG_VIDEO=es python3 miniatura.py
A: pelea final · B: DÍA 1 vs DÍA 365 · C: la sombra 'nunca vas a cambiar'"""
import os
import corto as C
from corto import *

IDX = {s['name']: i for i, s in enumerate(C.SC)}


def save(im, tag):
    im.resize((1280, 720), Image.LANCZOS).save(os.path.join(C.OUT, f'miniatura_{tag}_{C.LANG}.png'))


def scene_frame(name, frac, extra=None):
    i = IDX[name]; D = C.SC[i]['dur']
    E.begin(D * frac, i + 1, C.BG); C.glow_begin()
    C.SC[i]['f'](D * frac, D)
    with C.ui():
        rect_raw(0, 0, 520, 120, C.BG if name != 'c18_summit' else (40, 22, 40))
        if extra: extra()
    return C.finish()


# A — pequeño contra gigante
def a_extra():
    text(C.L('title'), 960, 930, 190, WHITE, INK, sw=14, font='lucky')
    line([(560, 1030), (1360, 1030)], 14, C.RD)
save(scene_frame('c17_fight', 0.66, a_extra), 'A')

# B — DÍA 1 vs DÍA 365
left = scene_frame('c06_sleep', 0.2).crop((120, 0, 1080, 1080))
right = scene_frame('c18_summit', 0.33).crop((770, 0, 1730, 1080))
E.begin(0, 99, C.BG); C.glow_begin()
im = Image.new('RGB', (1920, 1080)); im.paste(left, (0, 0)); im.paste(right, (960, 0))
E.G.img = im.resize((3840, 2160)); E.G.d = ImageDraw.Draw(E.G.img)
line([(960, -20), (960, 1100)], 16, C.RD); C.glow(960, 540, 120, C.GLOWRED, 0.5)
text(f"{C.L('day')} 1", 480, 150, 160, (210, 210, 215), INK, sw=12)
text(f"{C.L('day')} 365", 1440, 150, 160, YEL, INK, sw=12)
save(C.finish(), 'B')

# C — la sombra gigante susurrando
E.begin(1.0, 98, (8, 7, 9)); C.glow_begin()
cam(1.0, 960, 540)
rect_raw(-500, 860, 2500, 1600, (14, 12, 14))
C.blob(1380, 1330, 3.4, -1, 'tired', t=1.0, demon=True, seed=1)
C.blob(560, 900, 1.15, 1, 'sad', t=1.0, look=(1, -1))
text(C.L('never').upper(), 960, 150, 120, C.RD, INK, sw=10, font='lucky')
C.glow(960, 150, 500, C.GLOWRED, 0.25)
save(C.finish(), 'C')
print('ok')
