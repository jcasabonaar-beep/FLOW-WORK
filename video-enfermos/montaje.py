"""Montaje final: voz (Kokoro) + música + efectos + subtítulos animados -> salida/VIDEO_FINAL.mp4
Uso: python3 montaje.py [voz]   (requiere salida/video_sin_audio.mp4 de render.py)"""
import os, re, sys, subprocess
import numpy as np, soundfile as sf
from scipy.signal import resample_poly
from scenes import SC, dur
from render import FPS, OUT, HERE
import sonidos as S
from sonidos import SR, place

VOZ = sys.argv[1] if len(sys.argv) > 1 else 'em_alex'
MD = os.environ.get('KOKORO_DIR', '/home/user/tts')
VDIR = os.path.join(OUT, 'voz')
DUR = [round(dur(sc) * FPS) / FPS for sc in SC]
START = np.concatenate([[0], np.cumsum(DUR)])
TOTAL = START[-1]
IDX = {sc['name']: i for i, sc in enumerate(SC)}
LEAD = 0.15  # la voz entra 0.15 s después del corte


# ---------- voz ----------
def voces():
    os.makedirs(VDIR, exist_ok=True)
    k = None; out = []
    for i, sc in enumerate(SC):
        p = os.path.join(VDIR, f'{i + 1:02d}.wav')
        if not os.path.exists(p):
            if k is None:
                from kokoro_onnx import Kokoro
                k = Kokoro(f'{MD}/kokoro-v1.0.onnx', f'{MD}/voices-v1.0.bin')
            vel = 0.92
            while True:
                a, sr = k.create(sc['text'].replace('...', ','), voice=VOZ, speed=vel, lang='es')
                if len(a) / sr <= DUR[i] - 0.35 or vel >= 1.4: break
                vel = round(vel + 0.06, 2)
            sf.write(p, a, sr)
        a, sr = sf.read(p, dtype='float32')
        out.append(resample_poly(a, SR, sr).astype(np.float32))
    return out


