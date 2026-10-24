"""Foto de perfil del canal (800x800). Uso: python3 avatar.py"""
import os, sys
BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BASE, '..', 'video-gaming'))
import juego as J
from juego import *
from PIL import ImageDraw
AQUI = os.path.dirname(os.path.abspath(__file__))

E.begin(1.0, 1, (14, 14, 18)); C.glow_begin()
# fondo: brillo azul (juego) a un lado y rojo (sombra) al otro
glow(760, 420, 380, BLUEG, 0.55)
glow(1180, 640, 360, GLOWRED, 0.35)
glow(960, 540, 300, (255, 220, 160), 0.15)
# cara del personaje, decidida, con la cinta roja
head(960, 470, 5.0, 1, 'determined', 1.0, band=True)
# barra de XP y etiqueta pixelada
rect(700, 780, 520, 46, (24, 24, 30), (120, 120, 130), 6, amp=0.4)
rect_raw(712, 792, 712 + 496 * 0.72, 814, GREEN)
J.ptext('XP', 960, 905, 130, GOLD, INK, sw=14)
im = C.finish().crop((420, 0, 1500, 1080)).resize((800, 800), Image.LANCZOS)
out = os.path.join(AQUI, 'foto_perfil.png'); im.save(out)

# vista previa recortada en círculo, como la verá la gente
m = Image.new('L', (800, 800), 0); ImageDraw.Draw(m).ellipse([0, 0, 800, 800], fill=255)
pv = Image.new('RGB', (800, 800), (15, 15, 15)); pv.paste(im, (0, 0), m)
pv.resize((300, 300), Image.LANCZOS).save(os.path.join(AQUI, 'vista_circulo.png'))
print('ok', out)
