// 🖼️ FRAMES y 🎥 CLIPS: trabajadores que manejan Google Flow en tu Chrome
const fs = require('fs');
const path = require('path');
const store = require('../lib/store');
const claude = require('../lib/claude');
const config = require('../config.json');
const { fill } = require('./director');
const { ffmpeg } = require('../lib/ff');

const pad = (n) => String(n).padStart(2, '0');
const abs = (job, rel) => path.join(store.jobDir(job.id), rel);
const avatarImgs = () => config.avatar.images.map((i) => path.join(store.ROOT, i));

function clipPromptFor(c, job) {
  const lang = config.languages[(job && job.language) || config.language];
  return c.clipPrompt.replace(/\{\{LINE\}\}/g, `"${c.line}"`)
    .replace(/Spoken in (English|Spanish) with an? [\w ]*?accent/i, lang.speech);
}

// Qué imágenes se suben para cada frame
function frameInputs(job, c) {
  const [front, table] = avatarImgs();
  const ref = abs(job, c.ref);
  // Libro: en la mano usa una foto de la señora con el libro; en la mesa, la portada
  const inHand = (config.product.bookInHand || []).map((f) => path.join(store.ROOT, f)).filter((f) => fs.existsSync(f));
  const cover = path.join(store.ROOT, config.product.cover);
  const bookImg = c.book === 'hand' && inHand.length ? inHand[c.n % inHand.length] : cover;
  const book = c.book && fs.existsSync(bookImg) ? [bookImg] : [];
  if (c.feedback && c.frame) return [abs(job, c.frame), front, ...book];
  // Flow rechaza las capturas con personas reales: por defecto la pose va descrita en el prompt
  const refs = config.uploadReference ? [ref] : [];
  if (c.frameMode === 1) return [...refs, front, table, ...book];
  const first = job.clips[0];
  return [...refs, first.frame ? abs(job, first.frame) : table, front, ...book];
}
const L = 'ABCDE';

function frameTask(job, c) {
  const dest = abs(job, `frames/frame_${pad(c.n)}.png`);
  const imgs = frameInputs(job, c);
  if (c.feedback && c.frame) {
    return { dest, text: `### Frame ${c.n} — CORRECTION\nUpload in this order: ${imgs.map((p, i) => `Image ${L[i]} = ${p}`).join(' ; ')}\n` +
      `The producer wants this change (translate it to a clear English instruction for the image model): "${c.feedback}".\n` +
      `Prompt: "Edit Image A: <the change in English>. Use Image B to keep the face and the sweater exactly as the avatar. Keep everything else the same."\n` +
      `Then download and save to: ${dest}` };
  }
  return { dest, text: `### Frame ${c.n}\nUpload in this order: ${imgs.map((p, i) => `Image ${L[i]} = ${p}`).join(' ; ')}\n` +
    `Paste this prompt exactly:\n\`\`\`\n${c.framePrompt}\n\`\`\`\nThen download and save to: ${dest}` };
}

function clipTask(job, c) {
  const dest = abs(job, `clips/clip_${pad(c.n)}.mp4`);
  return { dest, text: `### Clip ${c.n}\nMode: frames to video (start frame only). Start frame = ${abs(job, c.frame)}\n` +
    `Paste this prompt exactly:\n\`\`\`\n${clipPromptFor(c, job)}\n\`\`\`\nThen download the video (MP4, best quality, with audio) and save to: ${dest}` };
}

function operatorPrompt(job, role, model, tasks, statusFile, extra = '') {
  return fill(fs.readFileSync(path.join(store.ROOT, 'prompts', 'flow_operator.md'), 'utf8'), {
    ROLE: role, FLOW_URL: config.flowUrl, STATUS_FILE: statusFile, PROJECT: job.title.slice(0, 40),
    MODEL: model, GRAB: path.join(store.ROOT, 'tools', 'grab-latest.js'), RETRIES: config.maxFrameRetries,
    TASKS: extra + tasks.map((t) => t.text).join('\n\n'),
  });
}

function readStatus(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { items: {}, blocked: null }; }
}

async function session(job, worker, role, model, list, makeTask, extra) {
  const statusFile = abs(job, `${worker === 'frames' ? 'frames' : 'clips'}/status.json`);
  const tasks = list.map((c) => makeTask(job, c));
  const prev = readStatus(statusFile);
  fs.writeFileSync(statusFile, JSON.stringify({ items: prev.items || {}, blocked: null }, null, 2));
  const prompt = operatorPrompt(job, role, model, tasks, statusFile, extra);
  await claude.run({
    job, worker, prompt, browser: true, cwd: store.ROOT,
    tools: ['Read', 'Write', 'Bash(node:*)'],
  });
  return readStatus(statusFile);
}

