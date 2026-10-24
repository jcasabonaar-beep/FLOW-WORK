"""Banda sonora de DISCIPLINA (sintetizada, sin derechos de autor) + montaje final.
Uso: python3 banda.py [es|en ...]   (requiere salida/corto_<lang>_sin_audio.mp4 de corto.py)"""
import os, sys, subprocess
import numpy as np, soundfile as sf
from scipy.signal import fftconvolve
BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BASE, '..', 'video-enfermos'))
import sonidos as S
from sonidos import SR, place, tt, noise, lp, hp, bp, norm, sweep, midi
import corto

OUT = os.path.join(BASE, 'salida')
DUR = {sc['name']: round(sc['dur'] * corto.FPS) / corto.FPS for sc in corto.SC}
START = {}; _acc = 0.0
for sc in corto.SC:
    START[sc['name']] = _acc; _acc += DUR[sc['name']]
TOTAL = _acc
_r = np.random.default_rng(3)


# ---------------- instrumentos ----------------
def piano(f, d=2.5, v=1.0):
    t = tt(d)
    x = sum((1 / k ** 1.6) * np.sin(2 * np.pi * f * k * t * (1 + 0.0007 * k)) * np.exp(-t * (1.2 + 0.9 * k)) for k in range(1, 7))
    x += 0.05 * hp(noise(d), 2000) * np.exp(-t * 80)
    return x * np.minimum(1, t * 250) * v


def strings(freqs, d, v=1.0):
    t = tt(d)
    x = sum(np.sign(np.sin(2 * np.pi * f * t * (1 + det))) for f in freqs for det in (-0.004, 0, 0.004))
    x = lp(x, 1100) * (1 + 0.04 * np.sin(2 * np.pi * 5 * t))
    env = np.minimum(1, t / 1.2) * np.minimum(1, (d - t) / 0.8)
    return x * env * 0.05 * v


def brass(freqs, d, v=1.0):
    t = tt(d)
    x = sum(2 * ((f * t) % 1) - 1 for f in freqs)
    return lp(x, 700) * np.minimum(1, t / 0.08) * np.exp(-t * 0.8) * 0.12 * v


BPM = 72


def bar(bpm=BPM): return 4 * 60 / bpm


MINOR = [(45, (57, 60, 64)), (41, (53, 57, 60)), (48, (55, 60, 64)), (43, (55, 59, 62))]   # Am F C G
MAJOR = [(48, (55, 60, 64)), (43, (55, 59, 62)), (45, (57, 60, 64)), (41, (53, 57, 60))]   # C G Am F


def g_piano(D, prog, bpm=72, arp=True, v=1.0, strings_v=1.0, octave=0):
    x = np.zeros(int((D + 4) * SR)); b = bar(bpm); beat = b / 4
    for i in range(int(D / b) + 1):
        root, ch = prog[i % 4]; t0 = i * b
        place(x, piano(midi(root + octave), 3.5, 0.8 * v), t0)
        place(x, strings([midi(n + octave) for n in ch], b + 1.0, strings_v), t0)
        if arp:
            pat = [ch[0], ch[1], ch[2], ch[1] + 12, ch[2], ch[1], ch[0] + 12, ch[2]]
            for k, n in enumerate(pat):
                place(x, piano(midi(n + 12 + octave), 2.0, (0.42 if k % 2 == 0 else 0.3) * v), t0 + k * beat / 2)
    return x[:int(D * SR)]


def g_sparse(D):
    x = np.zeros(int((D + 4) * SR))
    for k, n in enumerate((76, 72, 69, 72, 76, 74, 71, 72)):
        place(x, piano(midi(n), 3.5, 0.35), 0.5 + k * 1.35)
    place(x, strings([midi(45), midi(52)], D, 0.6), 0)
    return x[:int(D * SR)]


def g_drone(D, v=1.0):
    t = tt(D)
    x = lp(sum(np.sign(np.sin(2 * np.pi * f * t)) for f in (midi(33), midi(33) * 1.006, midi(40))), 300) * 0.08
    return x * (0.6 + 0.4 * (t / D)) * v


