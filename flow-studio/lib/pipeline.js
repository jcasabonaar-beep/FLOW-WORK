// Jefe de oficina: mueve cada video por las etapas y respeta pausas y paradas
const store = require('./store');
const capture = require('../workers/capture');
const director = require('../workers/director');
const flow = require('../workers/flow');
const editor = require('../workers/editor');

const STAGES = ['capture', 'director', 'frames', 'review_frames', 'clips', 'editor', 'review_final', 'done'];
const STAGE_WORKER = { capture: 'capture', director: 'director', frames: 'frames', clips: 'clips', editor: 'editor' };
const active = new Set();
const lock = require('./lock');
const fs = require('fs');
const path = require('path');

// Guarda el video terminado en la carpeta de videos completos
function finalize(job) {
  const outName = require('../config.json').outputDir || 'output';
  const outDir = path.join(store.ROOT, outName);
  fs.mkdirSync(outDir, { recursive: true });
  const name = `${job.id}-${job.title.replace(/[^\w\- áéíóúñÁÉÍÓÚÑ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 50)}.mp4`;
  fs.copyFileSync(path.join(store.jobDir(job.id), job.output), path.join(outDir, name));
  const k = job.kit || {};
  if (k.cover && fs.existsSync(path.join(store.jobDir(job.id), k.cover))) fs.copyFileSync(path.join(store.jobDir(job.id), k.cover), path.join(outDir, name.replace(/\.mp4$/, '-portada.jpg')));
  if (k.caption) fs.writeFileSync(path.join(outDir, name.replace(/\.mp4$/, '-texto.txt')), [k.caption, '', k.hashtags || '', k.disclosure ? '\n' + k.disclosure : ''].join('\n'));
  job.stage = 'done';
  job.status = 'done';
  job.finalFile = `${outName}/${name}`;
  store.save(job);
}

