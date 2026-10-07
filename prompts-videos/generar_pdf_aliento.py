"""Genera el PDF de prompts de Veo 3 para el video aliento-garganta."""
import base64, html, io, os, subprocess, sys
from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
VIDEO = "aliento-garganta"
GEN = os.path.join(BASE, f"{VIDEO}-generados")
HTML_OUT = os.path.join(BASE, f"{VIDEO}-veo.html")
PDF_OUT = os.path.join(BASE, f"{VIDEO}-veo.pdf")
CHROME = sys.argv[1] if len(sys.argv) > 1 else "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"

CAM = ("Vertical 9:16 video, shot on an iPhone, handheld as if filmed by another person standing in front of the "
       "character: subtle, natural hand sway, and the camera slowly and smoothly pushes in a little closer and then "
       "gently pulls back out during the clip; no abrupt moves, no cuts, no fast zooms. Hyperrealistic. Framing "
       "starts exactly as in the start frame.")
CAM1 = ("Vertical 9:16 video, shot on an iPhone, handheld as if filmed by another person standing in front of the "
        "character, with subtle, natural hand sway. Framing starts exactly as in the start frame. IMPORTANT: during "
        "the clip the camera steadily and smoothly pushes in a LOT toward the other person's wide-open mouth in the "
        "foreground, ending in an extreme close-up where the open mouth and the bubbles fill most of the frame. The "
        "push-in is continuous and smooth, with no cuts and no sudden jumps. Hyperrealistic.")
PERF = ("The character's performance is deliberately exaggerated and highly expressive, like a high-energy viral "
        "content creator: big eyebrow raises, wide eyes, big beaming smiles, animated head movements and emphatic, "
        "expressive hand gestures, while still looking like a real human with no cartoonish distortion.")
LIP = ("Lip sync is precise and natural. The character performs the action and speaks simultaneously, starting to "
       "speak right at the beginning of the clip.")
LOOK = "The character looks directly into the camera while in frame."
AMB = "the lakeside dock (soft lapping water, a light breeze)"
NOTEXT = "No on-screen text, no subtitles, no captions, no logos, no watermarks, no graphic overlays of any kind."
END = "El start frame proporcionado define la apariencia del personaje, su ropa y el ambiente. Continúa desde ahí."


def dlg(tone, text):
    return ("Dialogue (spoken in Spanish with a neutral Latin American accent, exaggerated, extremely enthusiastic, "
            f"{tone} tone, lively pace): \"{text}\"")


def audio(extra=""):
    return ("Audio: no background music, no sound effects, only natural ambient sound of "
            f"{AMB} and the character's voice{extra}.")