# ---------- efectos por escena (tiempos relativos a la escena, en s) ----------
def eventos(D):
    E = {
        's01_fiebre': [(0, 'cough'), (1.6, 'cough'), (3.2, 'cough')],
        's02_hospital': [(0.6, 'pop')] + [(0.6 + k * 0.12, 'tick') for k in range(int(D * 0.5 / 0.12))] + [(D * .75, 'boing')],
        's03_nohay': [(0.2, 'pop'), (0.7, 'wrong'), (D * .3, 'pop'), (D * .3 + .5, 'wrong'), (D * .58, 'pop'),
                      (D * .58 + .5, 'wrong'), (D - 1.0, 'crickets')],
        's04_cuchillo': [(D * .25, 'steps1.4'), (D * .25 + 1.6, 'sting')],
        's05_sobrevivio': [(0.3, 'crack'), (D * .45, 'boom'), (D * .45, 'ding')],
        's06_como': [(0.15, 'boom'), (D * .55, 'pop')],
        's07_auto': [(0.5, 'pop')],
        's08_chimp': [(0, 'chew'), (D * .45, 'boing'), (D * .7, 'pop')],
        's09_orangutan': [(0.4, 'pop'), (1.0, 'chew')],
        's10_pomada': [(0.5, 'squish'), (D * .45, 'pop')],
        's11_dias': [(0.2, 'pop'), (0.2 + D * .25, 'pop'), (0.2 + D * .5, 'pop'), (0.3 + D * .5, 'sparkle')],
        's12_fabrica': [(0.5, 'scribble'), (D * .65, 'boom')],
        's13_interesante': [(0, 'riser')],
        's14_farmacia': [(D * .5, 'ding')],
        's15_sidron': [(D * .4, 'pop')],
        's16_absceso': [(0.3, 'pop'), (D * .35, 'pop'), (D * .35 + .2, 'squish'), (D * .72, 'boom')],
        's17_sarro': [(D * .4, 'pop'), (D * .65, 'pop'), (D * .8, 'ding')],
        's18_moho': [(0.3, 'squish'), (0.6, 'pop'), (D * .5, 'pop')],
        's19_wink': [(D * .5, 'ding'), (D * .5, 'pop')],
        's20_timeline': [(0.3, 'whoosh'), (D * .35, 'pop')],
        's21_otzi': [(0.4, 'pop'), (D * .55, 'pop')],
        's22_hongo': [(D * .5, 'pop'), (D * .65, 'scurry'), (D * .7, 'pop')],
        's23_botiquin': [(D * .45, 'pop'), (D * .5, 'sparkle')],
        's24_baya': [(0, 'chew'), (D * .5, 'boing'), (D * .55, 'pop')],
        's25_prueba': [(0.2, 'pop'), (D * .35 + .5, 'thud'), (D * .35 + .7, 'scribble')],
        's26_hambre': [(k * 1.5, 'growl') for k in range(int(D / 1.5) + 1)] + [(D * .35, 'pop'), (D * .65, 'pop')],
        's27_cta': [(D * .35, 'click'), (D * .37, 'ding'), (D * .5, 'scribble')],
        's28_shanidar': [(D * .45, 'pop')],
        's29_herido': [(0.3 + k * D * .26, 'pop') for k in range(3)],
        's30_semana': [(0.4 + d * (D * .7 / 7), 'tick') for d in range(7)] + [(D * .8, 'heartbeat')],
        's31_anios': [(0.3, 'pop')] + [(0.4 + k * 0.2, 'tick') for k in range(int(D * .6 / 0.2))],
        's32_alguien': [(0.2, 'steps0.8'), (0.3, 'pop'), (D * .33, 'steps0.8'), (D * .36, 'pop'), (D * .68, 'pop'),
                        (D * .66, 'steps2.5')],
        's33_mead': [(0.3, 'pop'), (D * .5, 'pop'), (D * .6, 'wrong'), (D * .72, 'pop'), (D * .82, 'wrong')],
        's34_hueso': [(0.3, 'crack'), (D * .4, 'sparkle'), (D * .65, 'ding')],
        's35_fogata': [(D * .6, 'heartbeat')],
        's36_fuego': [(0, 'rub'), (D * .3, 'whoosh'), (D * .35, 'pop'), (D * .8, 'scratch')],
        's37_volver': [(0, 'sting'), (0.3, 'pop')],
        's38_borneo': [(D * .55, 'pop')],
        's39_esqueleto': [(D * .35, 'sting')],
        's40_corte': [(0.2, 'pop'), (0.8, 'wrong'), (D * .18, 'pop'), (D * .18 + .6, 'wrong'), (D * .4, 'whoosh'),
                      (D * .5, 'pop'), (D * .78, 'boom')],
        's41_increible': [(0, 'scratch'), (0.2, 'sting')],
        's42_vivio': [(0, 'steps8'), (D * .25, 'pop'), (D * .3, 'sparkle')],
        's43_lista': sum([[(D * (.12 + k * .28), 'pop'), (D * (.12 + k * .28) + .6, 'ding')] for k in range(3)], []),
        's44_plantas': [(0.3, 'squish'), (D * .4, 'pop')],
        's45_linea': [(D * .5 - .3, 'riser'), (D * .5, 'whoosh'), (D * .5 + 1.4, 'boom')],
        's46_trepan': [(D * .5, 'scribble'), (D * .75, 'sting')],
        's47_regenerado': [(0.6, 'sparkle'), (D * .65, 'pop'), (D * .7, 'ding')],
        's48_porque': [(0.4 + k * D * .22, 'pop') for k in range(3)] + [(D * .8, 'boing')],
        's49_chaman': [(D * .45, 'whoosh'), (D * .55, 'pop')],
        's50_ritual': [(0.1 + k * D * .2, 'pop') for k in range(3)],
        's51_util': sum([[(D * (.18 + k * .25), 'pop'), (D * (.18 + k * .25) + .1, 'ding')] for k in range(3)], []),
        's52_medico': [(D * (.15 + k * .17), 'pop') for k in range(3)] + [(D * .7, 'pop')],
        's53_resumen': [(D * x, 'pop') for x in (.3, .45, .6)] + [(D * .78, 'sparkle')],
        's54_oscuro': [(D * .45 - .7, 'sneeze'), (D * .45 + .1, 'whoosh'), (D * .45 + 1.2, 'boom'), (D * .75, 'sting')],
        's55_final': [(0, 'whoosh'), (0.6, 'ding')],
    }
    return E