def g_grind(D, bpm=100, start_v=0.6, full=True):
    x = np.zeros(int((D + 3) * SR)); b = bar(bpm); beat = b / 4
    for i in range(int(D / b) + 1):
        root, ch = MINOR[i % 4]; t0 = i * b
        g = min(1.0, start_v + (1 - start_v) * (t0 / max(D, 1)))
        for k in range(8):
            n = [ch[0], ch[2], ch[1] + 12, ch[2]][k % 4] + 12
            place(x, piano(midi(n), 1.2, 0.32 * g), t0 + k * beat / 2)
            place(x, S.bassn(midi(root), beat / 2) * 0.5 * g, t0 + k * beat / 2)
        place(x, strings([midi(n) for n in ch], b + 0.5, 1.2 * g), t0)
        if full:
            for k in range(4):
                place(x, S.kick() * 0.8 * g, t0 + k * beat)
                if k in (1, 3): place(x, S.snap() * 1.2 * g, t0 + k * beat)
            for k in range(8): place(x, S.hat() * 0.7 * g, t0 + k * beat / 2)
            place(x, S.tom(90) * 0.6 * g, t0 + 3.5 * beat)
    return x[:int(D * SR)]


def g_epic(D, bpm=100):
    x = np.zeros(int((D + 3) * SR)); b = bar(bpm); beat = b / 4
    prog = [(45, (57, 60, 64)), (41, (53, 57, 60)), (43, (55, 59, 62)), (45, (57, 61, 64))]
    for i in range(int(D / b) + 1):
        root, ch = prog[i % 4]; t0 = i * b
        g = 0.7 + 0.3 * (t0 / D)
        place(x, brass([midi(n - 12) for n in ch], b, 1.3 * g), t0)
        place(x, strings([midi(n) for n in ch] + [midi(ch[0] + 12)], b + 0.5, 1.6 * g), t0)
        for pos, f in ((0, 80), (0.75, 100), (1.5, 80), (2, 120), (2.75, 100), (3, 80), (3.5, 140)):
            place(x, S.tom(f) * 0.9 * g, t0 + pos * beat)
        for k in range(4): place(x, S.kick() * g, t0 + k * beat)
        for k in range(8): place(x, piano(midi(ch[0] + 24 + (k % 2) * 7), 0.8, 0.25 * g), t0 + k * beat / 2)
    return x[:int(D * SR)]


def g_triumph(D):
    x = g_piano(D, MAJOR, bpm=80, v=1.0, strings_v=1.8)
    b = bar(80)
    for i in range(int(D / b) + 1):
        for k in (0, 2): place(x, S.kick() * 0.45, i * b + k * b / 4)
        root, ch = MAJOR[i % 4]
        place(x, piano(midi(ch[2] + 24), 3, 0.25), i * b + b / 2)
    return x


# ---------------- efectos propios ----------------
def whisper(d=1.4):
    t = tt(d)
    syl = np.abs(np.sin(2 * np.pi * 3.2 * t)) ** 1.5
    x = bp(noise(d), 1500, 5000) * syl * 0.6 + lp(np.sign(np.sin(2 * np.pi * 70 * t)), 300) * syl * 0.25
    return norm(x * np.sin(np.pi * t / d), 0.35)


def typekey():
    t = tt(0.03); return norm(hp(noise(0.03), 3000) * np.exp(-t * 300), 0.12)


def alarm(d):
    t = tt(d)
    on = ((t % 0.9) < 0.6) * ((t % 0.15) < 0.09)
    return lp(np.sign(np.sin(2 * np.pi * 2000 * t)), 5000) * on * 0.22


def glass():
    x = np.zeros(int(1.2 * SR))
    for _ in range(14):
        place(x, S.ding(_r.uniform(2500, 6500), 0.5), _r.uniform(0, 0.5), _r.uniform(0.2, 0.6))
    place(x, S.crack(), 0, 0.8)
    return norm(x, 0.7)


def rewind(d):
    t = tt(d)
    f = 900 + 1800 * (t / d) + 500 * np.sin(2 * np.pi * 14 * t)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25 + bp(noise(d), 1000, 6000) * 0.4
    return norm(x * np.minimum(1, t * 20), 0.4)