# (clip, frame, segundos, frase, nota, accion, tono, audio_extra)
CLIPS = [
    ("1", 1, 8,
     "El olor que viene del fondo de tu garganta no es mal aliento. Es algo que se está pudriendo dentro de ti.",
     "Otra persona en primer plano con la boca abierta (no es el avatar). La cámara se acerca mucho a la boca y "
     "salen burbujas; al final la voz sigue fuera de cuadro.",
     "Continuous background action, placed first: from the very first frame to the very last frame, without ever "
     "stopping, the other person in the foreground keeps the head tilted back and the mouth stretched wide open, "
     "never closing it; never pauses, never freezes. From the very first second, small foamy bubbles keep rising up "
     "from the back of that open throat, bubbling out continuously, popping and spilling over the yellowed teeth and "
     "the lips, more and more bubbles as the clip goes on, about two or three new bubbles per second, never stopping. "
     "The character, leaning over that person, keeps the small flashlight pointed into the open mouth, its beam "
     "lighting up the bubbles, and holds the glass of lemon water. During the first seconds, while the character is "
     "still in frame, on 'olor' the character wrinkles the nose in exaggerated disgust and on 'garganta' moves the "
     "flashlight beam deeper into the open mouth. Then the camera pushes in toward the open mouth: as it gets closer, "
     "the character's face leaves the top of the frame, and the character's voice keeps being heard naturally from "
     "just above the frame, with exaggerated, disgusted emphasis on 'pudriendo'. The clip ends on an extreme close-up "
     "of the open mouth full of bubbles.",
     "dramatic, alarming", "; the wet, gurgling sound of the bubbles coming out of the throat and popping"),
    ("2", 2, 8,
     "La mayoría de las personas lo tienen durante años sin saberlo y siguen usando un enjuague bucal que no hace nada.",
     "",
     "The character, seated on the dock, holds the blue mouthwash bottle. On 'La mayoría' raises both eyebrows high; "
     "on 'sin saberlo' tilts the head with a knowing look; on 'enjuague bucal' lifts the blue bottle toward the camera "
     "and gives it a little shake; on 'no hace nada' glances at the bottle with an exaggerated eye roll and a "
     "dismissive head shake. Ends with a skeptical shrug and pursed lips.",
     "conspiratorial, skeptical", "; the slosh of liquid inside the bottle"),
    ("3", 3, 4, "Llena un vaso con agua tibia.", "",
     "The character pours water from the glass pitcher into the tall glass on the table, filling it about "
     "three-quarters. On 'agua tibia' raises the eyebrows with a big beaming smile. Ends setting the pitcher down "
     "and nodding at the camera.",
     "cheerful, instructional", "; the sound of water pouring into the glass"),
    ("4", 4, 4, "Agrega una cucharadita de bicarbonato de sodio,", "",
     "On 'cucharadita' the character shows the heaped teaspoon of white baking soda to the camera; on 'bicarbonato de "
     "sodio' tips it into the glass held in the other hand, and the water turns slightly cloudy. Ends with a "
     "wide-eyed, excited smile.",
     "cheerful, instructional", "; the light clink of the spoon against the glass"),
    ("5", 5, 4, "una pizca de sal", "",
     "The character drops a small pinch of salt into the glass, rubbing the fingers together; on 'sal' looks up from "
     "the glass to the camera with a playful wink. Ends with a big smile.",
     "playful, instructional", ""),
    ("6", 6, 4, "y un chorrito de jugo de limón.", "",
     "The character squeezes the lemon half over the glass, a stream of juice falling in; on 'limón' squeezes harder "
     "with an exaggerated face. Ends with an open palm toward the glass, a satisfied 'ta-da' gesture and a big smile.",
     "cheerful, instructional", "; the soft squeeze of the lemon and juice dripping"),
    ("7", 7, 8,
     "No necesitas un enjuague bucal de cincuenta dólares ni una visita al dentista de trescientos dólares para "
     "solucionar esto.",
     "Cifras pasadas a letras.",
     "The character holds the full glass of cloudy lemon water toward the camera. On 'No necesitas' wags the index "
     "finger of the free hand; on 'cincuenta dólares' raises the eyebrows in mock disbelief; on 'trescientos "
     "dólares' shakes the head with an exaggerated laugh; on 'solucionar esto' pushes the glass a little closer to "
     "the camera with a proud, beaming smile. Ends with a confident nod.",
     "confident, slightly mocking", ""),
    ("8", 8, 6, "Haz gárgaras profundas y lentas cada noche antes de dormir.", "",
     "The character holds the glass very close to the lens. On 'gárgaras' tilts the head back slightly, miming a "
     "gargle; on 'profundas y lentas' gives a slow, emphatic nod; on 'antes de dormir' rests the cheek on the free "
     "hand in a sleeping gesture. Ends with a big smile and a wink.",
     "warm, instructional", ""),
    ("9", 9, 4, "(sin diálogo: escupe la mezcla)", "Sin diálogo. Clip entero, no recortar.",
     "No dialogue in this clip. The character, bent over the table, spits a long, thin, continuous stream of milky "
     "white liquid into the glass bowl until the mouth is empty, then lifts the head slightly, wipes the lips with the "
     "back of the hand and lets out a short, exaggerated, relieved 'ahh'. The character is NOT looking at the camera "
     "while spitting.",
     None, "; the splash of liquid falling into the glass bowl and a short relieved 'ahh'"),
    ("10A", 10, 4, "Son años de cálculo saliendo por fin.", "",
     "On 'años' the character widens the eyes dramatically; on 'por fin' raises both hands in relief with a big smile. "
     "Ends with a firm nod.",
     "revealing, triumphant", ""),
    ("10B", 10, 8,
     "Tres días después, las personas más cercanas a ti notarán que algo es diferente antes de que digas una sola "
     "palabra.",
     "",
     "On 'Tres días' the character holds up three fingers; on 'más cercanas a ti' gestures outward with an open palm; "
     "on 'algo es diferente' leans toward the camera with raised eyebrows; on 'una sola palabra' presses an index "
     "finger to the lips. Ends with a knowing smile.",
     "intriguing, excited", ""),
    ("10C", 10, 8,
     "Comenta \"LIBRO\". Te enviaré mi protocolo gratuito para la garganta y el aliento, además de otros ciento "
     "cuarenta y nueve remedios.",
     "Palabra para comentar en mayúsculas; cifra en letras.",
     "On 'Comenta' the character points down toward the bottom of the screen; on 'LIBRO' mimes opening a book with "
     "both hands; on 'gratuito' flashes a big beaming smile; on 'ciento cuarenta y nueve remedios' spreads the arms "
     "wide. Ends with a thumbs-up.",
     "generous, excited", ""),
    ("10D", 10, 4, "Sígueme primero, o no puedo enviártelo.", "",
     "On 'Sígueme' the character points at the camera; on 'no puedo enviártelo' shakes the head playfully with a "
     "pout. Ends with a wink and a big smile.",
     "playful, urgent", ""),
]

CORRECCIONES = [
    "«mala liento» → «mal aliento».",
    "«en Juague Bucal» → «un enjuague bucal».",
    "«enjuago ebucal» → «enjuague bucal».",
    "Cifras en letras: 50 → «cincuenta», 300 → «trescientos», 149 → «ciento cuarenta y nueve».",
    "«Comenta libro» → Comenta \"LIBRO\" (mayúsculas y comillas).",
    "«Además de otros 149 remedios» era una frase suelta → unida a la anterior con coma.",
    "«enviárselo» → «enviártelo» (se tutea en todo el video).",
    "Frames 4-5-6 forman una sola frase: «Agrega…, una pizca de sal y un chorrito de jugo de limón.»",
    "Frame 10 lleva 4 frases → dividido en 10A, 10B, 10C y 10D (misma foto).",
]