GAIN = {'tick': 0.6, 'steps': 1.0, 'crickets': 1.0, 'chew': 1.0, 'scribble': 1.0, 'growl': 0.7}


def sfx_track():
    x = np.zeros(int((TOTAL + 3) * SR))
    for i, sc in enumerate(SC):
        D = DUR[i]; t0 = START[i]
        if i > 0 and sc['name'] not in ('s55_final',):
            place(x, S.whoosh(0.35), t0 - 0.2, 0.55)
        for (t, name) in eventos(D).get(sc['name'], []):
            m = re.match(r'([a-z]+)([\d.]*)$', name); base, arg = m.group(1), m.group(2)
            if base == 'steps': snd = S.steps(float(arg or 1.0))
            elif base in ('chew', 'scribble', 'rub', 'scurry'): snd = getattr(S, base)(min(D * 0.45, 3.0))
            elif base == 'crickets': snd = S.crickets(1.4)
            else: snd = getattr(S, base)()
            place(x, snd, t0 + t, GAIN.get(base, 1.0))
    return x


# ---------- ambiente ----------
AMB = {'cave': ['s01', 's04', 's16', 's19', 's27', 's35', 's36', 's46', 's49', 's50', 's51', 's53', 's54'],
       'savanna': ['s07', 's08', 's14', 's15', 's24', 's25', 's26', 's28', 's30', 's32'],
       'jungle': ['s09', 's10', 's12', 's38', 's42', 's44'],
       'wind': ['s21', 's22', 's23'], 'night': ['s35']}


def amb_track():
    x = np.zeros(int((TOTAL + 3) * SR))
    for i, sc in enumerate(SC):
        pre = sc['name'][:3]; D = DUR[i]
        for kind, lst in AMB.items():
            if pre not in lst: continue
            if kind == 'cave':
                snd = S.crackle(D)
                if pre == 's54': snd[int(D * 0.45 * SR):] *= 0  # el estornudo apaga el fuego
            elif kind == 'savanna': snd = S.birds(D) * 0.8
            elif kind == 'jungle': snd = S.birds(D) * 1.6
            elif kind == 'wind': snd = S.wind(D)
            else: snd = S.crickets(D) * 0.4
            fade = np.minimum(1, np.minimum(np.arange(len(snd)), len(snd) - np.arange(len(snd))) / (0.15 * SR))
            place(x, snd * fade, START[i])
    return x


# ---------- música ----------
SECCIONES = [(1, 6, 'tension'), (7, 34, 'playful'), (35, 35, 'emotional'), (36, 36, 'playful'), (37, 41, 'tension'),
             (42, 48, 'playful'), (49, 51, 'tribal'), (52, 52, 'playful'), (53, 53, 'emotional'), (54, 54, 'tension'),
             (55, 55, 'playful')]


def music_track():
    x = np.zeros(int((TOTAL + 3) * SR)); xf = 0.4
    for k, (a, b, mood) in enumerate(SECCIONES):
        t0, t1 = START[a - 1], START[b]
        fn = S.MOODS[mood]
        seg = fn(t1 - t0 + xf, seed=k) if mood == 'playful' else fn(t1 - t0 + xf)
        seg = seg / max(1e-6, np.percentile(np.abs(seg), 99.5))
        n = len(seg); r = np.arange(n)
        env = np.minimum(1, np.minimum(r / (xf * SR), (n - r) / (xf * SR)))
        if mood == 'tension': env *= 0.85
        if mood == 'emotional': env *= 0.9
        place(x, seg * env, t0 - (xf / 2 if k else 0))
    end = int(TOTAL * SR); fo = int(2.5 * SR)
    x[end - fo:end] *= np.linspace(1, 0, fo); x[end:] = 0
    return x


