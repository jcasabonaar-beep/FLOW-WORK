# Transcribe un audio/video y guarda los tiempos de cada palabra (opcional, mejora los subtítulos)
# Uso: python transcribe.py <video> <salida.json>
import json
import sys

from faster_whisper import WhisperModel

model = WhisperModel("base.en", device="cpu", compute_type="int8")
segments, _ = model.transcribe(sys.argv[1], language="en", word_timestamps=True, vad_filter=True)
words = [{"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3)}
         for seg in segments for w in (seg.words or [])]
with open(sys.argv[2], "w", encoding="utf-8") as f:
    json.dump(words, f)
