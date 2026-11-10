# Transcribe un audio/video y guarda los tiempos de cada palabra (opcional, mejora los subtítulos)
# Uso: python transcribe.py <video> <salida.json> [idioma]
import json
import sys

from faster_whisper import WhisperModel

lang = sys.argv[3] if len(sys.argv) > 3 else "es"
model = WhisperModel("base.en" if lang == "en" else "small", device="cpu", compute_type="int8")
segments, _ = model.transcribe(sys.argv[1], language=lang, word_timestamps=True, vad_filter=True)
words = [{"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3)}
         for seg in segments for w in (seg.words or [])]
with open(sys.argv[2], "w", encoding="utf-8") as f:
    json.dump(words, f)
