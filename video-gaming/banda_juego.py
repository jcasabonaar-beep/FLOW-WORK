"""Banda sonora 'dopamínica' (chiptune + efectos de 8 bits, todo sintetizado) y montaje final.
Uso: python3 banda_juego.py [es|en ...]   (requiere salida/juego_<lang>_sin_audio.mp4)"""
import os, sys, subprocess
import numpy as np, soundfile as sf
BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BASE, '..', 'video-disciplina'))
sys.path.insert(0, os.path.join(BASE, '..', 'video-enfermos'))
import sonidos as S
from sonidos import SR, place, tt, noise, lp, hp, bp, norm, sweep, midi
import banda as B
import juego as J

OUT = os.path.join(BASE, 'salida')
DUR = {sc['name']: round(sc['dur'] * J.FPS) / J.FPS for sc in J.SC}
START = {}; _a = 0.0
for sc in J.SC: START[sc['name']] = _a; _a += DUR[sc['name']]
TOTAL = _a
_r = np.random.default_rng(5)


def at(n, t=0.0): return START[n] + t


# ---------------- osciladores 8 bits ----------------
def sq(f, d, duty=0.5, v=1.0, dec=6.0, vib=0.0):
    t = tt(d)
    ph = np.cumsum(f * (1 + vib * np.sin(2 * np.pi * 6 * t))) / SR if vib else f * t
    x = np.where((ph % 1) < duty, 1.0, -1.0)
    return lp(x, 7000) * np.exp(-t * dec) * np.minimum(1, t * 800) * v * 0.3


def tri(f, d, v=1.0):
    t = tt(d); x = 2 * np.abs(2 * ((f * t) % 1) - 1) - 1
    return x * np.minimum(1, (d - t) * 60) * v * 0.45


def seq(notes, step, duty=0.5, dec=8.0, v=1.0):
    x = np.zeros(int((len(notes) * step + 0.6) * SR))
    for k, n in enumerate(notes):
        if n: place(x, sq(midi(n), step + 0.25, duty, v, dec), k * step)
    return x


# ---------------- efectos ----------------
def coin(): return np.concatenate([sq(988, 0.07, 0.5, 1, 0), sq(1319, 0.3, 0.5, 1, 9)])
def levelup(): return seq([72, 76, 79, 84, 88, 91, 96], 0.055, 0.25, 4, 1.1)
def jingle(): return seq([72, 76, 79, 84, 0, 79, 84, 88], 0.11, 0.5, 5, 1.0)
def record(): return seq([72, 72, 72, 76, 0, 79, 79, 84], 0.09, 0.25, 4, 1.0)
def quest(): return seq([79, 84], 0.12, 0.25, 5, 0.9)
def done(): return seq([84, 88, 91, 96], 0.06, 0.5, 5, 1.0) + np.pad(S.ding(2093, 0.8), (0, 0))[:int(0.84 * SR)]
def blip(): return sq(880, 0.06, 0.25, 0.7, 20)
def lowbeep(): return sq(220, 0.35, 0.5, 1.0, 3)


def done_():
    a = seq([84, 88, 91, 96], 0.06, 0.5, 5, 1.0); b = S.ding(2093, 0.8)
    x = np.zeros(max(len(a), len(b))); x[:len(a)] += a; x[:len(b)] += b * 0.7; return x


def powerup():
    t = tt(0.45); f = 300 + 900 * (t / 0.45)
    return lp(np.where((np.cumsum(f * (1 + 0.05 * np.sin(2 * np.pi * 30 * t))) / SR % 1) < 0.5, 1.0, -1.0), 6000) * 0.25


def bloop():
    t = tt(0.4)
    return norm(np.sin(2 * np.pi * np.cumsum(520 - 330 * (t / 0.4)) / SR) * np.exp(-t * 5), 0.4)


def bloopdown(): return seq([67, 64, 60, 55], 0.14, 0.5, 4, 0.8)