# ---------- subtítulos ----------
def ass_time(s):
    s = max(0, s); return f'{int(s // 3600)}:{int(s % 3600 // 60):02d}:{s % 60:05.2f}'


def subtitulos(vlen):
    head = """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,Luckiest Guy,76,&H0026D4FF,&H00FFFFFF,&H001E1A1C,&H96000000,0,0,0,0,100,100,2,0,1,7,3,2,80,80,46,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = []
    for i, sc in enumerate(SC):
        words = sc['text'].split()
        def wt(w):  # peso ~ duración hablada
            base = len(re.sub(r'[^\wáéíóúñü]', '', w.lower())) + 2
            if w.endswith(('.', '?', '!', ':')): base += 7
            elif w.endswith((',', '...', ';')): base += 4
            return base
        weights = [wt(w) for w in words]; tot = sum(weights)
        t = START[i] + LEAD; L = vlen[i] / SR
        times = []
        for w, g in zip(words, weights):
            times.append((t, g / tot * L)); t += g / tot * L
        chunks, cur = [], []
        for j, w in enumerate(words):
            cur.append(j)
            if len(cur) >= 3 or w.endswith(('.', ',', '?', '!', ':', '...')) or len(' '.join(words[c] for c in cur)) > 18:
                chunks.append(cur); cur = []
        if cur: chunks.append(cur)
        for c in chunks:
            st = times[c[0]][0]; en = times[c[-1]][0] + times[c[-1]][1]
            en = min(en + 0.12, START[i + 1] - 0.02)
            kar = ''.join('{\\k%d}%s ' % (max(1, round(times[j][1] * 100)), words[j].upper()) for j in c)
            txt = '{\\fscx70\\fscy70\\t(0,90,\\fscx108\\fscy108)\\t(90,160,\\fscx100\\fscy100)}' + kar.strip()
            lines.append(f'Dialogue: 0,{ass_time(st)},{ass_time(en)},Sub,,0,0,0,,{txt}')
    p = os.path.join(OUT, 'subtitulos.ass')
    open(p, 'w').write(head + '\n'.join(lines) + '\n')
    return p


def main():
    vs = voces()
    voice = np.zeros(int((TOTAL + 3) * SR))
    for i, a in enumerate(vs):
        a = a[:int((DUR[i] - LEAD - 0.05) * SR)]
        place(voice, a / max(1e-6, np.abs(a).max()) * 0.9, START[i] + LEAD)
    print('voz ok', flush=True)
    sfx = sfx_track(); print('efectos ok', flush=True)
    amb = amb_track(); print('ambiente ok', flush=True)
    mus = music_track(); print('musica ok', flush=True)
    # ducking: la música baja cuando habla la voz
    env = S.lp(np.abs(voice), 6) > 0.01
    from scipy.signal import lfilter
    duck = lfilter([0.00015], [1, -0.99985], env.astype(float))
    duck = np.clip(duck * 3, 0, 1)
    mus_g = 0.30 - 0.17 * duck
    mix = voice * 1.0 + mus * mus_g + sfx * 0.8 + amb * 0.9
    mix = mix[:int(TOTAL * SR)]
    mix = np.tanh(mix * 1.1) / np.tanh(1.1)
    wav = os.path.join(OUT, 'mezcla.wav')
    sf.write(wav, np.stack([mix, mix], 1).astype(np.float32), SR, subtype='PCM_16')
    ass = subtitulos([len(a) for a in vs])
    final = os.path.join(OUT, 'VIDEO_FINAL.mp4')
    vf = f"subtitles={ass}:fontsdir={os.path.join(HERE, 'fonts')}"
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', os.path.join(OUT, 'video_sin_audio.mp4'), '-i', wav,
                    '-vf', vf, '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
                    '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
                    '-movflags', '+faststart', '-shortest', final], check=True)
    print('ok', final)


if __name__ == '__main__':
    main()