// Modo "todo directo": si algún frame o clip no salió, usa el más cercano para no parar
function fillGaps(job, key) {
  const file = key === 'frame' ? 'frame' : 'clip';
  const st = key === 'frame' ? 'frameStatus' : 'clipStatus';
  let changed = false;
  for (const c of job.clips) {
    if (c[st] !== 'manual') continue;
    if (key === 'clip') { c.skip = true; c[st] = 'done'; changed = true; store.log(job, 'clips', `🌙 Clip ${c.n} no salió: lo quito del montaje para no pararme`); continue; }
    const near = [...job.clips].sort((a, b) => Math.abs(a.n - c.n) - Math.abs(b.n - c.n)).find((x) => x[file] && x.n !== c.n);
    if (!near) continue;
    const dest = `frames/frame_${String(c.n).padStart(2, '0')}.png`;
    fs.copyFileSync(path.join(store.jobDir(job.id), near[file]), path.join(store.jobDir(job.id), dest));
    Object.assign(c, { frame: dest, [st]: 'done', frameNote: `🌙 No salió: uso el frame del clip ${near.n}`, v: Date.now() });
    store.log(job, 'frames', `🌙 Frame ${c.n} no salió: uso el del clip ${near.n} para no pararme`);
    changed = true;
  }
  if (changed) store.save(job);
  return changed;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function gate(job, worker) {
  while (job.paused || job.workers[worker].paused) {
    if (job.workers[worker].state !== 'paused') store.setWorker(job, worker, { state: 'paused' });
    await wait(1000);
  }
}

async function step(job) {
  const stage = job.stage;
  const worker = STAGE_WORKER[stage];
  if (!worker) return 'stop';
  await gate(job, worker);
  if ((worker === 'frames' || worker === 'clips')) {
    if (lock.isBusy()) store.setWorker(job, worker, { state: 'idle', action: '⏳ En cola: esperando a que el Chrome de Flow quede libre' });
    await lock.acquire();
  }
  store.setWorker(job, worker, { state: 'working', startedAt: Date.now(), action: 'Empezando…' });
  const t0 = Date.now();
  let r = 'ok';
  try {
    if (stage === 'capture') r = await capture.run(job);
    if (stage === 'director') { await director.run(job); await capture.extractRefs(job); if (require('../config.json').layoutPass) await director.layout(job); }
    if (stage === 'frames') r = await flow.runFrames(job);
    if (stage === 'clips') r = await flow.runClips(job);
    if (stage === 'editor') await editor.run(job);
  } finally {
    if (worker === 'frames' || worker === 'clips') lock.release();
  }
  job.timings[stage] = (job.timings[stage] || 0) + (Date.now() - t0);
  if (r === 'wait' && job.auto && (stage === 'frames' || stage === 'clips') && fillGaps(job, stage === 'frames' ? 'frame' : 'clip')) r = 'ok';
  if (r === 'wait') { job.status = 'waiting_you'; store.save(job); return 'stop'; }
  store.setWorker(job, worker, { state: 'done', action: '', endedAt: Date.now() });
  job.stage = STAGES[STAGES.indexOf(stage) + 1];
  // Modo "todo directo": se salta las paradas y guarda el video al terminar
  if ((job.auto || job.skipReviewOnce) && job.stage === 'review_frames') { job.stage = 'clips'; job.skipReviewOnce = false; store.log(job, 'frames', job.auto ? '🌙 Modo directo: sigo sin esperar tu revisión' : '💬 Cambios del chat: sigo sin pararme'); }
  if (job.auto && job.stage === 'review_final') { finalize(job); store.log(job, 'editor', `🌙 Video guardado en "${job.finalFile}"`); return 'stop'; }
  if (job.stage === 'review_frames' || job.stage === 'review_final') job.status = 'waiting_you';
  store.save(job);
  return job.status === 'waiting_you' ? 'stop' : 'next';
}

async function drive(id) {
  if (active.has(id)) return;
  active.add(id);
  const job = store.load(id);
  try {
    job.status = 'running';
    job.error = null;
    store.save(job);
    let tries = 0;
    for (;;) {
      try {
        if ((await step(job)) !== 'next') break;
        tries = 0;
      } catch (e) {
        // Se resuelve solo: reintenta la etapa 2 veces antes de avisarte
        const w = STAGE_WORKER[job.stage];
        // Límite de uso de Claude: espera y sigue solo cuando se renueve
        if (/usage limit|limit reached|rate limit|hit your limit|out of extra usage|resets? (at|in)/i.test(e.message)) {
          job.status = 'waiting_limit';
          job.error = 'Se acabó el límite de uso de Claude. Sigo solo cuando se renueve (lo intento cada 10 min).';
          if (w) store.setWorker(job, w, { state: 'paused', action: '⏳ Esperando a que se renueve el límite de Claude' });
          store.save(job);
          await wait(10 * 60 * 1000);
          job.status = 'running';
          job.error = null;
          store.save(job);
          continue;
        }
        if (e.message === 'Detenido por ti' || tries >= 2) throw e;
        tries++;
        if (w) store.log(job, w, `⚠️ ${e.message.slice(0, 200)} — reintento ${tries}/2 en 20 s`);
        await wait(20000);
      }
    }
  } catch (e) {
    const w = STAGE_WORKER[job.stage];
    if (e.message === 'Detenido por ti') {
      job.status = 'paused';
      job.error = null;
      if (w) store.setWorker(job, w, { state: 'paused', action: '⏸ Parado por ti. Pulsa Reanudar para seguir.' });
      store.save(job);
      return;
    }
    job.status = 'error';
    job.error = e.message;
    if (w) store.setWorker(job, w, { state: e.message === 'Detenido por ti' ? 'paused' : 'error', action: e.message.slice(0, 300) });
    if (w) store.log(job, w, '❌ ' + e.message);
    store.save(job);
  } finally {
    active.delete(id);
  }
}

function resumeAll() {
  for (const j of store.list()) if (j.status === 'running') { j.status = 'stopped'; j.error = 'Se cerró el programa a mitad de trabajo: pulsa Continuar'; store.save(j); }
}

module.exports = { drive, STAGES, active, resumeAll, finalize };