def fail():
    x = np.zeros(int(1.6 * SR))
    for k, n in enumerate((67, 66, 65)): place(x, sq(midi(n), 0.32, 0.5, 1, 2.5), k * 0.3)
    place(x, sq(midi(64), 0.8, 0.5, 1, 1.5, vib=0.03), 0.9)
    return x


def xp():
    x = np.zeros(int(0.6 * SR))
    for k in range(12): place(x, sq(700 + k * 60, 0.04, 0.25, 0.5, 30), k * 0.035)
    return x


def coins():
    x = np.zeros(int(1.2 * SR))
    for k in range(7): place(x, coin(), _r.uniform(0, 0.7), _r.uniform(0.4, 0.8))
    return x


def glitch():
    x = np.zeros(int(0.5 * SR))
    for k in range(10): place(x, sq(_r.uniform(100, 1500), 0.05, 0.5, 0.8, 0), k * 0.045)
    return x + hp(noise(0.5), 1000) * 0.15


def buzz():
    t = tt(1.2); on = (t % 0.4) < 0.25
    return lp(np.sign(np.sin(2 * np.pi * 170 * t)), 600) * on * 0.25


def door():
    t = tt(0.7); return norm(bp(noise(0.7), 400, 1400) * (1 + np.sin(2 * np.pi * 9 * t)) * np.sin(np.pi * t / 0.7)
                            + 0.3 * np.sin(2 * np.pi * np.cumsum(180 + 60 * np.sin(2 * np.pi * 2 * t)) / SR) * np.sin(np.pi * t / 0.7), 0.3)


def rustle():
    x = np.zeros(int(0.7 * SR))
    for k in range(6): place(x, bp(noise(0.08), 1500, 6000) * np.hanning(int(0.08 * SR)), k * 0.1, 0.4)
    return x


def yawn():
    t = tt(1.0); f = 320 - 140 * (t / 1.0)
    return norm(bp(np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)), 500, 1500) * np.sin(np.pi * t / 1.0), 0.3)


def powercut():
    t = tt(0.7)
    x = (hp(noise(0.7), 800) * 0.5 + np.sign(np.sin(2 * np.pi * 100 * t)) * 0.4) * np.exp(-t * 4)
    x[-int(0.05 * SR):] = 0
    return norm(x + np.pad(S.click(), (0, len(x) - len(S.click()))), 0.6)


def laugh():
    x = np.zeros(int(1.3 * SR))
    for v, (f0, off) in enumerate(((240, 0.0), (300, 0.08), (200, 0.15))):
        for k in range(5):
            d = 0.11; t = tt(d)
            f = f0 * (1 + 0.05 * _r.standard_normal()) * (1 - 0.15 * t / d)
            b = bp(np.sign(np.sin(2 * np.pi * np.cumsum(np.full(len(t), f)) / SR)), 500, 2000) * np.sin(np.pi * t / d)
            place(x, b, off + k * 0.19, 0.25)
    return x


def snore():
    t = tt(2.6); return norm(lp(noise(2.6), 300) * (np.sin(np.pi * t / 1.3) ** 4) * (1 + 0.5 * np.sin(2 * np.pi * 30 * t)), 0.2)


def ghost():
    x = np.zeros(int(2.6 * SR)); place(x, B.whisper(2.4), 0, 0.8)
    t = tt(2.4); place(x, sq(110, 2.4, 0.5, 0.5, 0.5) * (0.5 + 0.5 * np.sin(2 * np.pi * 5 * t)), 0)
    return x


def typekeys(s, cps):
    x = np.zeros(int((len(s) / cps + 0.3) * SR))
    for k, ch in enumerate(s):
        if ch.strip(): place(x, B.typekey(), k / cps, 0.8)
    return x


