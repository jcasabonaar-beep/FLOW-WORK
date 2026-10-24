"""Miniatura 1280x720 a partir de la pelea final. Uso: LANG_VIDEO=es python3 miniatura.py"""
import os
import corto as C
from corto import *

i = [s['name'] for s in C.SC].index('c17_fight')
D = C.SC[i]['dur']
E.begin(D * 0.66, i + 1, C.BG); C.glow_begin()
C.SC[i]['f'](D * 0.66, D)
with C.ui():
    rect_raw(0, 0, 520, 120, C.BG)
    text(C.L('title'), 960, 930, 190, WHITE, INK, sw=14, font='lucky')
    line([(560, 1030), (1360, 1030)], 14, C.RD)
im = C.finish().resize((1280, 720), Image.LANCZOS)
im.save(os.path.join(C.OUT, f'miniatura_{C.LANG}.png'))
print('ok')
