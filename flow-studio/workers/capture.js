// 🎞️ CAPTURADOR: descarga el reel y prepara las hojas de contacto para el director
const fs = require('fs');
const path = require('path');
const store = require('../lib/store');
const { exec, ffmpeg, duration } = require('../lib/ff');

async function download(job, dir) {
  const out = path.join(dir, 'ref', 'video.mp4');
  if (fs.existsSync(out)) return out;
  const uploaded = fs.readdirSync(path.join(dir, 'ref')).find((f) => /^upload\./.test(f));
  if (uploaded) {
    await ffmpeg(['-i', path.join(dir, 'ref', uploaded), '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', out]);
    return out;
  }
  if (!job.url) return null;
  store.log(job, 'capture', 'Descargando el reel de Instagram…');
  try {
    await exec('yt-dlp', ['-f', 'mp4/bv*+ba/b', '--merge-output-format', 'mp4', '-o', out, job.url]);
  } catch (e) {
    store.log(job, 'capture', '⚠️ No se pudo descargar: ' + e.message.split('\n').slice(-2).join(' '));
    return null;
  }
  return fs.existsSync(out) ? out : null;
}

// Referencias ya trabajadas: si el link es el mismo, se reutiliza todo (video, hojas, fotogramas y tono)
function cacheDir(job) {
  const m = (job.url || '').match(/instagram\.com\/(?:reel|reels|p)\/([\w-]+)/i);
  return m ? path.join(store.ROOT, 'cache', 'refs', m[1]) : null;
}
const copyDir = (from, to) => { fs.mkdirSync(to, { recursive: true }); for (const f of fs.readdirSync(from)) fs.copyFileSync(path.join(from, f), path.join(to, f)); };

async function run(job) {
  const dir = store.jobDir(job.id);
  const cache = cacheDir(job);
  if (cache && fs.existsSync(path.join(cache, 'video.mp4')) && fs.existsSync(path.join(cache, 'info.json'))) {
    copyDir(cache, path.join(dir, 'ref'));
    const info = JSON.parse(fs.readFileSync(path.join(cache, 'info.json'), 'utf8'));
    Object.assign(job, { refDuration: info.refDuration, sheets: info.sheets });
    store.log(job, 'capture', '♻️ Esta referencia ya la tenía: reutilizo el video, las capturas y el análisis del tono');
    return 'ok';
  }
  const video = await download(job, dir);
  if (!video) {
    store.setWorker(job, 'capture', { state: 'waiting_you', action: 'No pude descargar el reel. Arrastra el video al panel (botón "Subir referencia").' });
    return 'wait';
  }
  const dur = await duration(video);
  store.log(job, 'capture', `Video de referencia: ${dur.toFixed(1)} s`);

  // Hojas de contacto: 1 miniatura cada 2 segundos (menos imágenes = menos gasto), 4x3 por hoja, con el segundo escrito
  fs.copyFileSync(path.join(store.ROOT, 'fonts', 'Montserrat-ExtraBold.ttf'), path.join(dir, 'ref', 'font.ttf'));
  await ffmpeg(['-i', 'video.mp4', '-vf',
    "fps=1/2,scale=300:-2,drawtext=fontfile=font.ttf:text='%{eif\\:t\\:d}s':x=8:y=8:fontsize=34:fontcolor=yellow:box=1:boxcolor=black@0.6,tile=4x3:padding=4",
    '-q:v', '4', 'sheet_%02d.jpg'], { cwd: path.join(dir, 'ref') });
  const sheets = fs.readdirSync(path.join(dir, 'ref')).filter((f) => /^sheet_\d+\.jpg$/.test(f)).sort();
  // Fotogramas a tamaño completo cada 2 s (el director mide la composición en ellos)
  await ffmpeg(['-i', 'video.mp4', '-vf', 'fps=1/2,scale=720:-2', '-q:v', '3', 'full_%03d.jpg'], { cwd: path.join(dir, 'ref') });
  for (const f of fs.readdirSync(path.join(dir, 'ref')).filter((x) => /^full_\d+\.jpg$/.test(x))) {
    const sec = (parseInt(f.slice(5, 8), 10) - 1) * 2;
    fs.renameSync(path.join(dir, 'ref', f), path.join(dir, 'ref', `sec_${String(sec).padStart(3, '0')}.jpg`));
  }
  job.refDuration = dur;
  job.sheets = sheets;
  store.log(job, 'capture', `✅ ${sheets.length} hojas de contacto listas para el director`);

  // Cómo habla la referencia (ritmo, energía, tono) para imitarlo y mejorarlo
  store.setWorker(job, 'capture', { action: 'Escuchando cómo habla la referencia…' });
  try {
    await exec('python', [path.join(store.ROOT, 'tools', 'analyze_ref.py'), path.join(dir, 'ref', 'video.mp4'), path.join(dir, 'ref', 'tono.txt')]);
    store.log(job, 'capture', '🎧 Analizado el tono y el ritmo de la referencia');
  } catch (e) {
    store.log(job, 'capture', '⚠️ No pude analizar el audio de la referencia (sigo sin eso): ' + e.message.split('\n').pop().slice(0, 120));
  }
  if (cache) {
    copyDir(path.join(dir, 'ref'), cache);
    fs.writeFileSync(path.join(cache, 'info.json'), JSON.stringify({ refDuration: job.refDuration, sheets: job.sheets }));
  }
  return 'ok';
}

// Después del director: saca a tamaño completo el fotograma elegido para cada clip
async function extractRefs(job) {
  const dir = store.jobDir(job.id);
  for (const c of job.clips) {
    const out = path.join(dir, 'ref', `clip${String(c.n).padStart(2, '0')}.jpg`);
    const t = Math.max(0, Math.min((job.refDuration || 1) - 0.1, Number(c.refTime) + 0.4));
    await ffmpeg(['-ss', String(t), '-i', path.join(dir, 'ref', 'video.mp4'), '-frames:v', '1', '-q:v', '2', out]);
    c.ref = path.relative(dir, out).replace(/\\/g, '/');
  }
  store.log(job, 'capture', `✅ Capturas de referencia para ${job.clips.length} clips`);
}

module.exports = { run, extractRefs };
