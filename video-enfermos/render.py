"""Uso:
  python3 render.py preview        -> previews/hoja.png (un fotograma por escena)
  python3 render.py full           -> salida/video_sin_audio.mp4 + salida/clips/*.mp4 + GUION.md
"""
import sys, os, subprocess, time
from multiprocessing import Pool
from PIL import Image
import engine
from scenes import SC, dur

FPS = 24
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'salida')


def frame(i, t):
    sc = SC[i]
    engine.begin(t, i + 1)
    sc['f'](t, dur(sc))
    return engine.end()


def render_clip(i):
    sc = SC[i]; D = dur(sc); n = int(round(D * FPS))
    path = os.path.join(OUT, 'clips', f'{i + 1:02d}_{sc["name"]}.mp4')
    p = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
                          '-s', f'{engine.W}x{engine.H}', '-r', str(FPS), '-i', '-', '-c:v', 'libx264',
                          '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', path], stdin=subprocess.PIPE)
    for f in range(n):
        p.stdin.write(frame(i, f / FPS).tobytes())
    p.stdin.close(); p.wait()
    return path


def tc(s):
    return f'{int(s // 60):02d}:{s % 60:05.2f}'


def guion():
    lines = ['# Guion de narración — «¿Qué hacían los humanos antiguos cuando se enfermaban?»', '',
             'Graba cada bloque dentro de su tiempo. Si hablas más rápido o más lento, estira o recorta el clip de esa escena en tu editor (están separados en `salida/clips/`).', '',
             '| # | Tiempo | Narración |', '|---|---|---|']
    acc = 0.0
    for i, sc in enumerate(SC):
        D = round(dur(sc) * FPS) / FPS
        lines.append(f'| {i + 1} | {tc(acc)} – {tc(acc + D)} | {sc["text"]} |')
        acc += D
    lines += ['', f'**Duración total:** {tc(acc)}', '', '---', '', '## Texto corrido (para leer de corrido)', '']
    lines += [' '.join(sc['text'] for sc in SC[a:b]) + '\n' for a, b in
              ((0, 6), (6, 13), (13, 23), (23, 26), (26, 27), (27, 36), (36, 48), (48, 52), (52, 55))]
    open(os.path.join(HERE, 'GUION.md'), 'w').write('\n'.join(lines))
    return acc


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'preview'
    if mode == 'preview':
        frac = float(sys.argv[2]) if len(sys.argv) > 2 else 0.8
        only = [int(a) - 1 for a in sys.argv[3:]] or range(len(SC))
        os.makedirs(os.path.join(HERE, 'previews'), exist_ok=True)
        thumbs = []
        for i in only:
            t0 = time.time()
            im = frame(i, dur(SC[i]) * frac)
            thumbs.append(im.resize((480, 270)))
            print(i + 1, SC[i]['name'], f'{time.time() - t0:.2f}s', flush=True)
        cols = 5; rows = (len(thumbs) + cols - 1) // cols
        sheet = Image.new('RGB', (cols * 480, rows * 270), 'white')
        for k, im in enumerate(thumbs):
            sheet.paste(im, ((k % cols) * 480, (k // cols) * 270))
        sheet.save(os.path.join(HERE, 'previews', 'hoja.png'))
    else:
        os.makedirs(os.path.join(OUT, 'clips'), exist_ok=True)
        total = guion()
        print('duracion', total)
        with Pool(4) as pool:
            paths = pool.map(render_clip, range(len(SC)), chunksize=1)
        lst = os.path.join(OUT, 'lista.txt')
        open(lst, 'w').write(''.join(f"file '{p}'\n" for p in paths))
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy',
                        os.path.join(OUT, 'video_sin_audio.mp4')], check=True)
        print('ok')