SND = {'coin': coin, 'levelup': levelup, 'coins': coins, 'glitch': glitch, 'boom': S.boom, 'lowbeep': lowbeep,
       'rewind': lambda: B.rewind(1.6), 'door': door, 'steps': lambda: S.steps(1.6, 0.4), 'label': S.pop,
       'rustle': rustle, 'jingle': jingle, 'sparkle': S.sparkle, 'hudin': powerup, 'buzz': buzz,
       'notif': lambda: S.ding(1800, 0.5), 'decline': lambda: S.whoosh(0.3), 'bloop': bloop, 'xp': xp, 'blip': blip,
       'birds': lambda: S.birds(3.0) * 1.5, 'yawn': yawn, 'thud': S.thud, 'record': record, 'fail': fail,
       'whoosh': lambda: S.whoosh(0.4), 'powercut': powercut, 'unplug': S.click, 'bloopdown': bloopdown,
       'boxclose': lambda: S.thud() * 0.7, 'sigh': lambda: B.breath(2.0), 'heartbeat': S.heartbeat, 'ghost': ghost,
       'quest': quest, 'done': done_, 'hudup': powerup, 'runsteps': lambda: S.steps(6.0, 0.262),
       'pages': lambda: np.concatenate([B.pageflip(), np.zeros(int(0.5 * SR)), B.pageflip()]), 'clap': S.snap,
       'laugh': laugh, 'snore': snore, 'cheer': lambda: laugh() * 1.2, 'click': S.click}
CPS = {'off': 14}
GAIN = {'coin': 0.8, 'coins': 0.9, 'levelup': 1.0, 'xp': 0.9, 'heartbeat': 0.8, 'birds': 1.0, 'snore': 1.0}


def sfx(lang):
    x = np.zeros(int((TOTAL + 5) * SR))
    for sc in J.SC:
        n = sc['name']; D = DUR[n]
        if n not in ('g01_hook', 'g02_rewind', 'g09_montage'):
            place(x, S.whoosh(0.3), at(n, -0.15), 0.3)
        for t, kind in sc['ev'](D):
            if kind.startswith('type:'):
                key = kind[5:]; s = J.TX[key][0 if lang == 'es' else 1]
                place(x, typekeys(s, CPS.get(key, 16)), at(n, t)); continue
            if kind in SND:
                place(x, SND[kind](), at(n, t), GAIN.get(kind, 1.0))
    return x


# ---------------- música ----------------
CHIP_MAJ = [(48, (60, 64, 67)), (45, (57, 60, 64)), (41, (53, 57, 60)), (43, (55, 59, 62))]
CHIP_MIN = [(45, (57, 60, 64)), (41, (53, 57, 60)), (43, (55, 59, 62)), (40, (52, 56, 59))]


def chip(D, bpm=140, prog=CHIP_MAJ, seed=1, drums=True, v=1.0, lead=True):
    r = np.random.default_rng(seed)
    x = np.zeros(int((D + 2) * SR)); beat = 60 / bpm; bar = 4 * beat; e = beat / 2
    motif = [int(r.integers(0, 4)) for _ in range(8)]
    for i in range(int(D / bar) + 1):
        root, ch = prog[i % 4]; t0 = i * bar
        tones = [ch[0], ch[1], ch[2], ch[0] + 12]
        for k in range(8):
            place(x, tri(midi(root + (7 if k % 4 == 2 else 0)), e * 0.9, 1.0 * v), t0 + k * e)
            if lead:
                m = motif[(k + (i % 2) * 3) % 8]
                if not (k == 7 and i % 2): place(x, sq(midi(tones[m] + 12), e * 0.95, 0.25 if i % 4 < 2 else 0.5, 0.75 * v, 5), t0 + k * e)
            place(x, sq(midi(tones[k % 3] + 24), e * 0.5, 0.125, 0.25 * v, 14), t0 + k * e + e / 2)
        if drums:
            for k in range(4):
                place(x, sweep(160, 50, 0.12) * np.exp(-tt(0.12) * 25) * 0.7 * v, t0 + k * beat)
                if k % 2: place(x, hp(noise(0.1), 1500) * np.exp(-tt(0.1) * 30) * 0.35 * v, t0 + k * beat)
            for k in range(8): place(x, hp(noise(0.03), 6000) * np.exp(-tt(0.03) * 90) * 0.18 * v, t0 + k * e)
    return x[:int(D * SR)]


