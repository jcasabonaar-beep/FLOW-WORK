"""Short vertical (1080x1920, ~53 s) que termina enlazando con el principio (bucle).
Uso: LANG_VIDEO=es python3 short.py   -> salida/SHORT_ES.mp4"""
import os, sys, subprocess
import numpy as np, soundfile as sf
from multiprocessing import Pool
from PIL import Image, ImageDraw, ImageFont
import corto as C
import banda as B
from sonidos import SR, place

VW, VH = 1080, 1920
CROP = 1100           # ancho (px del plano 1920) que se recorta alrededor de la acción
TOP = 430             # franja superior con el texto gancho
# (escena, desde, hasta, centro x del recorte)
WIN = [('c01_hook', 0.0, 7.2, 1010), ('c02_rewind', 0.0, 1.6, 960), ('c03_desk', 1.0, 4.0, 900),
       ('c04_phone', 1.4, 3.4, 1000), ('c08_mirror', 3.0, 8.0, 1000), ('c09_rock', 5.0, 9.5, 960),
       ('c10_day1', 0.0, 4.2, 960), ('c12_run', 0.3, 4.0, 950), ('c15_fridge', 0.8, 5.0, 1150),
       ('c16_fall', 0.6, 5.8, 1150), ('c17_fight', 6.0, 11.3, 1200), ('c18_summit', 3.8, 11.2, 1010)]
HOOKTXT = {'es': ('SI TE CUESTA EMPEZAR,', 'MIRA ESTO'), 'en': ('IF YOU STRUGGLE TO START,', 'WATCH THIS')}
IDX = {sc['name']: i for i, sc in enumerate(C.SC)}
SSTART = np.concatenate([[0], np.cumsum([b - a for _, a, b, _ in WIN])])


def top_band():
    im = Image.new('RGB', (VW, TOP), (10, 10, 12)); d = ImageDraw.Draw(im)
    l1, l2 = HOOKTXT[C.LANG]
    f1 = ImageFont.truetype(C.E.FONTS['lucky'], 64 if len(l1) < 22 else 56)
    f2 = ImageFont.truetype(C.E.FONTS['lucky'], 120)
    d.text((VW / 2, 190), l1, font=f1, fill=(240, 240, 240), anchor='mm', stroke_width=5, stroke_fill=(0, 0, 0))
    d.text((VW / 2, 300), l2, font=f2, fill=C.RD, anchor='mm', stroke_width=7, stroke_fill=(0, 0, 0))
    return im


_TOP = None


def vframe(k, t):
    global _TOP
    if _TOP is None: _TOP = top_band()
    name, a, b, cx = WIN[k]
    im = C.frame(IDX[name], a + t)
    x0 = int(min(max(0, cx - CROP / 2), C.W - CROP))
    crop = im.crop((x0, 0, x0 + CROP, C.H)).resize((VW, int(C.H * VW / CROP)), Image.LANCZOS)
    out = Image.new('RGB', (VW, VH), (10, 10, 12))
    out.paste(_TOP, (0, 0)); out.paste(crop, (0, TOP))
    return out


def clip(k):
    name, a, b, _ = WIN[k]; n = int(round((b - a) * C.FPS))
    path = os.path.join(C.OUT, f'short_{C.LANG}', f'{k:02d}.mp4')
    p = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{VW}x{VH}',
                          '-r', str(C.FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19',
                          '-pix_fmt', 'yuv420p', path], stdin=subprocess.PIPE)
    for f in range(n): p.stdin.write(vframe(k, f / C.FPS).tobytes())
    p.stdin.close(); p.wait(); return path


def s_at(name, t):
    """Momento del Short que corresponde a t segundos de la escena `name`."""
    k = [w[0] for w in WIN].index(name)
    return SSTART[k] + t - WIN[k][1]


