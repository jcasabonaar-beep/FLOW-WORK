"""Banner del canal (2560x1440). Zona segura para todos los dispositivos: 1546x423 en el centro.
Uso: python3 banner.py"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'video-gaming'))
import juego as J
from juego import *
AQUI = os.path.dirname(os.path.abspath(__file__))

# zona segura en coordenadas 1920x1080 (el banner es 16:9, se escala x1.333)
SX0, SX1, SY0, SY1 = 380, 1540, 381, 699


def lienzo(seed):
    E.begin(1.0, seed, (14, 14, 18)); C.glow_begin()


# izquierda: el mundo del juego
lienzo(1)
rect_raw(-500, -500, 2500, 1600, (22, 26, 70))
game_screen(-60, 300, 1100, 520, 1.2, 99)
izq = C.finish()

# derecha: amanecer de la vida real
lienzo(2)
sky_grad((40, 24, 50), (250, 140, 70), -300, 760)
circ(1640, 600, 90, (255, 214, 150), None, 0); glow(1640, 600, 300, (255, 140, 60), 0.7)
C.hill(peak=(1640, 640))
der = C.finish()

# centro: nombre, lema, héroe y sombra
lienzo(3)
rect_raw(-500, -500, 2500, 1600, (14, 14, 18))
glow(960, 540, 520, (60, 60, 90), 0.35)
blob(480, 672, 0.8, 1, 'determined', arms=('down', (140, 165)), t=1.0, band=True)
blob(1440, 672, 0.8, -1, 'tired', t=1.0, demon=True, seed=4)
text('VIDA REAL', 885, 495, 118, WHITE, INK, sw=10, font='lucky')
J.ptext('XP', 1275, 492, 96, GOLD, INK, sw=10)
rect(640, 565, 640, 22, (30, 30, 38), (110, 110, 120), 4, amp=0.3)
rect_raw(648, 571, 648 + 624 * 0.7, 581, GREEN)
text('Cortos animados para subir de nivel en la vida real', 960, 640, 38, (215, 215, 222), None, font='hand')
cen = C.finish()


def mascara(x0, x1, fade=220):
    m = Image.new('L', (W, H), 0); d = ImageDraw.Draw(m)
    for x in range(W):
        if x0 <= x <= x1: v = 255
        elif x0 - fade < x < x0: v = int(255 * (x - (x0 - fade)) / fade)
        elif x1 < x < x1 + fade: v = int(255 * ((x1 + fade) - x) / fade)
        else: v = 0
        d.line([(x, 0), (x, H)], fill=v)
    return m


im = Image.composite(izq, der, mascara(-2000, 900, 300).point(lambda v: v))
im = Image.composite(cen, im, mascara(SX0 + 60, SX1 - 60, 260))
im = im.resize((2560, 1440), Image.LANCZOS)
im.save(os.path.join(AQUI, 'banner.png'))

# vistas previas: escritorio (franja central completa) y móvil (zona segura)
im.crop((0, (1440 - 423) // 2, 2560, (1440 + 423) // 2)).resize((1280, 212)).save(os.path.join(AQUI, 'vista_escritorio.png'))
im.crop(((2560 - 1546) // 2, (1440 - 423) // 2, (2560 + 1546) // 2, (1440 + 423) // 2)).resize((773, 212)).save(os.path.join(AQUI, 'vista_movil.png'))
print('ok')
