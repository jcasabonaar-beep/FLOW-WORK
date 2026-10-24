"""Short vertical (1080x1920, ~41 s) del corto de videojuegos, en bucle:
termina en 'PULSA START' y vuelve a empezar con el juego arrancando.
Uso: LANG_VIDEO=es python3 short_juego.py   -> salida/SHORT_GAMING_ES.mp4"""
import os, subprocess
import numpy as np, soundfile as sf
from multiprocessing import Pool
from PIL import Image, ImageDraw, ImageFont
import juego as J
import banda_juego as BJ
import banda as B
from sonidos import SR, place

VW, VH = 1080, 1920
CROP = 1100                 # ancho recortado del plano 1920 alrededor de la acción
TOP = 300                   # franja superior con el texto gancho
FH = int(J.H * VW / CROP)   # alto de la escena en el Short
HUDBOX = (1440, 30, 1890, 320)
# (escena, desde, hasta, centro x del recorte, desde cuándo hay panel de vida real o None)
WIN = [('g01_hook', 0.0, 6.8, 960, 3.4), ('g03_gift', 1.8, 5.4, 760, None), ('g04_night', 0.8, 3.4, 960, None),
       ('g05_friends', 0.9, 3.4, 1000, 0), ('g07_sunrise', 1.5, 3.3, 1000, 0), ('g08_pizza', 1.8, 3.8, 1000, 0),
       ('g10_gameover', 0.4, 2.4, 900, 0), ('g10_gameover', 5.6, 10.9, 960, None), ('g12_withdrawal', 4.8, 7.6, 960, None),
       ('g13_run', 2.8, 4.6, 960, 0), ('g15_friends', 2.4, 4.4, 960, 0), ('g16_sleep', 4.4, 6.4, 960, 0),
       ('g19_title', 0.2, 6.2, 960, None)]
HOOKTXT = {'es': ('SI JUEGAS MÁS DE 3H AL DÍA,', 'MIRA ESTO'), 'en': ('IF YOU GAME 3+ HOURS A DAY,', 'WATCH THIS')}
IDX = {sc['name']: i for i, sc in enumerate(J.SC)}
SSTART = np.concatenate([[0], np.cumsum([b - a for _, a, b, _, _ in WIN])])


def top_band():
    im = Image.new('RGB', (VW, TOP), (10, 10, 12)); d = ImageDraw.Draw(im)
    l1, l2 = HOOKTXT[J.LANG]
    f1 = ImageFont.truetype(J.E.FONTS['lucky'], 60 if len(l1) < 26 else 54)
    f2 = ImageFont.truetype(J.E.FONTS['lucky'], 112)
    d.text((VW / 2, 120), l1, font=f1, fill=(240, 240, 240), anchor='mm', stroke_width=5, stroke_fill=(0, 0, 0))
    d.text((VW / 2, 225), l2, font=f2, fill=J.RD, anchor='mm', stroke_width=7, stroke_fill=(0, 0, 0))
    return im


_TOP = None


