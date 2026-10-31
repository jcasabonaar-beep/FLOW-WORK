# Palabras con tiempos de varios clips a la vez (para quitar repeticiones en la edición)
# Uso: python words_clips.py <salida.json> <idioma> <modelo> <clip1.mp4> [clip2.mp4 ...]
import json
import sys

from faster_whisper import WhisperModel

out, lang, model_name, files = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:]
model = WhisperModel(model_name or "base", device="cpu", compute_type="int8")
# Una frase de ejemplo con repeticiones hace que whisper escriba literal (si no, se "come" las palabras repetidas)
VERBATIM = {"es": "Eh, el, el yogur yogur griego, congelado congelado, mira mira, esto esto es así.", "en": "Uh, the, the yogurt yogurt, frozen frozen, look look, this this is it."}
res = {}
for f in files:
    segs, _ = model.transcribe(f, language=lang, word_timestamps=True, vad_filter=True, condition_on_previous_text=False, initial_prompt=VERBATIM.get(lang, VERBATIM["en"]))
    res[f] = [{"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3)} for s in segs for w in (s.words or [])]
with open(out, "w", encoding="utf-8") as fh:
    json.dump(res, fh, ensure_ascii=False)
