"""Efectos de sonido y música sintetizados desde cero (sin samples, sin derechos de autor)."""
import numpy as np
from scipy.signal import butter, sosfilt

SR = 44100
_rng = np.random.default_rng(7)


def tt(d): return np.arange(int(d * SR)) / SR
def noise(d): return _rng.standard_normal(int(d * SR))


def _f(x, kind, f, order=2):
    return sosfilt(butter(order, f, kind, fs=SR, output='sos'), x)


def lp(x, f): return _f(x, 'lowpass', f)
def hp(x, f): return _f(x, 'highpass', f)
def bp(x, lo, hi): return _f(x, 'bandpass', [lo, hi])


def norm(x, peak=1.0):
    m = np.abs(x).max()
    return x / m * peak if m > 0 else x


def sweep(f0, f1, d, curve=1.0):
    t = tt(d); f = f0 + (f1 - f0) * (t / d) ** curve
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def cat(*parts, gaps=None):
    return np.concatenate(parts)


def place(dst, src, t, gain=1.0):
    i = int(t * SR)
    if i >= len(dst) or i + len(src) <= 0: return
    if i < 0: src = src[-i:]; i = 0
    n = min(len(src), len(dst) - i)
    dst[i:i + n] += src[:n] * gain


def midi(n): return 440.0 * 2 ** ((n - 69) / 12)


# ---------------- efectos ----------------
def pop():
    t = tt(0.13)
    return norm(sweep(420, 1300, 0.13, 0.6) * np.exp(-t * 28), 0.55)


def whoosh(d=0.45):
    t = tt(d); e = np.sin(np.pi * t / d) ** 2
    a = bp(noise(d), 500, 1600) * e * (1 - t / d)
    b = bp(noise(d), 1500, 5000) * e * (t / d)
    return norm(a + b, 0.45)


def ding(f=1568, d=1.2):
    t = tt(d)
    x = np.sin(2 * np.pi * f * t) * np.exp(-3 * t) + 0.5 * np.sin(2 * np.pi * 2.76 * f * t) * np.exp(-6 * t) \
        + 0.25 * np.sin(2 * np.pi * 5.4 * f * t) * np.exp(-10 * t)
    return norm(x * np.minimum(1, t * 400), 0.4)


def wrong():
    def sq(f, d):
        t = tt(d); return lp(np.sign(np.sin(2 * np.pi * f * t)), 1800) * np.minimum(1, (d - t) * 60)
    return norm(np.concatenate([sq(190, 0.16), sq(140, 0.26)]), 0.32)


def boom(d=1.6):
    t = tt(d)
    x = sweep(95, 32, d, 0.4) * np.exp(-2.4 * t) + 0.6 * lp(noise(d), 250) * np.exp(-14 * t)
    return norm(x, 0.85)


def sting(d=2.0):
    t = tt(d)
    chord = sum(lp(np.sign(np.sin(2 * np.pi * midi(n) * t)) * 0.5, 900) for n in (45, 46, 52, 57))
    return norm(boom(d) * 0.9 + chord * np.exp(-1.6 * t) * np.minimum(1, t * 80) * 0.5, 0.85)


def cough():
    def burst():
        d = 0.24; t = tt(d)
        e = np.minimum(1, t * 120) * np.exp(-t * 16)
        voc = np.sin(2 * np.pi * np.cumsum(170 + 30 * _rng.standard_normal(len(t)).cumsum() / 400) / SR)
        return bp(noise(d), 300, 2200) * e + 0.4 * voc * e
    x = np.zeros(int(0.55 * SR)); place(x, burst(), 0); place(x, burst() * 0.8, 0.26)
    return norm(x, 0.6)


def sneeze():
    d1 = 0.7; t = tt(d1)
    ah = bp(np.sign(np.sin(2 * np.pi * np.cumsum(190 + 140 * (t / d1) ** 2) / SR)), 600, 1400) * (t / d1) ** 1.5
    d2 = 0.4; t2 = tt(d2)
    choo = bp(noise(d2), 1500, 7000) * np.minimum(1, t2 * 300) * np.exp(-t2 * 7)
    return norm(np.concatenate([ah * 0.35, choo]), 0.75)


def crickets(d=2.0):
    t = tt(d)
    pulses = ((t % 0.65) < 0.2) * (np.sin(2 * np.pi * 30 * t) > 0)
    return lp(np.sin(2 * np.pi * 4600 * t) * pulses, 8000) * 0.14


def crack():
    t = tt(0.3)
    x = hp(noise(0.3), 900) * np.exp(-t * 45) + 0.7 * sweep(160, 50, 0.3) * np.exp(-t * 18)
    return norm(x, 0.8)


def crackle(d):
    base = lp(np.cumsum(noise(d)) * 0.002, 400)
    base = base - lp(base, 20)
    pops = np.zeros(int(d * SR))
    for _ in range(int(d * 9)):
        i = _rng.integers(0, len(pops) - 600)
        pops[i:i + 600] += hp(noise(600 / SR), 1500) * np.exp(-np.arange(600) / 60) * _rng.uniform(0.2, 1)
    return norm(base, 0.05) + pops * 0.07