def breath(d=2.0):
    t = tt(d); return norm(bp(noise(d), 300, 1600) * np.sin(np.pi * t / d) ** 2, 0.18)


def rain_amb(d):
    x = bp(noise(d), 1200, 7000) * 0.05
    for _ in range(int(d * 25)):
        place(x, hp(noise(0.02), 2500) * np.exp(-tt(0.02) * 200) * 0.06, _r.uniform(0, d))
    return x


def splash():
    t = tt(0.5); return norm(hp(noise(0.5), 700) * np.exp(-t * 9), 0.5)


def pageflip():
    t = tt(0.22); return norm(bp(noise(0.22), 2000, 7000) * np.sin(np.pi * t / 0.22), 0.25)


def hum(d):
    t = tt(d); return (np.sin(2 * np.pi * 60 * t) + 0.5 * np.sin(2 * np.pi * 120 * t)) * 0.03


def thunder():
    t = tt(3.0); return norm(lp(noise(3.0), 160) * np.exp(-t * 1.2) * (1 + np.sin(2 * np.pi * 3 * t)), 0.5)


# ---------------- arreglo ----------------
def at(name, t=0.0): return START[name] + t


def music():
    x = np.zeros(int((TOTAL + 5) * SR))
    def put(g, a, b, v=1.0, fi=0.3, fo=0.6):
        seg = g(b - a + fo)
        seg = seg / max(1e-6, np.percentile(np.abs(seg), 99.7)) * v
        n = len(seg); r = np.arange(n)
        seg *= np.minimum(1, np.minimum(r / (fi * SR + 1), (n - r) / (fo * SR + 1)))
        place(x, seg, a)
    put(lambda D: g_drone(D), at('c01_hook'), at('c01_hook', 1.6), 0.5, fi=0.05, fo=0.05)
    put(lambda D: g_piano(D, MAJOR, 72, v=0.9), at('c01_hook', 1.6), at('c02_rewind', 0.2), 0.75, fi=0.05)
    put(lambda D: g_piano(D, MINOR, 66, v=1.0, strings_v=0.8), at('c03_desk'), at('c08_mirror', 3.0), 0.42, fi=1.0, fo=2.0)
    put(lambda D: g_drone(D), at('c08_mirror'), at('c09_rock', 1.0), 0.38, fi=2.0, fo=1.5)
    put(g_sparse, at('c09_rock', 0.5), at('c10_day1'), 0.22, fi=1.5, fo=0.8)
    d1 = at('c10_day1', DUR['c10_day1'] * 0.62)
    put(lambda D: g_grind(D, start_v=0.35, full=False), d1, at('c12_run'), 0.5, fi=0.05)
    put(lambda D: g_grind(D, start_v=0.7), at('c12_run'), at('c16_fall', 1.2), 0.8, fi=0.05, fo=0.3)
    put(lambda D: g_drone(D, 0.8), at('c16_fall', 1.2), at('c16_fall', DUR['c16_fall'] * 0.62), 0.45, fi=0.1)
    put(lambda D: g_grind(D, start_v=0.9), at('c16_fall', DUR['c16_fall'] * 0.62), at('c17_fight'), 0.85, fi=0.05)
    hit = at('c17_fight', DUR['c17_fight'] * 0.74)
    put(g_epic, at('c17_fight'), hit, 1.1, fi=0.1, fo=0.05)
    put(g_triumph, hit + 0.9, at('c19_title', 2.0), 0.85, fi=1.5, fo=2.0)
    put(lambda D: g_piano(D, MAJOR, 66, arp=False, v=0.9, strings_v=1.2), at('c19_title'), TOTAL, 0.6, fi=1.0, fo=3.0)
    put(lambda D: g_piano(D, MAJOR, 80, v=0.6, strings_v=0.6, octave=12), at('c20_end', 0.5), TOTAL, 0.35, fi=1.0, fo=3.0)
    end = int(TOTAL * SR); x[end - int(3 * SR):end] *= np.linspace(1, 0, int(3 * SR)); x[end:] = 0
    return x