def prompt(c):
    _, _, _, frase, _, accion, tono, extra = c
    partes = [CAM1 if c[0] == "1" else CAM]
    if tono:
        partes += [PERF, accion, LOOK, LIP, dlg(tono, frase)]
    else:
        partes += [("The character's relieved expression at the end is exaggerated and highly expressive, while still "
                    "looking like a real human with no cartoonish distortion."), accion]
    partes += [audio(extra), NOTEXT, END]
    return "\n\n".join(partes)


def thumb(n):
    im = Image.open(os.path.join(GEN, f"frame-{n:02d}.png")).convert("RGB")
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=82)
    return base64.b64encode(buf.getvalue()).decode()


e = html.escape
filas = "".join(f"<tr><td><b>{c[0]}</b></td><td>{c[1]}</td><td>{c[2]} s</td><td><i>{e(c[3])}</i></td></tr>" for c in CLIPS)
total = sum(c[2] for c in CLIPS)
tarjetas = ""
for c in CLIPS:
    nota = f'<div class="nota">⚠️ {e(c[4])}</div>' if c[4] else ""
    tarjetas += f"""
<div class="card">
  <div class="head"><span class="clip">Clip {c[0]}</span> · sube el <b>Frame {c[1]}</b> · <span class="dur">{c[2]} s</span></div>
  <div class="row">
    <img src="data:image/jpeg;base64,{thumb(c[1])}">
    <div><div class="frase"><i>«{e(c[3])}»</i></div>{nota}</div>
  </div>
  <pre>{e(prompt(c))}</pre>
</div>"""

doc = f"""<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Aliento garganta · Veo 3</title>
<style>
@page {{ size: A4; margin: 14mm; }}
body {{ font-family: Arial, Helvetica, sans-serif; color:#1b1b1b; font-size:11pt; }}
h1 {{ margin:0 0 4px; font-size:22pt; }} .sub {{ color:#666; margin-bottom:14px; }}
table {{ border-collapse:collapse; width:100%; font-size:9.5pt; margin-bottom:14px; }}
th,td {{ border:1px solid #ccc; padding:4px 6px; text-align:left; vertical-align:top; }} th {{ background:#f0f0f0; }}
.aviso {{ background:#fff4d6; border:1px solid #e6c56a; padding:8px 10px; border-radius:6px; font-size:10pt; margin-bottom:12px; }}
ul {{ font-size:10pt; margin-top:4px; }}
.portada {{ page-break-after: always; }}
.card {{ break-inside: avoid; page-break-inside: avoid; border:1px solid #ccc; border-radius:8px; padding:10px 12px; margin-bottom:12px; }}
.head {{ font-size:13pt; margin-bottom:8px; }} .clip {{ font-weight:bold; }}
.dur {{ background:#1b1b1b; color:#fff; padding:2px 10px; border-radius:12px; font-weight:bold; font-size:14pt; }}
.row {{ display:flex; gap:12px; align-items:flex-start; margin-bottom:8px; }}
.row img {{ width:90px; border-radius:6px; border:1px solid #ccc; }}
.frase {{ font-size:12pt; }} .nota {{ margin-top:6px; color:#9a5b00; font-size:10pt; }}
pre {{ white-space:pre-wrap; font-family: Consolas, 'Courier New', monospace; font-size:8.6pt; background:#f6f6f6; border:1px solid #e2e2e2; padding:8px; border-radius:6px; margin:0; }}
</style></head><body>
<div class="portada">
<h1>Aliento y garganta · prompts Veo 3</h1>
<div class="sub">{len(CLIPS)} clips · {total} s en bruto (antes de quitar silencios y acelerar a x1.1)</div>
<div class="aviso">📌 En Veo sube siempre la <b>imagen original en alta calidad</b> de Nano Banana; las miniaturas de este PDF son solo para identificarlas.<br>
⏱️ Si tu plataforma solo ofrece 8 s, genera a 8 s: el montaje recorta los silencios.<br>
🎬 Frame 10 se usa en 4 clips (10A–10D): descárgalos <b>en orden</b> (10A primero, 10D el último).</div>
<table><tr><th>Clip</th><th>Frame</th><th>Segundos</th><th>Frase</th></tr>{filas}</table>
<b>Correcciones hechas al guion</b><ul>{''.join(f'<li>{e(x)}</li>' for x in CORRECCIONES)}</ul>
</div>
{tarjetas}
</body></html>"""

with open(HTML_OUT, "w", encoding="utf-8") as f:
    f.write(doc)
subprocess.run([CHROME, "--headless", "--disable-gpu", "--no-sandbox", "--no-pdf-header-footer",
                f"--print-to-pdf={PDF_OUT}", "file://" + HTML_OUT], check=True, capture_output=True)
print(PDF_OUT, os.path.getsize(PDF_OUT))
