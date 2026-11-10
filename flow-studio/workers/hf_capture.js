// 🎞️ HIGGSFIELD · REFERENCIA: descarga el reel (Instagram o TikTok), guarda su descripción,
// saca frames a 2 fps más los cambios de escena y monta las hojas de contactos con la marca de tiempo.
const fs = require('fs');
const path = require('path');
const store = require('../lib/store');
const config = require('../config.json');
const { exec, ffmpeg, duration } = require('../lib/ff');

const W = 'hf_capture';
const rel = (job, p) => path.relative(store.jobDir(job.id), p).replace(/\\/g, '/');
const tname = (t) => t.toFixed(1).padStart(5, '0'); // 3.5 → "003.5"

function platform(url) {
  if (/instagram\.com/i.test(url)) return 'instagram';
  if (/tiktok\.com/i.test(url)) return 'tiktok';
  return url ? 'otro' : 'archivo';
}

// Python: en Windows suele ser "python"; en Mac/Linux "python3"
async function python(args) {
  try { return await exec(config.python || 'python', args); } catch (e) {
    if (!/ENOENT/.test(e.message) || config.python) throw e;
    return exec('python3', args);
  }
}

async function download(job, ref) {
  const out = path.join(ref, 'video.mp4');
  if (fs.existsSync(out)) return out;
  // Subido a mano desde el panel
  const uploaded = fs.readdirSync(ref).find((f) => /^upload\./.test(f));
  if (uploaded) {
    await ffmpeg(['-i', path.join(ref, uploaded), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac', out]);
    store.log(job, W, '📥 Uso el video que subiste');
    return out;
  }
  if (!job.url) return null;
  const base = ['-f', 'mp4/bv*+ba/b', '--merge-output-format', 'mp4', '--write-info-json', '--no-playlist', '-o', path.join(ref, 'video.%(ext)s')];
  const cookies = ['--cookies-from-browser', `chrome:${path.join(store.ROOT, 'chrome-profile')}`];
  store.log(job, W, `Descargando la referencia de ${job.hf.platform}…`);
  const attempts = [[], cookies]; // primero sin sesión; si la pide, con las cookies del Chrome
  let last = '';
  for (const extra of attempts) {
    try {
      await exec('yt-dlp', [...extra, ...base, job.url]);
      if (fs.existsSync(out)) return out;
    } catch (e) {
      last = e.message.split('\n').filter(Boolean).slice(-2).join(' ');
      if (!extra.length) store.log(job, W, 'Pide sesión: lo intento con las cookies del Chrome de Flow Studio…');
    }
  }
  store.log(job, W, '⚠️ No se pudo descargar: ' + last.slice(0, 300));
  return null;
}

// Descripción original (si yt-dlp la pudo leer)
function readInfo(job, ref) {
  const f = path.join(ref, 'video.info.json');
  if (!fs.existsSync(f)) return;
  try {
    const i = JSON.parse(fs.readFileSync(f, 'utf8'));
    job.hf.refInfo = { uploader: i.uploader || i.channel || '', views: i.view_count || null, likes: i.like_count || null, comments: i.comment_count || null, title: i.title || '' };
    if (i.description) {
      fs.writeFileSync(path.join(ref, 'description.txt'), i.description);
      job.hf.description = i.description;
      store.log(job, W, `📝 Descripción original guardada (${i.description.length} caracteres)`);
    }
  } catch {}
}

// Momentos en los que cambia el plano
async function sceneTimes(video) {
  const { err } = await exec('ffmpeg', ['-hide_banner', '-i', video, '-vf', `select='gt(scene,${config.higgsfield.sceneThreshold || 0.3})',showinfo`, '-an', '-f', 'null', '-']);
  return [...err.matchAll(/pts_time:([\d.]+)/g)].map((m) => +(+m[1]).toFixed(2)).slice(0, 40);
}

const label = (t) => `${Math.floor(t)}.${Math.round((t % 1) * 10) % 10}s`;

async function run(job) {
  const dir = store.jobDir(job.id);
  const ref = path.join(dir, 'ref');
  fs.mkdirSync(ref, { recursive: true });
  job.hf.platform = platform(job.url);

  const video = await download(job, ref);
  if (!video) {
    store.setWorker(job, W, { state: 'waiting_you', action: 'No pude descargar el reel. Súbelo tú abajo, en "Referencia": sigo solo en cuanto llegue.' });
    return 'wait';
  }
  readInfo(job, ref);
  const dur = await duration(video);
  job.hf.refDuration = +dur.toFixed(2);
  store.log(job, W, `Video de referencia: ${dur.toFixed(1)} s`);

  // Limpia lo de una pasada anterior
  for (const sub of ['f2', 'scene', 'sheet']) fs.rmSync(path.join(ref, sub), { recursive: true, force: true });
  for (const sub of ['f2', 'scene', 'sheet']) fs.mkdirSync(path.join(ref, sub));
  fs.copyFileSync(path.join(store.ROOT, 'fonts', 'Montserrat-ExtraBold.ttf'), path.join(ref, 'font.ttf'));

  // 1) Frames a 2 fps (720 px de ancho, para que Claude los mire de cerca)
  store.setWorker(job, W, { action: 'Sacando frames a 2 fps…' });
  const fps = config.higgsfield.framesPerSecond || 2;
  await ffmpeg(['-i', video, '-vf', `fps=${fps},scale=720:-2`, '-q:v', '3', path.join(ref, 'f2', 'raw_%04d.jpg')]);
  const frames = [];
  for (const f of fs.readdirSync(path.join(ref, 'f2')).filter((x) => /^raw_\d+\.jpg$/.test(x)).sort()) {
    const t = (parseInt(f.slice(4, 8), 10) - 1) / fps;
    const dest = path.join(ref, 'f2', `t_${tname(t)}.jpg`);
    fs.renameSync(path.join(ref, 'f2', f), dest);
    frames.push({ t: +t.toFixed(2), file: rel(job, dest) });
  }

  // 2) Cambios de escena
  store.setWorker(job, W, { action: 'Buscando los cambios de escena…' });
  const scenes = [];
  for (const t of await sceneTimes(video)) {
    if (frames.some((f) => Math.abs(f.t - t) < 0.15)) { scenes.push({ t, file: frames.find((f) => Math.abs(f.t - t) < 0.15).file }); continue; }
    const dest = path.join(ref, 'scene', `s_${tname(t)}.jpg`);
    await ffmpeg(['-ss', String(t), '-i', video, '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '3', dest]);
    if (fs.existsSync(dest)) scenes.push({ t, file: rel(job, dest) });
  }
  store.log(job, W, `🎞️ ${frames.length} frames a ${fps} fps y ${scenes.length} cambios de escena`);

  // 3) Hojas de contactos: 5x4 miniaturas por hoja, cada una con su segundo; los cambios de escena en rojo con ✂
  store.setWorker(job, W, { action: 'Montando las hojas de contactos…' });
  const all = [...frames.map((f) => ({ ...f, cut: scenes.some((s) => s.file === f.file) })),
    ...scenes.filter((s) => !frames.some((f) => f.file === s.file)).map((s) => ({ ...s, cut: true }))].sort((a, b) => a.t - b.t);
  const tiles = path.join(ref, 'sheet', 'tiles');
  fs.mkdirSync(tiles);
  for (let i = 0; i < all.length; i++) {
    const f = all[i];
    const txt = (f.cut ? 'CORTE ' : '') + label(f.t);
    await ffmpeg(['-i', path.join(dir, f.file), '-vf',
      `scale=240:-2,drawtext=fontfile=font.ttf:text='${txt}':x=6:y=6:fontsize=24:fontcolor=${f.cut ? 'white' : 'yellow'}:box=1:boxcolor=${f.cut ? 'red@0.85' : 'black@0.6'}`,
      '-q:v', '4', path.join('sheet', 'tiles', `${String(i + 1).padStart(4, '0')}.jpg`)], { cwd: ref });
  }
  await ffmpeg(['-framerate', '1', '-i', path.join('sheet', 'tiles', '%04d.jpg'), '-vf', 'tile=5x4:padding=4:color=black', '-q:v', '4', path.join('sheet', 'sheet_%02d.jpg')], { cwd: ref });
  fs.rmSync(tiles, { recursive: true, force: true });
  const sheets = fs.readdirSync(path.join(ref, 'sheet')).filter((f) => /^sheet_\d+\.jpg$/.test(f)).sort().map((f) => `ref/sheet/${f}`);
  Object.assign(job.hf, { frames, scenes, sheets });
  store.log(job, W, `✅ ${sheets.length} hoja(s) de contactos listas`);

  // 4) Lo que dice (si habla a cámara). Opcional: si falta faster-whisper, sigo sin eso
  store.setWorker(job, W, { action: 'Escuchando lo que dice la referencia…' });
  try {
    const out = path.join(ref, 'words.json');
    await python([path.join(store.ROOT, 'tools', 'transcribe.py'), video, out, 'en']);
    const words = JSON.parse(fs.readFileSync(out, 'utf8'));
    job.hf.transcript = words.map((w) => w.w).join(' ').trim();
    if (job.hf.transcript) store.log(job, W, `🎧 Transcripción: "${job.hf.transcript.slice(0, 120)}${job.hf.transcript.length > 120 ? '…' : ''}"`);
  } catch (e) {
    store.log(job, W, '⚠️ Sin transcripción (sigo sin eso): ' + e.message.split('\n').filter(Boolean).pop().slice(0, 120));
  }
  store.save(job);
  return 'ok';
}

// Saca a tamaño completo el frame de la referencia que sirve de base para cada keyframe
async function extractKeyframeRefs(job) {
  const dir = store.jobDir(job.id);
  const a = job.hf.analysis;
  if (!a || !a.keyframes) return;
  for (const k of a.keyframes.items) {
    const out = path.join(dir, 'ref', `kf_${k.role}.jpg`);
    const t = Math.max(0, Math.min((job.hf.refDuration || 1) - 0.05, Number(k.ref_time) || 0));
    await ffmpeg(['-ss', String(t), '-i', path.join(dir, 'ref', 'video.mp4'), '-frames:v', '1', '-q:v', '2', out]);
    k.ref_file = rel(job, out);
  }
  store.save(job);
}

module.exports = { run, extractKeyframeRefs, platform };