def uplift(D):
    x = chip(D, 120, CHIP_MAJ, 7, True, 0.8)
    p = B.g_piano(D, B.MAJOR, 120, v=0.8, strings_v=1.2)
    return x + p[:len(x)] * 0.9


def music():
    x = np.zeros(int((TOTAL + 5) * SR))
    def put(g, a, b, v=1.0, fi=0.2, fo=0.5):
        seg = g(b - a + fo); seg = seg / max(1e-6, np.percentile(np.abs(seg), 99.7)) * v
        n = len(seg); r = np.arange(n)
        seg *= np.minimum(1, np.minimum(r / (fi * SR + 1), (n - r) / (fo * SR + 1))); place(x, seg, a)
    put(lambda D: chip(D, 165, CHIP_MAJ, 3), at('g01_hook'), at('g01_hook', 3.4), 0.9, 0.02, 0.02)
    put(lambda D: B.g_drone(D), at('g01_hook', 3.4), at('g02_rewind'), 0.45, 0.05)
    put(lambda D: B.g_piano(D, B.MAJOR, 84, v=0.8, strings_v=0.7), at('g03_gift'), at('g04_night'), 0.5, 0.5)
    put(lambda D: chip(D, 140, CHIP_MAJ, 1), at('g04_night'), at('g08_pizza'), 0.75, 0.1)
    put(lambda D: chip(D, 150, CHIP_MIN, 4), at('g08_pizza'), at('g10_gameover', 0.9), 0.8, 0.05, 0.05)
    put(lambda D: B.g_drone(D), at('g10_gameover', 1.2), at('g10_gameover', 6.0), 0.4, 0.5, 0.02)
    put(B.g_sparse, at('g10_gameover', 7.0), at('g11_unplug'), 0.25, 1.0)
    put(lambda D: B.g_piano(D, B.MINOR, 66, v=0.9, strings_v=0.8), at('g11_unplug'), at('g13_run'), 0.4, 1.0, 0.3)
    put(uplift, at('g13_run'), at('g17_exam'), 0.8, 0.05)
    put(B.g_triumph, at('g17_exam'), at('g18_balance'), 0.85, 0.05)
    put(lambda D: B.g_piano(D, B.MAJOR, 76, v=0.9, strings_v=1.0) + chip(D, 152, CHIP_MAJ, 9, False, 0.35, False),
        at('g18_balance'), at('g19_title'), 0.55, 0.5)
    put(lambda D: B.g_piano(D, B.MAJOR, 66, arp=False, v=0.9, strings_v=1.1), at('g19_title'), at('g20_end'), 0.5, 0.5)
    put(lambda D: chip(D, 120, CHIP_MAJ, 11, False, 0.6), at('g20_end'), TOTAL, 0.35, 0.8, 3.0)
    end = int(TOTAL * SR); x[end - int(3 * SR):end] *= np.linspace(1, 0, int(3 * SR)); x[end:] = 0
    return x


def main(langs):
    mus = music()
    mL, mR = B.reverb(mus, 0.18, 1), B.reverb(mus, 0.18, 2)
    for lang in langs:
        fx = sfx(lang)
        fL, fR = B.reverb(fx, 0.12, 3), B.reverb(fx, 0.12, 4)
        mix = np.stack([(mL * 0.7 + fL * 0.85)[:int(TOTAL * SR)], (mR * 0.7 + fR * 0.85)[:int(TOTAL * SR)]], 1)
        mix = np.tanh(mix * 1.2) / np.tanh(1.2)
        wav = os.path.join(OUT, f'banda_{lang}.wav'); sf.write(wav, mix.astype(np.float32), SR, subtype='PCM_16')
        final = os.path.join(OUT, f'GAMING_{lang.upper()}.mp4')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', os.path.join(OUT, f'juego_{lang}_sin_audio.mp4'), '-i', wav,
                        '-c:v', 'copy', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
                        '-movflags', '+faststart', '-shortest', final], check=True)
        print('ok', final)


if __name__ == '__main__':
    main(sys.argv[1:] or ['es', 'en'])