// Genera los frames pendientes. Devuelve 'ok' | 'wait'
async function runFrames(job) {
  // Clips ya hechos: se usan tal cual (frame = su primer fotograma)
  for (const c of job.clips) {
    const src = c.readyClip && path.join(store.ROOT, 'product', 'clips', path.basename(c.readyClip));
    if (src && fs.existsSync(src) && c.frameStatus === 'pending') {
      const frame = `frames/frame_${pad(c.n)}.png`;
      const clip = `clips/clip_${pad(c.n)}.mp4`;
      await ffmpeg(['-i', src, '-frames:v', '1', abs(job, frame)]);
      fs.copyFileSync(src, abs(job, clip));
      Object.assign(c, { frame, frameStatus: 'done', frameNote: 'Clip ya hecho, se usa tal cual', clip, clipStatus: 'done', v: Date.now() });
      store.log(job, 'frames', `🎬 Clip ${c.n}: uso ${path.basename(src)} tal cual`);
    }
  }
  // Frames "tal cual": el director puede usar directamente una foto del libro en mano
  for (const c of job.clips) {
    if (c.frameFrom && ['pending'].includes(c.frameStatus)) {
      const src = path.join(store.ROOT, 'product', path.basename(c.frameFrom));
      if (fs.existsSync(src)) {
        const dest = `frames/frame_${pad(c.n)}.png`;
        fs.copyFileSync(src, abs(job, dest));
        Object.assign(c, { frame: dest, frameStatus: 'done', frameNote: 'Foto del libro usada tal cual', v: Date.now() });
        store.log(job, 'frames', `📗 Frame ${c.n}: uso ${path.basename(src)} tal cual`);
      }
    }
  }
  store.save(job);
  const todo = job.clips.filter((c) => ['pending', 'regen'].includes(c.frameStatus));
  if (!todo.length) return job.clips.some((c) => c.frameStatus === 'manual') ? 'wait' : 'ok';
  if (config.flowMode !== 'auto') return manual(job, 'frames', todo);

  const first = todo.find((c) => c.n === 1);
  const rest = todo.filter((c) => c.n !== 1);
  const batches = first ? [[first], rest] : [rest]; // el frame 1 va antes: los demás lo usan como referencia
  for (const batch of batches) {
    if (!batch.length) continue;
    store.setWorker(job, 'frames', { action: `Generando frames ${batch.map((c) => c.n).join(', ')} en Flow…` });
    const st = await session(job, 'frames', 'FRAMES worker', `${config.frameModel} (image generation)`, batch, frameTask);
    if (st.blocked) return blocked(job, 'frames', st.blocked);
    for (const c of batch) {
      const dest = `frames/frame_${pad(c.n)}.png`;
      const it = (st.items || {})[c.n] || {};
      if (fs.existsSync(abs(job, dest))) {
        if (it.prompt && !c.feedback) c.framePrompt = it.prompt;
        Object.assign(c, { frame: dest, frameStatus: it.ok === false ? 'doubt' : 'done', frameNote: it.note || '', feedback: '', v: Date.now() });
      } else {
        Object.assign(c, { frameStatus: 'manual', frameNote: it.refused
          ? `Flow lo rechazó 4 veces (también con el prompt simple). ${it.note || ''} Corrige el prompt y pulsa Reintentar, o sube tu frame.`
          : (it.note || 'No se pudo generar automáticamente') + ' — corrige el prompt y pulsa Reintentar, o sube tu frame.' });
        if (it.prompt) c.framePrompt = it.prompt;
      }
    }
    store.save(job);
  }
  return job.clips.some((c) => c.frameStatus === 'manual') ? 'wait' : 'ok';
}

async function runClips(job) {
  const todo = job.clips.filter((c) => ['pending', 'regen'].includes(c.clipStatus));
  if (!todo.length) return job.clips.some((c) => c.clipStatus === 'manual') ? 'wait' : 'ok';
  if (config.flowMode !== 'auto') return manual(job, 'clips', todo);
  store.setWorker(job, 'clips', { action: `Animando ${todo.length} clips en Flow…` });
  const extra = 'Submit ALL clips first (Flow can generate several at once), then download each one as soon as it is ready. Quality check for clips: the voice must speak the whole line, the face stays the avatar, no text on screen.\n\n';
  const st = await session(job, 'clips', 'CLIPS worker', `${config.clipModel} (video)`, todo, clipTask, extra);
  if (st.blocked) return blocked(job, 'clips', st.blocked);
  for (const c of todo) {
    const dest = `clips/clip_${pad(c.n)}.mp4`;
    const it = (st.items || {})[c.n] || {};
    if (it.line && it.prompt) { c.line = it.line; }
    if (it.prompt) c.clipPrompt = it.prompt.includes(c.line) ? it.prompt.replace(`"${c.line}"`, '{{LINE}}') : c.clipPrompt;
    if (fs.existsSync(abs(job, dest))) Object.assign(c, { clip: dest, clipStatus: 'done', clipNote: it.note || '', v: Date.now() });
    else Object.assign(c, { clipStatus: 'manual', clipNote: 'No se pudo generar automáticamente: súbelo tú' });
  }
  store.save(job);
  return job.clips.some((c) => c.clipStatus === 'manual') ? 'wait' : 'ok';
}

function manual(job, worker, todo) {
  const key = worker === 'frames' ? 'frameStatus' : 'clipStatus';
  for (const c of todo) c[key] = 'manual';
  store.setWorker(job, worker, { state: 'waiting_you', action: 'Modo manual: copia cada prompt, genera en Flow y arrastra el resultado a su casilla.' });
  return 'wait';
}

function blocked(job, worker, why) {
  store.log(job, worker, '⛔ Flow pide algo que no puedo hacer: ' + why);
  store.setWorker(job, worker, { state: 'waiting_you', action: '⛔ ' + why + ' — resuélvelo en Chrome y pulsa "Reanudar".' });
  return 'wait';
}

module.exports = { runFrames, runClips, clipPromptFor, frameInputs };