TYPED = [('c01_hook', 0.15, 'never', 18), ('c01_hook', 5.0, 'notalways', 16), ('c04_phone', 1.7, 'onemore', 16),
         ('c12_run', 0.5, 'skipgym', 16), ('c13_pushups', 1.2, 'enough', 16), ('c14_study', 1.0, 'phone', 16), ('c03_desk', 2.0, 'why', 16), ('c05_alarm', 1.75, '5min', 16),
         ('c06_sleep', 1.0, 'same', 16), ('c09_rock', 2.0, 'rb1', 14), ('c09_rock', 6.0, 'rb2', 12),
         ('c11_wake', 3.6, 'tomorrow', 16), ('c15_fridge', 1.2, 'justone', 16), ('c16_fall', 1.8, 'giveup', 16),
         ('c17_fight', 2.0, 'cant', 16), ('c18_summit', 4.6, 'save1', 14), ('c18_summit', 8.0, 'save2', 14),
         ('c19_title', 2.4, 'sub', 14), ('c19_title', 4.6, 'decide', 10)]
WHISPER = {'why', '5min', 'tomorrow', 'justone', 'giveup', 'cant', 'never', 'onemore', 'skipgym', 'enough', 'phone'}


def sfx(lang):
    x = np.zeros(int((TOTAL + 5) * SR))
    for name in START:
        if name not in ('c01_hook', 'c02_rewind', 'c07_montage'):
            place(x, S.whoosh(0.3), at(name, -0.15), 0.35)
    for name, t0, key, cps in TYPED:
        s = corto.TX[key][0 if lang == 'es' else 1]
        if key in WHISPER:
            place(x, whisper(len(s) / cps + 0.4), at(name, t0), 0.9)
        else:
            for k in range(len(s)):
                if s[k] != ' ': place(x, typekey(), at(name, t0 + k / cps), 0.8)
    D = DUR
    E = [
        ('c01_hook', 0, S.heartbeat() * 0.7), ('c01_hook', 1.6, S.boom() * 0.8), ('c01_hook', 1.6, S.wind(6.0) * 1.5),
        ('c01_hook', 2.6, S.whoosh(0.5) * 0.5),
        ('c13_pushups', D['c13_pushups'] * 0.8, S.whoosh(0.4) * 0.5), ('c14_study', D['c14_study'] * 0.75, S.whoosh(0.4) * 0.5),
        ('c15_fridge', D['c15_fridge'] * 0.8, S.whoosh(0.4) * 0.5),
        ('c02_rewind', 0, rewind(1.6)),
        *[('c03_desk', k * 1.0, S.tick() * 0.9) for k in range(5)], ('c03_desk', D['c03_desk'] * 0.62 + 0.5, S.thud() * 0.35),
        *[('c04_phone', tp, S.ding(2400, 0.5) * 0.6) for tp in (0.9, 2.3)],
        ('c05_alarm', 0, alarm(D['c05_alarm'] * 0.48)), ('c05_alarm', D['c05_alarm'] * 0.48, S.click()),
        ('c06_sleep', 0.5, breath(2.6)),
        *[('c07_montage', k * 0.42, S.tick()) for k in range(6)],
        ('c08_mirror', D['c08_mirror'] * 0.32, S.sting(1.5) * 0.4), ('c08_mirror', D['c08_mirror'] * 0.62, glass()),
        *[('c09_rock', 0.3 + k * 1.1, S.heartbeat() * 0.55) for k in range(9)], ('c09_rock', 1.0, breath(2.5)),
        ('c10_day1', 0.15, S.boom()), ('c10_day1', 1.6, alarm(D['c10_day1'] * 0.62 - 1.6)),
        ('c10_day1', D['c10_day1'] * 0.62, S.click()), ('c10_day1', D['c10_day1'] * 0.62, S.boom()),
        ('c11_wake', 1.0, S.rub(1.4)), ('c11_wake', 3.0, S.whoosh(0.5) * 0.6), ('c11_wake', 3.0, S.steps(2.0, 0.45) * 0.8),
        ('c12_run', 0, rain_amb(D['c12_run'])), *[('c12_run', k * 0.262, S.step() * 0.9) for k in range(int(D['c12_run'] / 0.262))],
        ('c12_run', 3.0, thunder() * 0.6),
        *[('c13_pushups', 0.94 + k * 1.257, S.thud() * 0.25) for k in range(4)], ('c13_pushups', 0, breath(2.5)), ('c13_pushups', 2.5, breath(2.5)),
        *[('c14_study', 0.4 + k * 1.1, pageflip()) for k in range(4)], *[('c14_study', k * 0.12, S.tick() * 0.4) for k in range(40)],
        ('c15_fridge', 0.3, S.whoosh(0.6) * 0.5), ('c15_fridge', 0.3, hum(D['c15_fridge'] - 0.3)),
        ('c15_fridge', D['c15_fridge'] * 0.55 + 0.4, S.pop()), ('c15_fridge', D['c15_fridge'] * 0.55 + 0.5, S.ding()),
        ('c16_fall', 0, rain_amb(D['c16_fall'])), *[('c16_fall', k * 0.262, S.step()) for k in range(4)],
        ('c16_fall', 1.3, S.thud()), ('c16_fall', 1.3, splash()),
        *[('c16_fall', 2.0 + k * 1.0, S.heartbeat() * 0.7) for k in range(2)],
        ('c16_fall', D['c16_fall'] * 0.62, S.whoosh(0.8) * 0.7), ('c16_fall', D['c16_fall'] * 0.62, breath(1.5)),
        *[('c17_fight', 0.5 + k * (D['c17_fight'] * 0.62 / 8.5), S.step()) for k in range(9)],
        ('c17_fight', D['c17_fight'] * 0.74 - 1.6, S.riser(1.6)),
        ('c17_fight', D['c17_fight'] * 0.74, S.boom(2.5)), ('c17_fight', D['c17_fight'] * 0.74, glass()),
        ('c18_summit', 0, S.wind(D['c18_summit'])), ('c18_summit', 0.5, S.birds(D['c18_summit'] - 1) * 1.2),
        ('c18_summit', 4.0, S.whoosh(0.6) * 0.5),
        ('c19_title', 0.3, S.boom() * 0.6), ('c19_title', 1.0, S.whoosh(0.8) * 0.5),
        ('c20_end', 0.3, S.pop()), ('c20_end', 0.6, S.pop()),
    ]
    for name, t, snd in E:
        place(x, snd, at(name, t))
    return x