def birds(d):
    x = np.zeros(int(d * SR))
    for _ in range(int(d * 1.2)):
        t0 = _rng.uniform(0, max(0.01, d - 0.5)); f = _rng.uniform(2300, 3800)
        for k in range(_rng.integers(2, 5)):
            dd = _rng.uniform(0.04, 0.09)
            place(x, sweep(f, f * _rng.uniform(1.2, 1.5), dd) * np.sin(np.pi * tt(dd) / dd), t0 + k * 0.11)
    return x * 0.07


def wind(d):
    t = tt(d)
    return norm(bp(noise(d), 180, 900), 1) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.23 * t + 1)) * 0.07


def tick():
    t = tt(0.04); return norm(hp(noise(0.04), 2500) * np.exp(-t * 220), 0.3)


def click():
    t = tt(0.08)
    return norm(hp(noise(0.08), 1500) * np.exp(-t * 150) + 0.5 * np.sin(2 * np.pi * 300 * t) * np.exp(-t * 60), 0.6)


def chew(d):
    t = tt(d)
    e = np.maximum(0, np.sin(2 * np.pi * 4.5 * t)) ** 3
    return lp(noise(d), 900) * e * 0.18


def squish():
    t = tt(0.35)
    x = bp(noise(0.35), 250, 1400) * np.sin(np.pi * t / 0.35) * (1 + 0.6 * np.sin(2 * np.pi * 25 * t))
    return norm(x, 0.4)


def boing(f=200):
    t = tt(0.7)
    fr = f + 110 * np.sin(2 * np.pi * 11 * t) * np.exp(-4 * t) + 80 * t
    return norm(np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-3.5 * t), 0.45)


def sparkle():
    x = np.zeros(int(0.9 * SR))
    for k, n in enumerate((84, 88, 91, 96, 100)):
        place(x, ding(midi(n), 0.5), k * 0.06, 0.6)
    return norm(x, 0.35)


def scribble(d):
    t = tt(d)
    strokes = np.abs(np.sin(2 * np.pi * 3.3 * t + np.sin(2 * np.pi * 1.1 * t) * 2)) ** 2
    return bp(noise(d), 2000, 6500) * strokes * 0.1


def step():
    t = tt(0.12); return norm(lp(noise(0.12), 180) * np.exp(-t * 35), 0.35)


def steps(d, every=0.35):
    x = np.zeros(int(d * SR))
    for k in range(int(d / every)): place(x, step(), k * every)
    return x


def growl():
    t = tt(0.9)
    x = np.sin(2 * np.pi * np.cumsum(70 + 25 * np.sin(2 * np.pi * 3 * t)) / SR) * (0.5 + 0.5 * np.sin(2 * np.pi * 9 * t))
    return norm((x + 0.5 * lp(noise(0.9), 220)) * np.sin(np.pi * t / 0.9), 0.5)


def scratch():
    t = tt(0.45)
    f = 900 + 700 * np.sin(2 * np.pi * 2.2 * t)
    x = bp(noise(0.45), 800, 4000) * 0.5 + np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.3
    return norm(x * np.sin(np.pi * t / 0.45), 0.5)


def heartbeat():
    x = np.zeros(int(0.7 * SR))
    th = lambda: sweep(70, 40, 0.18) * np.exp(-tt(0.18) * 20)
    place(x, th(), 0); place(x, th() * 0.7, 0.24)
    return norm(x, 0.6)


def riser(d=1.5):
    t = tt(d)
    return norm(hp(noise(d), 1500) * (t / d) ** 2 + 0.4 * sweep(200, 900, d, 2) * (t / d) ** 2, 0.4)


def rub(d):
    t = tt(d)
    return bp(noise(d), 500, 1800) * (0.5 + 0.5 * np.sin(2 * np.pi * 8 * t)) * 0.15


def thud():
    t = tt(0.4); return norm(sweep(110, 40, 0.4) * np.exp(-t * 12) + lp(noise(0.4), 400) * np.exp(-t * 25), 0.7)


def scurry(d):
    x = np.zeros(int(d * SR))
    for k in range(int(d / 0.06)): place(x, tick(), k * 0.06, 0.5)
    return x


# ---------------- música ----------------
def marimba(f, d=0.6, a=1.0):
    t = tt(d)
    return a * (np.sin(2 * np.pi * f * t) * np.exp(-6 * t) + 0.25 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-16 * t)) \
        * np.minimum(1, t * 300)


def bassn(f, d=0.6):
    t = tt(d)
    x = np.tanh(1.5 * (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)))
    return x * np.exp(-2.2 * t) * np.minimum(1, t * 200)


