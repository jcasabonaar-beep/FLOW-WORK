"""Tres miniaturas 1280x720 para 'Probar y comparar'. Uso: LANG_VIDEO=es python3 miniatura.py"""
import os
import juego as J
from juego import *


def save(im, tag):
    im.resize((1280, 720), Image.LANCZOS).save(os.path.join(J.OUT, f'miniatura_{tag}_{J.LANG}.png'))


def start(seed):
    E.begin(2.0, seed, BG); C.glow_begin()


LV = {'es': ('NIVEL', 'VIDA'), 'en': ('LEVEL', 'LIFE')}[J.LANG]

# A — juego nivel 99 | vida nivel 1
start(1)
cam(1.5, 640, 560)
J.room(); J.gdesk(1250, 780); J.monitor(1300, 520, t=1, level=99); J.gchair(820, 780)
J.gamer(880, 780, 1.0, 'tired', tired=1.0)
cam(1, 960, 540)
game_screen(0, 0, 960, 1080, 1.3, 99)
rect_raw(950, -10, 970, 1100, RD)
J.ptext('LV 99', 480, 230, 120, GOLD, INK)
J.ptext('LV 1', 1440, 230, 120, RD, INK)
save(C.finish(), 'A')

# B — primer plano con ojeras y GAME OVER
start(2)
cam(2.1, 1000, 560)
J.room(); J.gdesk(1250, 780); J.monitor(1300, 520, t=1, level=99, boss=True); J.gchair(820, 780)
J.gamer(880, 780, 1.0, 'tired', tired=1.0)
cam(1, 960, 540)
J.ptext('GAME OVER', 960, 150, 130, RD, INK, sw=14)
save(C.finish(), 'B')

# C — la barra de vida real vacía
start(3)
cam(1.45, 1060, 620)
J.room(); J.gdesk(1250, 780); J.monitor(1300, 520, t=1, level=99); J.gchair(820, 780)
J.gamer(880, 780, 1.0, 'tired', tired=1.0)
cam(1, 960, 540)
with ui():
    rect(120, 60, 1680, 230, (16, 16, 22), (230, 70, 70), 6, amp=0.6)
    J.ptext(f"{J.L('real')}", 960, 120, 56, WHITE, None)
    rect_raw(200, 190, 1720, 250, (40, 40, 50)); rect_raw(200, 190, 290, 250, (230, 70, 70))
    J.ptext('5%', 1640, 220, 40, RD, None)
save(C.finish(), 'C')
print('ok')
