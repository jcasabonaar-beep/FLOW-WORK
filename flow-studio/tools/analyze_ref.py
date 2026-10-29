# Analiza cómo habla el video de referencia: qué dice, a qué ritmo, dónde sube la energía y el tono
# Uso: python analyze_ref.py <video> <salida.txt> [idioma]
import subprocess
import sys

import numpy as np

video, out = sys.argv[1], sys.argv[2]
lang = sys.argv[3] if len(sys.argv) > 3 else None
SR = 16000

raw = subprocess.run(["ffmpeg", "-v", "error", "-i", video, "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
                     capture_output=True, check=True).stdout
x = np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0


def stats(a):
    # volumen (dB) y tono medio (Hz) de un trozo de audio
    if len(a) < 512:
        return -60.0, 0.0
    rms = float(np.sqrt(np.mean(a ** 2)) + 1e-9)
    n = 1024
    f0s = []
    for i in range(0, len(a) - n, n // 2):
        f = a[i:i + n] * np.hanning(n)
        if np.sqrt(np.mean(f ** 2)) < 0.02:
            continue
        ac = np.correlate(f, f, "full")[n - 1:]
        lo, hi = int(SR / 450), int(SR / 70)
        k = lo + int(np.argmax(ac[lo:hi]))
        if ac[k] > 0.3 * ac[0]:
            f0s.append(SR / k)
    return 20 * np.log10(rms), float(np.median(f0s)) if f0s else 0.0


from faster_whisper import WhisperModel  # noqa: E402

model = WhisperModel("small", device="cpu", compute_type="int8")
segs, info = model.transcribe(video, language=lang, word_timestamps=True, vad_filter=True)
segs = list(segs)

lines = []
all_db, all_f0 = [], []
rows = []
for s in segs:
    a = x[int(s.start * SR):int(s.end * SR)]
    db, f0 = stats(a)
    words = len(s.text.split())
    wps = words / max(0.1, s.end - s.start)
    rows.append((s, db, f0, wps))
    all_db.append(db)
    if f0:
        all_f0.append(f0)

mdb = float(np.median(all_db)) if all_db else -30
mf0 = float(np.median(all_f0)) if all_f0 else 0
total_words = sum(len(s.text.split()) for s in segs)
speech = sum(s.end - s.start for s in segs) or 1
pauses = [round(b.start - a.end, 2) for a, b in zip(segs, segs[1:]) if b.start - a.end > 0.4]

lines.append(f"Idioma detectado: {info.language}. Ritmo medio: {total_words / speech:.1f} palabras/segundo. "
             f"Pausas largas (>0,4 s): {len(pauses)} {pauses[:8]}.")
lines.append("Tramos (segundo inicio-fin | ritmo | energía y tono respecto a la media | texto):")
for s, db, f0, wps in rows:
    tags = []
    if db > mdb + 3:
        tags.append("MÁS FUERTE")
    if db < mdb - 4:
        tags.append("más bajo/susurro")
    if mf0 and f0 > mf0 * 1.12:
        tags.append("tono más agudo (sorpresa/emoción)")
    if mf0 and f0 and f0 < mf0 * 0.9:
        tags.append("tono más grave (serio)")
    if wps > total_words / speech * 1.2:
        tags.append("rápido")
    if wps < total_words / speech * 0.8:
        tags.append("lento/enfático")
    lines.append(f"{s.start:5.1f}-{s.end:5.1f} s | {wps:.1f} p/s | {', '.join(tags) or 'normal'} | {s.text.strip()}")

with open(out, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
