#!/usr/bin/env python3
"""Genera los vídeos verticales (1080x1920) del formato «¿QUÉ CAMBIA PARA TI?».

Uso:
  python3 render.py                 # renderiza los 30 vídeos (mudos)
  python3 render.py 1 7 22          # solo esos ids
  python3 render.py --docs          # solo regenera GUIONES.md y voz/*.txt

Audio de ElevenLabs: guarda el MP3 como audio/NN-slug.mp3 (mismo nombre que el
vídeo) o audio/NN.mp3 y vuelve a renderizar. Los tiempos de cada escena se
reparten según las palabras de la locución y se ajustan a la duración real del
audio, que se mezcla en el MP4 final.
"""
import json
import math
import os
import subprocess
import sys
from functools import lru_cache
from multiprocessing import Pool

from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.abspath(__file__))
W, H, FPS = 1080, 1920, 30
WPS = 2.7  # palabras por segundo de una voz de ElevenLabs a velocidad normal

AMARILLO = (255, 214, 10)
NEGRO = (17, 17, 17)
BLANCO = (255, 255, 255)
ROJO = (230, 57, 70)
VERDE = (0, 150, 90)

FUENTE = "/usr/share/fonts/opentype/inter/Inter-Black.otf"
FUENTE_MEDIA = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
CONDENSADO = 0.80  # Inter Black estrechada para imitar una condensada


# ---------- utilidades de dibujo ----------

@lru_cache(maxsize=4096)
def texto_img(texto, size, color, fuente=FUENTE, condensado=CONDENSADO):
    f = ImageFont.truetype(fuente, size)
    x0, y0, x1, y1 = f.getbbox(texto)
    asc, desc = f.getmetrics()
    img = Image.new("RGBA", (x1 - x0 + 4, asc + desc), (0, 0, 0, 0))
    ImageDraw.Draw(img).text((-x0 + 2, 0), texto, font=f, fill=color)
    if condensado != 1:
        img = img.resize((max(1, int(img.width * condensado)), img.height), Image.LANCZOS)
    return img


def ajustar(texto, size, max_w, color, fuente=FUENTE):
    """Reduce el tamaño hasta que el texto quepa en max_w."""
    while size > 20:
        im = texto_img(texto, size, color, fuente)
        if im.width <= max_w:
            return im
        size -= 4
    return texto_img(texto, size, color, fuente)


@lru_cache(maxsize=1024)
def caja(texto, size, fondo, color, max_w=960, pad_x=34, pad_y=14):
    t = ajustar(texto, size, max_w - 2 * pad_x, color)
    img = Image.new("RGBA", (t.width + 2 * pad_x, t.height + 2 * pad_y), fondo + (255,))
    img.alpha_composite(t, (pad_x, pad_y))
    return img


def pegar(lienzo, img, cx, cy, escala=1.0, alpha=1.0):
    if escala <= 0.01 or alpha <= 0.01:
        return
    if escala != 1.0:
        img = img.resize((max(1, int(img.width * escala)), max(1, int(img.height * escala))), Image.BILINEAR)
    if alpha < 1.0:
        img = img.copy()
        a = img.getchannel("A").point(lambda v: int(v * alpha))
        img.putalpha(a)
    lienzo.alpha_composite(img, (int(cx - img.width / 2), int(cy - img.height / 2)))


def ease_out(x):
    x = min(max(x, 0.0), 1.0)
    return 1 - (1 - x) ** 3


def pop(t, inicio, dur=0.28):
    """Escala con rebote: 0 -> 1.08 -> 1."""
    x = (t - inicio) / dur
    if x <= 0:
        return 0.0
    if x >= 1:
        return 1.0
    return 1 + 0.08 * math.sin(x * math.pi) - (1 - ease_out(x)) * 0.6


def fmt_num(n):
    return f"{int(round(n)):,}".replace(",", ".")


# ---------- elementos fijos ----------

