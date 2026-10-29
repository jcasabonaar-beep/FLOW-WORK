# Puntúa clips candidatos: ¿dice la frase completa? ¿la voz se parece a la del clip anterior?
# Uso: python score_clip.py <salida.json> <idioma> "<frase>" <referencia.mp4|-> <candidato1.mp4> [candidato2.mp4 ...]
import difflib
import json
import re
import subprocess
import sys

import numpy as np

out, lang, line, ref = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
cands = sys.argv[5:]


def audio(path, sr=16000):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(sr), "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0


def voice(x, sr=16000):
    # Tono medio (F0 por autocorrelación) y brillo (centroide espectral) de los tramos con voz
    n = 1024
    f0s, cents = [], []
    for i in range(0, len(x) - n, n // 2):
        f = x[i:i + n] * np.hanning(n)
        if np.sqrt(np.mean(f ** 2)) < 0.02:
            continue
        spec = np.abs(np.fft.rfft(f))
        freqs = np.fft.rfftfreq(n, 1 / sr)
        cents.append(float((spec * freqs).sum() / (spec.sum() + 1e-9)))
        ac = np.correlate(f, f, "full")[n - 1:]
        lo, hi = int(sr / 400), int(sr / 70)
        k = lo + int(np.argmax(ac[lo:hi]))
        if ac[k] > 0.3 * ac[0]:
            f0s.append(sr / k)
    return (float(np.median(f0s)) if f0s else 0.0, float(np.median(cents)) if cents else 0.0)


def norm(s):
    return re.sub(r"[^\w\s]", "", s.lower()).split()


try:
    from faster_whisper import WhisperModel
    model = WhisperModel("base.en" if lang == "en" else "small", device="cpu", compute_type="int8")
except Exception:
    model = None

ref_v = voice(audio(ref)) if ref != "-" else None
res = []
for c in cands:
    r = {"file": c}
    try:
        x = audio(c)
        r["voice"] = voice(x)
        if model:
            segs, _ = model.transcribe(c, language=lang, vad_filter=True)
            heard = " ".join(s.text for s in segs)
            r["heard"] = heard.strip()
            r["text"] = difflib.SequenceMatcher(None, norm(line), norm(heard)).ratio()
        else:
            r["text"] = None
        if ref_v and ref_v[0] and r["voice"][0]:
            r["voiceDiff"] = abs(r["voice"][0] - ref_v[0]) / ref_v[0] + abs(r["voice"][1] - ref_v[1]) / max(ref_v[1], 1)
        else:
            r["voiceDiff"] = 0.0
        r["score"] = (r["text"] if r["text"] is not None else 0.5) * 2 - r["voiceDiff"]
    except Exception as e:
        r["error"] = str(e)
        r["score"] = -9
    res.append(r)

with open(out, "w", encoding="utf-8") as f:
    json.dump(res, f, ensure_ascii=False)
