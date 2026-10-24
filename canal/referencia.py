"""Hoja de referencia del personaje (para adjuntar en Nano Banana). Uso: python3 referencia.py"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'video-gaming'))
import juego as J
from juego import *
AQUI = os.path.dirname(os.path.abspath(__file__))

E.begin(1.0, 7, (24, 24, 28)); C.glow_begin()
rect_raw(-500, 860, 2500, 1600, (30, 30, 36))
poses = [(330, 'neutral', False, ('down', 'down')), (760, 'determined', True, ('down', (140, 165))),
         (1190, 'sad', False, ('down', 'down')), (1620, 'shock', False, (('up', 'up')))]
for x, mood, band, arms in poses:
    glow(x, 600, 240, (255, 220, 170), 0.18)
    blob(x, 860, 1.55, 1, mood, arms=arms, t=1.0, band=band)
text('REFERENCIA DEL PERSONAJE · VIDA REAL XP', 960, 90, 44, (210, 210, 215), None, font='mono')
im = C.finish()
im.save(os.path.join(AQUI, 'personaje_referencia.png'))
print('ok')
