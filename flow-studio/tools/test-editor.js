// Prueba del editor sin Flow: crea 3 clips falsos y monta el video final
// Uso: npm run test-editor
const path = require('path');
const store = require('../lib/store');
const { ffmpeg } = require('../lib/ff');
const editor = require('../workers/editor');

(async () => {
  const job = store.create({ title: 'Prueba del editor', script: 'test', ctaWord: 'BOOK' });
  const dir = store.jobDir(job.id);
  const lines = [
    'This is what your gut looks like inside, and this is all that comes out',
    'Warm some milk in a pot, add a teaspoon of turmeric and half a cinnamon stick',
    'Comment BOOK and I will send it to you personally',
  ];
  job.plan = { hook: 'This is your *gut*', ctaWord: 'BOOK' };
  job.clips = [];
  for (let i = 0; i < lines.length; i++) {
    const out = `clips/clip_0${i + 1}.mp4`;
    // 0.6 s de silencio, 5 s de "voz" (tono), 2.4 s de silencio
    await ffmpeg(['-f', 'lavfi', '-i', `color=c=0x${['335577', '553344', '335533'][i]}:s=720x1280:d=8:r=24`,
      '-f', 'lavfi', '-i', 'sine=f=220:d=5', '-filter_complex', '[1:a]adelay=600|600,apad=whole_dur=8[a]',
      '-map', '0:v', '-map', '[a]', '-t', '8', '-c:v', 'libx264', '-c:a', 'aac', path.join(dir, out)]);
    job.clips.push({ n: i + 1, line: lines[i], clip: out, clipStatus: 'done', frameStatus: 'done' });
  }
  job.stage = 'review_final';
  job.status = 'waiting_you';
  await editor.run(job);
  store.save(job);
  console.log('OK → ' + path.join(dir, 'edit', 'final.mp4'));
})().catch((e) => { console.error(e); process.exit(1); });
