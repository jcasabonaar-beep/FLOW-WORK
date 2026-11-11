# Métricas del pipeline Higgsfield (solo numpy + ffmpeg)
#   python hf_metrics.py overlay <start.png> <end.png>          -> diferencia media en fondo y torso (0-255)
#   python hf_metrics.py loop <video.mp4>                        -> métrica de bucle
#   python hf_metrics.py loopfix <video.mp4> <salida.mp4>        -> corta en 1,0 s, mueve 0-1 s al final, fundido 0,2 s en la unión
#   python hf_metrics.py droplast <video.mp4> <salida.mp4>       -> quita el último frame (duplicado del primero en los bucles)
import json
import subprocess
import sys

import numpy as np

W, H = 180, 320


def gray_frames(path, w=W, h=H, fps=None):
    vf = f"scale={w}:{h},format=gray" + (f",fps={fps}" if fps else "")
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", vf, "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    a = np.frombuffer(raw, np.uint8).astype(np.float32)
    return a.reshape(-1, h, w)


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate,nb_frames:format=duration",
                          "-of", "json", path], capture_output=True, check=True).stdout
    j = json.loads(out)
    num, den = j["streams"][0]["r_frame_rate"].split("/")
    return float(j["format"]["duration"]), float(num) / float(den)


def overlay(a, b):
    fa, fb = gray_frames(a)[0], gray_frames(b)[0]
    d = np.abs(fa - fb)
    # Fondo: franja de arriba y bordes laterales; torso: centro del encuadre
    bg = np.concatenate([d[: int(H * 0.15), :].ravel(), d[:, : int(W * 0.12)].ravel(), d[:, -int(W * 0.12):].ravel()])
    torso = d[int(H * 0.40): int(H * 0.70), int(W * 0.30): int(W * 0.70)]
    return {"background_diff": round(float(bg.mean()), 2), "torso_diff": round(float(torso.mean()), 2), "whole_diff": round(float(d.mean()), 2)}


def loop_metric(path):
    f = gray_frames(path)
    dur, fps = probe(path)
    n3 = max(3, min(len(f) - 1, int(round(fps * 3))))
    consec = np.abs(np.diff(f[: n3 + 1], axis=0)).mean(axis=(1, 2))
    med = float(np.median(consec)) if len(consec) else 0.0
    # El último frame suele ser un duplicado del primero: se compara el penúltimo con el primero
    last = f[-2] if len(f) > 2 and np.abs(f[-1] - f[0]).mean() < 0.5 else f[-1]
    lf = float(np.abs(last - f[0]).mean())
    ratio = lf / med if med > 0 else (0.0 if lf < 1 else 99.0)
    return {"last_first": round(lf, 2), "median_consecutive_3s": round(med, 2), "ratio": round(ratio, 2), "frames": int(len(f)), "duration": round(dur, 2), "fps": round(fps, 3),
            "last_is_duplicate": bool(len(f) > 2 and np.abs(f[-1] - f[0]).mean() < 0.5)}


def loopfix(src, out, cut=1.0, fade=0.2):
    dur, _ = probe(src)
    a_len = dur - cut
    fc = (f"[0:v]trim=start={cut},setpts=PTS-STARTPTS[a];[0:v]trim=end={cut},setpts=PTS-STARTPTS[b];"
          f"[a][b]xfade=transition=fade:duration={fade}:offset={max(0.0, a_len - fade):.3f},format=yuv420p[v]")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-filter_complex", fc, "-map", "[v]", "-an", "-c:v", "libx264", "-crf", "16", "-preset", "medium", out], check=True)
    return {"out": out}


def droplast(src, out):
    n = int(subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", src],
                           capture_output=True, check=True).stdout.strip())
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-frames:v", str(max(1, n - 1)), "-an", "-c:v", "libx264", "-crf", "16", "-preset", "medium", out], check=True)
    return {"out": out, "frames": n - 1}


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "overlay":
        r = overlay(sys.argv[2], sys.argv[3])
    elif cmd == "loop":
        r = loop_metric(sys.argv[2])
    elif cmd == "loopfix":
        r = loopfix(sys.argv[2], sys.argv[3])
    elif cmd == "droplast":
        r = droplast(sys.argv[2], sys.argv[3])
    else:
        raise SystemExit("comando desconocido")
    print(json.dumps(r))