def audio(total):
    # efectos: se recortan del montaje largo, ventana a ventana
    fx_full = B.sfx(C.LANG)
    fx = np.zeros(int((total + 1) * SR))
    for k, (name, a, b, _) in enumerate(WIN):
        s0 = int((B.START[name] + a) * SR); seg = fx_full[s0:s0 + int((b - a) * SR)].copy()
        f = int(0.015 * SR); seg[:f] *= np.linspace(0, 1, f); seg[-f:] *= np.linspace(1, 0, f)
        place(fx, seg, SSTART[k])
    # música continua compuesta para el Short
    mus = np.zeros(int((total + 4) * SR))
    def put(g, a, b, v=1.0, fi=0.3, fo=0.6):
        seg = g(b - a + fo); seg = seg / max(1e-6, np.percentile(np.abs(seg), 99.7)) * v
        n = len(seg); r = np.arange(n)
        seg *= np.minimum(1, np.minimum(r / (fi * SR + 1), (n - r) / (fo * SR + 1))); place(mus, seg, a)
    off = s_at('c10_day1', C.SC[IDX['c10_day1']]['dur'] * 0.62)
    fall = s_at('c16_fall', 1.0); rise = s_at('c16_fall', C.SC[IDX['c16_fall']]['dur'] * 0.62)
    hit = s_at('c17_fight', C.SC[IDX['c17_fight']]['dur'] * 0.74)
    put(B.g_drone, 0, 1.6, 0.5, 0.05, 0.05)
    put(lambda D: B.g_piano(D, B.MAJOR, 72, v=0.9), 1.6, SSTART[1] + 0.2, 0.75, 0.05)
    put(lambda D: B.g_piano(D, B.MINOR, 66, strings_v=0.8), SSTART[2], SSTART[5] - 0.5, 0.45, 0.6, 1.0)
    put(B.g_drone, SSTART[4], SSTART[5] + 0.5, 0.38, 1.0, 1.0)
    put(B.g_sparse, SSTART[5], off, 0.25, 0.8, 0.3)
    put(lambda D: B.g_grind(D, start_v=0.4, full=False), off, SSTART[7], 0.55, 0.05)
    put(lambda D: B.g_grind(D, start_v=0.75), SSTART[7], fall + 0.3, 0.8, 0.05, 0.3)
    put(lambda D: B.g_drone(D, 0.8), fall + 0.3, rise, 0.45, 0.1)
    put(lambda D: B.g_grind(D, start_v=0.9), rise, SSTART[10], 0.85, 0.05)
    put(B.g_epic, SSTART[10], hit, 1.1, 0.1, 0.05)
    put(B.g_triumph, hit + 0.7, total, 0.85, 1.0, 0.3)
    mus = mus[:len(fx)]
    L_ = B.reverb(mus, 0.3, 1) * 0.75 + B.reverb(fx, 0.18, 3) * 0.8
    R_ = B.reverb(mus, 0.3, 2) * 0.75 + B.reverb(fx, 0.18, 4) * 0.8
    mix = np.tanh(np.stack([L_, R_], 1)[:int(total * SR)] * 1.2) / np.tanh(1.2)
    p = os.path.join(C.OUT, f'short_{C.LANG}.wav'); sf.write(p, mix.astype(np.float32), SR, subtype='PCM_16')
    return p


if __name__ == '__main__':
    os.makedirs(os.path.join(C.OUT, f'short_{C.LANG}'), exist_ok=True)
    with Pool(4) as pool: paths = pool.map(clip, range(len(WIN)), chunksize=1)
    lst = os.path.join(C.OUT, f'short_{C.LANG}.txt'); open(lst, 'w').write(''.join(f"file '{p}'\n" for p in paths))
    vid = os.path.join(C.OUT, f'short_{C.LANG}_sin_audio.mp4')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', vid], check=True)
    total = float(SSTART[-1])
    wav = audio(total)
    final = os.path.join(C.OUT, f'SHORT_{C.LANG.upper()}.mp4')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', vid, '-i', wav, '-c:v', 'copy', '-af',
                    'loudnorm=I=-14:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
                    '-movflags', '+faststart', '-shortest', final], check=True)
    print('ok', final, round(total, 1), 's')