def reverb(x, wet=0.28, seed=1):
    r = np.random.default_rng(seed); d = 2.4; t = tt(d)
    ir = r.standard_normal(len(t)) * np.exp(-t / 0.55)
    ir = lp(ir, 5000); ir /= np.sqrt((ir ** 2).sum())
    return x * (1 - wet) + fftconvolve(x, ir)[:len(x)] * wet * 1.4


def main(langs):
    mus = music()
    musL, musR = reverb(mus, 0.3, 1), reverb(mus, 0.3, 2)
    for lang in langs:
        fx = sfx(lang)
        fxL, fxR = reverb(fx, 0.18, 3), reverb(fx, 0.18, 4)
        L_ = (musL * 0.75 + fxL * 0.8)[:int(TOTAL * SR)]
        R_ = (musR * 0.75 + fxR * 0.8)[:int(TOTAL * SR)]
        mix = np.stack([L_, R_], 1)
        mix = np.tanh(mix * 1.2) / np.tanh(1.2)
        wav = os.path.join(OUT, f'banda_{lang}.wav')
        sf.write(wav, mix.astype(np.float32), SR, subtype='PCM_16')
        final = os.path.join(OUT, f'DISCIPLINA_{lang.upper()}.mp4')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', os.path.join(OUT, f'corto_{lang}_sin_audio.mp4'),
                        '-i', wav, '-c:v', 'copy', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k',
                        '-ar', '48000', '-movflags', '+faststart', '-shortest', final], check=True)
        print('ok', final)


if __name__ == '__main__':
    main(sys.argv[1:] or ['es', 'en'])