@lru_cache(maxsize=8)
def mascota(size=170):
    s = size * 2
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse((8, 8, s - 8, s - 8), fill=BLANCO, outline=NEGRO, width=14)
    euro = texto_img("€", int(s * 0.62), NEGRO, FUENTE, 1.0)
    img.alpha_composite(euro, ((s - euro.width) // 2, int(s * 0.16)))
    for ex in (0.36, 0.64):  # ojos
        cx, cy, r = int(s * ex), int(s * 0.17), int(s * 0.075)
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=BLANCO, outline=NEGRO, width=8)
        d.ellipse((cx - r // 3, cy - r // 3, cx + r // 3 + 6, cy + r // 3 + 6), fill=NEGRO)
    return img.resize((size, size), Image.LANCZOS)


def fondo(video, t, total, mini_hook):
    img = Image.new("RGBA", (W, H), AMARILLO + (255,))
    d = ImageDraw.Draw(img)
    # barra de progreso arriba (retención)
    d.rectangle((0, 0, int(W * min(t / total, 1)), 14), fill=NEGRO)
    # etiqueta
    et = caja(video["etiqueta"], 46, NEGRO, AMARILLO, pad_x=26, pad_y=10)
    pegar(img, et, W / 2, 250)
    # mini hook persistente tras la escena de hook
    if mini_hook:
        mh = ajustar(hook_txt(video), 40, 960, NEGRO)
        pegar(img, mh, W / 2, 340)
    # cuenta + aviso, por encima de la zona que tapan el texto y los botones de TikTok/Reels
    pegar(img, texto_img(DATOS["cuenta"], 44, NEGRO, FUENTE_MEDIA, 1.0), W / 2, 1440)
    pegar(img, texto_img(DATOS["aviso"], 30, (90, 75, 0), FUENTE_MEDIA, 1.0), W / 2, 1495)
    return img


# ---------- escenas ----------

def lineas_caja(img, lineas, t, t0, cy, resalta=None, size=104, animar=True):
    cajas = []
    for i, l in enumerate(lineas):
        if i == resalta:
            cajas.append(caja(l, size, NEGRO, AMARILLO))
        else:
            cajas.append(caja(l, size, BLANCO, NEGRO))
    gap = 22
    alto = sum(c.height for c in cajas) + gap * (len(cajas) - 1)
    y = cy - alto / 2
    for i, c in enumerate(cajas):
        esc = 1.0 if not animar else pop(t, t0 + 0.12 * i)
        pegar(img, c, W / 2, y + c.height / 2, esc)
        y += c.height + gap


def escena_hook(img, e, video, t, t0, dur):
    # visible desde el frame 0: es la miniatura y lo que ve quien no tiene sonido
    lineas_caja(img, video["hook"], t, t0, 900, resalta=len(video["hook"]) - 1, size=118, animar=False)


def escena_texto(img, e, video, t, t0, dur):
    lineas_caja(img, e["lineas"], t, t0, 900, resalta=e.get("resalta"))


def escena_cta(img, e, video, t, t0, dur):
    lineas_caja(img, e["lineas"], t, t0, 860, resalta=len(e["lineas"]) - 1)
    s = pop(t, t0 + 0.5)
    pegar(img, caja("SÍGUEME PARA MÁS", 56, VERDE, BLANCO, pad_x=28, pad_y=12), W / 2, 1180, s)


def escena_cifra(img, e, video, t, t0, dur):
    x = ease_out((t - t0) / 0.9)
    valor = fmt_num(e["valor"] * x) if e["valor"] >= 10 else str(e["valor"])
    txt = e.get("prefijo", "") + valor + e.get("sufijo", "")
    num = ajustar(txt, 300, 980, NEGRO)
    pegar(img, num, W / 2, 820, pop(t, t0, 0.3))
    pegar(img, caja(e["texto"], 64, BLANCO, NEGRO), W / 2, 1060, pop(t, t0 + 0.35))


def escena_barras(img, e, video, t, t0, dur):
    pegar(img, caja(e["titulo"], 60, BLANCO, NEGRO), W / 2, 470, pop(t, t0))
    items = e["items"]
    vmax = max(v for _, v, _ in items)
    n = len(items)
    alto_fila = min(170, 760 / n)
    y0 = 600
    paso = (dur * 0.75) / max(n, 1)  # las barras aparecen al ritmo de la voz
    d = ImageDraw.Draw(img)
    for i, (etq, v, mostrar) in enumerate(items):
        ti = t0 + 0.3 + paso * i
        x = ease_out((t - ti) / 0.6)
        if x <= 0:
            continue
        cy = y0 + alto_fila * i + alto_fila / 2
        lab = ajustar(etq, 52, 360, NEGRO)
        img.alpha_composite(lab, (60, int(cy - lab.height / 2)))
        bx0, bmax = 440, 560
        largo = int(bmax * (v / vmax) * x)
        color = NEGRO if i == e.get("resalta") else BLANCO
        d.rectangle((bx0, cy - 42, bx0 + max(largo, 8), cy + 42), fill=color, outline=NEGRO, width=5)
        if x > 0.6:
            col_txt = AMARILLO if i == e.get("resalta") else NEGRO
            vt = ajustar(mostrar, 52, 520, col_txt)
            if largo > vt.width + 30:
                img.alpha_composite(vt, (bx0 + 18, int(cy - vt.height / 2)))
            else:
                vt = ajustar(mostrar, 52, 520, NEGRO)
                img.alpha_composite(vt, (min(bx0 + largo + 14, W - vt.width - 10), int(cy - vt.height / 2)))


def escena_vs(img, e, video, t, t0, dur):
    for lado, cx, ti in (("izq", W * 0.25, t0), ("der", W * 0.75, t0 + 0.45)):
        s = pop(t, ti)
        if s <= 0:
            continue
        datos = e[lado]
        tarjeta = Image.new("RGBA", (440, 560), BLANCO + (255,))
        dd = ImageDraw.Draw(tarjeta)
        dd.rectangle((0, 0, 439, 559), outline=NEGRO, width=8)
        tt = ajustar(datos["titulo"], 56, 380, NEGRO)
        tarjeta.alpha_composite(tt, ((440 - tt.width) // 2, 70))
        vv = ajustar(datos["valor"], 150, 370, ROJO if lado == "der" else NEGRO)
        tarjeta.alpha_composite(vv, ((440 - vv.width) // 2, 280 - vv.height // 2 + 40))
        pegar(img, tarjeta, cx, 880, s)
    s = pop(t, t0 + 0.25)
    pegar(img, caja("VS", 70, NEGRO, AMARILLO, pad_x=20, pad_y=8), W / 2, 880, s)


def escena_lista(img, e, video, t, t0, dur):
    pegar(img, caja(e["titulo"], 64, NEGRO, AMARILLO), W / 2, 520, pop(t, t0))
    n = len(e["items"])
    paso = (dur * 0.8) / max(n, 1)
    for i, it in enumerate(e["items"]):
        s = pop(t, t0 + 0.25 + paso * i)
        pegar(img, caja(it, 70, BLANCO, NEGRO), W / 2, 700 + i * 170, s)


ESCENAS = {
    "hook": escena_hook, "texto": escena_texto, "cta": escena_cta, "cifra": escena_cifra,
    "barras": escena_barras, "vs": escena_vs, "lista": escena_lista,
}


# ---------- tiempos, audio y render ----------

def hook_txt(video):
    return " ".join(l[:-1] + " ·" if l.endswith(",") else l for l in video["hook"])


def nombre(video):
    return f"{video['id']:02d}-{video['slug']}"


def buscar_audio(video):
    for n in (nombre(video), f"{video['id']:02d}"):
        for ext in (".mp3", ".wav", ".m4a"):
            p = os.path.join(BASE, "audio", n + ext)
            if os.path.exists(p):
                return p
    return None


def duracion_audio(p):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "default=nw=1:nk=1", p], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def tiempos(video, audio=None):
    durs = [max(1.6, len(e["voz"].split()) / WPS + 0.35) for e in video["escenas"]]
    if audio:
        objetivo = duracion_audio(audio) + 0.6
        f = objetivo / sum(durs)
        durs = [d * f for d in durs]
    return durs


def render(video):
    audio = buscar_audio(video)
    durs = tiempos(video, audio)
    total = sum(durs)
    inicios = [sum(durs[:i]) for i in range(len(durs))]
    os.makedirs(os.path.join(BASE, "videos"), exist_ok=True)
    os.makedirs(os.path.join(BASE, "miniaturas"), exist_ok=True)
    salida = os.path.join(BASE, "videos", nombre(video) + ".mp4")
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
           "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-"]
    if audio:
        cmd += ["-i", audio, "-c:a", "aac", "-b:a", "192k"]
    cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p",
            "-movflags", "+faststart", "-t", f"{total:.3f}", salida]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    masc = mascota()
    for f in range(int(total * FPS)):
        t = f / FPS
        i = max(k for k in range(len(inicios)) if inicios[k] <= t)
        e = video["escenas"][i]
        img = fondo(video, t, total, mini_hook=e["tipo"] != "hook")
        ESCENAS[e["tipo"]](img, e, video, t, inicios[i], durs[i])
        bob = math.sin(t * 3.2) * 10
        pegar(img, masc, 150, 1450 + bob)
        if f == 0:
            img.convert("RGB").save(os.path.join(BASE, "miniaturas", nombre(video) + ".png"))
        proc.stdin.write(img.convert("RGB").tobytes())
    proc.stdin.close()
    proc.wait()
    return f"{nombre(video)}: {total:.1f}s{' + audio' if audio else ' (mudo)'}"


# ---------- documentos ----------

def texto_pantalla(e, video):
    if e["tipo"] == "hook":
        return " / ".join(video["hook"])
    if e["tipo"] in ("texto", "cta"):
        return " / ".join(e["lineas"])
    if e["tipo"] == "cifra":
        v = fmt_num(e["valor"]) if e["valor"] >= 10 else str(e["valor"])
        return f"{e.get('prefijo', '')}{v}{e.get('sufijo', '')} — {e['texto']}"
    if e["tipo"] == "barras":
        return e["titulo"] + ": " + ", ".join(f"{a} {c}" for a, _, c in e["items"])
    if e["tipo"] == "vs":
        return f"{e['izq']['titulo']} {e['izq']['valor']} VS {e['der']['titulo']} {e['der']['valor']}"
    if e["tipo"] == "lista":
        return e["titulo"] + ": " + " · ".join(e["items"])
    return ""


def docs():
    os.makedirs(os.path.join(BASE, "voz"), exist_ok=True)
    md = ["# 30 hooks y guiones — formato «¿QUÉ CAMBIA PARA TI?» (finanzas)", "",
          "Generado desde `guiones.json` con `python3 render.py --docs`. "
          "Antes de publicar, revisa la lista de cifras de `README.md`.", "",
          "## Los 30 hooks", "", "| # | Hook (texto en pantalla) | Etiqueta | Formato USA del que viene |",
          "|---|---|---|---|"]
    for v in DATOS["videos"]:
        md.append(f"| {v['id']} | **{hook_txt(v)}** | {v['etiqueta']} | {v['formato_usa']} |")
    md += ["", "## Guiones (≈25–30 s)", ""]
    for v in DATOS["videos"]:
        durs = tiempos(v)
        md += [f"### {v['id']}. {hook_txt(v)}", "",
               f"Vídeo: `videos/{nombre(v)}.mp4` · Locución: `voz/{nombre(v)}.txt` · "
               f"Duración estimada: {sum(durs):.0f} s", "",
               "| Tiempo | En pantalla | Voz (ElevenLabs) |", "|---|---|---|"]
        t = 0
        for e, d in zip(v["escenas"], durs):
            md.append(f"| {t:.0f}–{t + d:.0f} s | {texto_pantalla(e, v)} | {e['voz']} |")
            t += d
        md.append("")
        with open(os.path.join(BASE, "voz", nombre(v) + ".txt"), "w") as fh:
            fh.write("\n\n".join(e["voz"] for e in v["escenas"]) + "\n")
    with open(os.path.join(BASE, "GUIONES.md"), "w") as fh:
        fh.write("\n".join(md))


with open(os.path.join(BASE, "guiones.json")) as fh:
    DATOS = json.load(fh)

if __name__ == "__main__":
    args = sys.argv[1:]
    docs()
    if "--docs" in args:
        sys.exit(0)
    ids = {int(a) for a in args if a.isdigit()}
    videos = [v for v in DATOS["videos"] if not ids or v["id"] in ids]
    with Pool(min(4, os.cpu_count() or 1)) as pool:
        for r in pool.imap_unordered(render, videos):
            print(r, flush=True)