def pad(freqs, d):
    t = tt(d)
    x = sum(np.sin(2 * np.pi * f * k * t * (1 + det)) / k for f in freqs for k in range(1, 6) for det in (-0.003, 0.003))
    env = np.minimum(1, t / 0.6) * np.minimum(1, (d - t) / 0.6)
    return lp(x, 1400) * env * 0.12


def kick():
    t = tt(0.3); return sweep(140, 45, 0.3, 0.3) * np.exp(-t * 14)


def snap():
    t = tt(0.15); return bp(noise(0.15), 1200, 5000) * np.exp(-t * 30) * 0.5


def hat():
    t = tt(0.05); return hp(noise(0.05), 7000) * np.exp(-t * 90) * 0.25


def tom(f=110):
    t = tt(0.4); return sweep(f, f * 0.55, 0.4, 0.5) * np.exp(-t * 9)


BEAT = 60 / 100
PROG = [(48, (60, 64, 67)), (45, (57, 60, 64)), (41, (53, 57, 60)), (43, (55, 59, 62))]  # C Am F G
ARP = [0, 1, 2, 1, 0, 2, 1, 2]


def m_playful(D, seed=0):
    x = np.zeros(int((D + 2) * SR)); bar = 4 * BEAT; r = np.random.default_rng(seed)
    for b in range(int(D / bar) + 1):
        root, ch = PROG[b % 4]; t0 = b * bar
        for beat in (0, 2): place(x, bassn(midi(root), BEAT * 1.8), t0 + beat * BEAT, 0.5)
        for k in range(8):
            n = ch[ARP[(k + b) % 8]] + (12 if (k == 7 and b % 2) else 0)
            place(x, marimba(midi(n + 12), 0.5), t0 + k * BEAT / 2, 0.32)
        if b % 2 == 1:
            for k, n in enumerate(r.choice([[0, 2, 4], [4, 2, 0], [0, 4, 7]])):
                place(x, marimba(midi(ch[0] + 24 + n), 0.4), t0 + (5 + k * 0.5) * BEAT, 0.18)
        for beat in range(4):
            place(x, kick(), t0 + beat * BEAT, 0.45 if beat in (0, 2) else 0.0)
            if beat in (1, 3): place(x, snap(), t0 + beat * BEAT, 0.6)
        for k in range(8): place(x, hat(), t0 + k * BEAT / 2, 0.5)
    return x[:int(D * SR)]


def m_emotional(D):
    x = np.zeros(int((D + 4) * SR)); bar = 8 * BEAT
    prog = [(45, (57, 60, 64)), (41, (53, 57, 60)), (48, (55, 60, 64)), (43, (55, 59, 62))]
    for b in range(int(D / bar) + 1):
        root, ch = prog[b % 4]; t0 = b * bar
        place(x, pad([midi(n) for n in ch], bar + 0.6), t0, 1.0)
        place(x, bassn(midi(root), bar) * 0.8, t0, 0.35)
        for k, n in enumerate((ch[2] + 12, ch[1] + 12, ch[0] + 12, ch[1] + 12)):
            place(x, marimba(midi(n + 12), 1.2), t0 + k * 2 * BEAT, 0.16)
    return x[:int(D * SR)]


def m_tension(D):
    t = tt(D)
    drone = lp(sum(np.sign(np.sin(2 * np.pi * f * t)) for f in (midi(33), midi(33) * 1.004)), 260) * 0.12
    drone *= 0.7 + 0.3 * np.sin(2 * np.pi * 0.25 * t)
    x = drone.copy()
    for k in range(int(D / BEAT) + 1):
        place(x, kick(), k * BEAT, 0.35 if k % 2 == 0 else 0.15)
        place(x, tick(), k * BEAT + BEAT / 2, 0.4)
    for k in range(int(D / (4 * BEAT)) + 1):
        place(x, marimba(midi(81), 1.0), k * 4 * BEAT, 0.1)
        place(x, marimba(midi(82), 1.0), k * 4 * BEAT + 2 * BEAT, 0.1)
    return x[:int(D * SR)]


def m_tribal(D):
    x = np.zeros(int((D + 2) * SR)); bar = 4 * BEAT
    pent = [57, 60, 62, 64, 67]
    for b in range(int(D / bar) + 1):
        t0 = b * bar
        for k, (pos, f) in enumerate(((0, 100), (1.5, 130), (2, 100), (3, 160), (3.5, 130))):
            place(x, tom(f), t0 + pos * BEAT, 0.6)
        place(x, bassn(midi(45), BEAT * 3), t0, 0.45)
        for k in range(4):
            place(x, marimba(midi(pent[(b * 3 + k * 2) % 5] + 12), 0.4), t0 + k * BEAT + BEAT / 2, 0.22)
        for k in range(8): place(x, hat(), t0 + k * BEAT / 2, 0.4)
    return x[:int(D * SR)]


MOODS = {'playful': m_playful, 'emotional': m_emotional, 'tension': m_tension, 'tribal': m_tribal}
