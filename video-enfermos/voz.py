"""Genera la narración con Kokoro (TTS local) ajustada a la duración de cada escena
y la une al video. Uso: python3 voz.py [voz]   (modelo en ~/tts o $KOKORO_DIR)"""
import os, sys, subprocess
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
from scenes import SC, dur
from render import FPS, OUT

MD = os.environ.get('KOKORO_DIR', '/home/user/tts')
VOZ = sys.argv[1] if len(sys.argv) > 1 else 'em_alex'
k = Kokoro(f'{MD}/kokoro-v1.0.onnx', f'{MD}/voices-v1.0.bin')
SR = 24000
partes = []
for i, sc in enumerate(SC):
    D = round(dur(sc) * FPS) / FPS
    hueco = D - 0.35
    vel = 0.92
    while True:
        a, sr = k.create(sc['text'].replace('...', ','), voice=VOZ, speed=vel, lang='es')
        if len(a) / sr <= hueco or vel >= 1.4: break
        vel = round(vel + 0.06, 2)
    a = a[:int(D * SR) - int(0.15 * SR)]
    pista = np.zeros(int(round(D * SR)), dtype=np.float32)
    ini = int(0.15 * SR)
    pista[ini:ini + len(a)] = a
    partes.append(pista)
    print(f'{i + 1:02d} {len(a) / SR:5.2f}s / {D:5.2f}s  vel {vel}', flush=True)
voz = np.concatenate(partes)
voz = voz / max(1e-6, np.abs(voz).max()) * 0.89
wav = os.path.join(OUT, 'narracion.wav')
sf.write(wav, voz, SR)
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', os.path.join(OUT, 'video_sin_audio.mp4'), '-i', wav,
                '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', os.path.join(OUT, 'video_con_voz.mp4')],
               check=True)
print('ok')
