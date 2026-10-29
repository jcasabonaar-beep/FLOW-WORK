// Jefe de oficina: mueve cada video por las etapas y respeta pausas y paradas
const store = require('./store');
const capture = require('../workers/capture');
const director = require('../workers/director');
const flow = require('../workers/flow');
const editor = require('../workers/editor');

const STAGES = ['capture', 'director', 'frames', 'review_frames', 'clips', 'editor', 'review_final', 'done'];
const STAGE_WORKER = { capture: 'capture', director: 'director', frames: 'frames', clips: 'clips', editor: 'editor' };
const active = new Set();
let flowBusy = false; // un solo Chrome: los trabajadores de Flow van de uno en uno

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
    while (flowBusy) await wait(2000);
    flowBusy = true;
  }
  store.setWorker(job, worker, { state: 'working', startedAt: Date.now(), action: 'Empezando…' });
  const t0 = Date.now();
  let r = 'ok';
  try {
    if (stage === 'capture') r = await capture.run(job);
    if (stage === 'director') { await director.run(job); await capture.extractRefs(job); }
    if (stage === 'frames') r = await flow.runFrames(job);
    if (stage === 'clips') r = await flow.runClips(job);
    if (stage === 'editor') await editor.run(job);
  } finally {
    if (worker === 'frames' || worker === 'clips') flowBusy = false;
  }
  job.timings[stage] = (job.timings[stage] || 0) + (Date.now() - t0);
  if (r === 'wait') { job.status = 'waiting_you'; store.save(job); return 'stop'; }
  store.setWorker(job, worker, { state: 'done', action: '', endedAt: Date.now() });
  job.stage = STAGES[STAGES.indexOf(stage) + 1];
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
    while ((await step(job)) === 'next');
  } catch (e) {
    const w = STAGE_WORKER[job.stage];
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

module.exports = { drive, STAGES, active, resumeAll };