def vframe(k, t):
    global _TOP
    if _TOP is None: _TOP = top_band()
    name, a, b, cx, hud_from = WIN[k]
    im = J.frame(IDX[name], a + t)
    hud = None
    if hud_from is not None and a + t >= hud_from:
        hud = im.crop(HUDBOX)
        fill = im.getpixel((HUDBOX[0] - 12, HUDBOX[3] + 20))
        ImageDraw.Draw(im).rectangle(HUDBOX, fill=fill)       # que no asome cortado en el borde
    x0 = int(min(max(0, cx - CROP / 2), J.W - CROP))
    scene = im.crop((x0, 0, x0 + CROP, J.H)).resize((VW, FH), Image.LANCZOS)
    out = Image.new('RGB', (VW, VH), (10, 10, 12))
    out.paste(_TOP, (0, 0)); out.paste(scene, (0, TOP))
    if hud is not None:
        hw = int(450 * 1.15); hh = int(290 * 1.15)
        out.paste(hud.resize((hw, hh), Image.LANCZOS), ((VW - hw) // 2, TOP + FH + 14))
    return out


def clip(k):
    _, a, b, _, _ = WIN[k]; n = int(round((b - a) * J.FPS))
    path = os.path.join(J.OUT, f'short_{J.LANG}', f'{k:02d}.mp4')
    p = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{VW}x{VH}',
                          '-r', str(J.FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19',
                          '-pix_fmt', 'yuv420p', path], stdin=subprocess.PIPE)
    for f in range(n): p.stdin.write(vframe(k, f / J.FPS).tobytes())
    p.stdin.close(); p.wait(); return path


def audio(total):
    fx_full = BJ.sfx(J.LANG)
    fx = np.zeros(int((total + 1) * SR))
    for k, (name, a, b, _, _) in enumerate(WIN):
        s0 = int((BJ.START[name] + a) * SR); seg = fx_full[s0:s0 + int((b - a) * SR)].copy()
        f = int(0.015 * SR); seg[:f] *= np.linspace(0, 1, f); seg[-f:] *= np.linspace(1, 0, f)
        place(fx, seg, SSTART[k])
    mus = np.zeros(int((total + 4) * SR))
    def put(g, a, b, v=1.0, fi=0.2, fo=0.5):
        seg = g(b - a + fo); seg = seg / max(1e-6, np.percentile(np.abs(seg), 99.7)) * v
        n = len(seg); r = np.arange(n)
        seg *= np.minimum(1, np.minimum(r / (fi * SR + 1), (n - r) / (fo * SR + 1))); place(mus, seg, a)
    cut = SSTART[7] + (6.0 - 5.6)                       # apagón
    put(lambda D: BJ.chip(D, 165, BJ.CHIP_MAJ, 3), 0, 3.4, 0.9, 0.02, 0.02)
    put(lambda D: B.g_drone(D), 3.4, SSTART[1], 0.45, 0.05, 0.1)
    put(lambda D: BJ.chip(D, 140, BJ.CHIP_MAJ, 1), SSTART[1], SSTART[5], 0.75, 0.05, 0.1)
    put(lambda D: BJ.chip(D, 150, BJ.CHIP_MIN, 4), SSTART[5], cut, 0.8, 0.05, 0.02)
    put(B.g_sparse, cut + 1.0, SSTART[9], 0.3, 0.8, 0.2)
    put(BJ.uplift, SSTART[9], SSTART[12], 0.8, 0.05, 0.3)
    put(lambda D: B.g_piano(D, B.MAJOR, 66, arp=False, v=0.9, strings_v=1.1), SSTART[12], total, 0.5, 0.4, 0.2)
    mus = mus[:len(fx)]
    L_ = B.reverb(mus, 0.18, 1) * 0.7 + B.reverb(fx, 0.12, 3) * 0.85
    R_ = B.reverb(mus, 0.18, 2) * 0.7 + B.reverb(fx, 0.12, 4) * 0.85
    mix = np.tanh(np.stack([L_, R_], 1)[:int(total * SR)] * 1.2) / np.tanh(1.2)
    p = os.path.join(J.OUT, f'short_{J.LANG}.wav'); sf.write(p, mix.astype(np.float32), SR, subtype='PCM_16')
    return p


if __name__ == '__main__':
    os.makedirs(os.path.join(J.OUT, f'short_{J.LANG}'), exist_ok=True)
    with Pool(4) as pool: paths = pool.map(clip, range(len(WIN)), chunksize=1)
    lst = os.path.join(J.OUT, f'short_{J.LANG}.txt'); open(lst, 'w').write(''.join(f"file '{p}'\n" for p in paths))
    vid = os.path.join(J.OUT, f'short_{J.LANG}_sin_audio.mp4')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', vid], check=True)
    total = float(SSTART[-1])
    final = os.path.join(J.OUT, f'SHORT_GAMING_{J.LANG.upper()}.mp4')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', vid, '-i', audio(total), '-c:v', 'copy', '-af',
                    'loudnorm=I=-14:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
                    '-movflags', '+faststart', '-shortest', final], check=True)
    print('ok', final, round(total, 1), 's')
