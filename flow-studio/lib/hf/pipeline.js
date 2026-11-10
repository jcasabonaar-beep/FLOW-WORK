// 🎥 Jefe de etapas del pipeline Higgsfield (Diane): referencia → análisis → keyframes → vídeo → entrega
// Cada etapa guarda su estado en job.hf y sus archivos en la carpeta del trabajo, así se puede reanudar.
const store = require('../store');
const notify = require('../notify');
const lock = require('../lock');
const config = require('../../config.json');
const { isLimit, EVERY } = require('../limit');

const STAGES = ['capture', 'analysis', 'review_analysis', 'keyframes', 'review_keyframes', 'video', 'review_video', 'post', 'review_final', 'done'];
const NAMES = {
  capture: 'Referencia', analysis: 'Análisis', review_analysis: '✋ Tu OK análisis', keyframes: 'Keyframes', review_keyframes: '✋ Tu OK keyframes',
  video: 'Vídeo', review_video: '✋ Tu OK vídeo', post: 'Entrega', review_final: '✋ Te espera', done: 'Listo',
};
const WORKER = { capture: 'hf_capture', analysis: 'hf_analyst', keyframes: 'hf_keyframes', video: 'hf_video', post: 'hf_post' };
// Paradas: qué interruptor las controla (null = siempre para)
const GATE = { review_analysis: 'analysis', review_keyframes: 'keyframes', review_video: 'video', review_final: null };
const GATE_TEXT = {
  review_analysis: 'El análisis de la referencia está listo: revísalo, corrígelo si hace falta y apruébalo',
  review_keyframes: 'Los keyframes están listos para que los revises',
  review_video: 'El vídeo está generado: revisa el informe de QA',
  review_final: 'Todo listo: vídeo, hook, overlays y descripción',
};
// Etapas que usan el Chrome (una sola generación a la vez, compartido con Flow)
const BROWSER = new Set(['keyframes', 'video']);
const RUNNERS = {
  capture: () => require('../../workers/hf_capture').run,
  analysis: () => require('../../workers/hf_analyst').run,
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const gates = (job) => ({ ...(config.higgsfield.gates || {}), ...((job.hf && job.hf.gates) || {}) });
const next = (stage) => STAGES[STAGES.indexOf(stage) + 1];

async function pauseGate(job, worker) {
  while (job.paused || job.workers[worker].paused) {
    if (job.workers[worker].state !== 'paused') store.setWorker(job, worker, { state: 'paused' });
    await wait(1000);
  }
}

async function step(job) {
  const stage = job.stage;
  if (stage === 'done') return 'stop';
  if (stage in GATE) {
    const g = GATE[stage];
    if (g && !gates(job)[g]) {
      store.log(job, WORKER[STAGES[STAGES.indexOf(stage) - 1]] || 'hf_capture', `⏭ Parada "${NAMES[stage]}" desactivada: sigo`);
      job.stage = next(stage);
      store.save(job);
      return 'next';
    }
    job.status = 'waiting_you';
    store.save(job);
    notify.send(`✋ Te espera: ${job.title}`, GATE_TEXT[stage], { tags: 'raised_hand' });
    return 'stop';
  }
  const worker = WORKER[stage];
  if (!worker) return 'stop';
  const runner = RUNNERS[stage];
  if (!runner) {
    job.status = 'waiting_you';
    job.error = `La etapa "${NAMES[stage]}" todavía no está programada (llega en los próximos pasos).`;
    store.setWorker(job, worker, { state: 'waiting_you', action: job.error });
    return 'stop';
  }
  await pauseGate(job, worker);
  const usesBrowser = BROWSER.has(stage);
  if (usesBrowser) {
    if (lock.isBusy()) store.setWorker(job, worker, { state: 'idle', action: '⏳ En cola: esperando a que el Chrome quede libre' });
    await lock.acquire();
  }
  store.setWorker(job, worker, { state: 'working', startedAt: Date.now(), action: 'Empezando…' });
  const t0 = Date.now();
  let r;
  try {
    r = await runner()(job);
  } finally {
    if (usesBrowser) lock.release();
    job.timings[stage] = (job.timings[stage] || 0) + (Date.now() - t0);
  }
  if (r === 'wait') {
    job.status = 'waiting_you';
    store.save(job);
    notify.send(`✋ Te necesito: ${job.title}`, job.workers[worker].action || 'Algo no salió solo y necesita que lo mires', { tags: 'raised_hand' });
    return 'stop';
  }
  store.setWorker(job, worker, { state: 'done', action: '', endedAt: Date.now() });
  job.stage = next(stage);
  store.save(job);
  return 'next';
}

async function drive(id, active) {
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
        const w = WORKER[job.stage];
        if (isLimit(e.message)) {
          job.status = 'waiting_limit';
          job.error = 'Se acabó el límite de uso de Claude. Sigo solo cuando se renueve (lo intento cada 10 min).';
          notify.send('💤 Sin límite de Claude', 'Se acabó el límite de uso. Sigo solo en cuanto se renueve.', { key: 'limit', every: 180, tags: 'zzz' });
          if (w) store.setWorker(job, w, { state: 'paused', action: '⏳ Esperando a que se renueve el límite de Claude' });
          store.save(job);
          await wait(EVERY);
          job.status = 'running';
          job.error = null;
          store.save(job);
          continue;
        }
        // Los avisos de Higgsfield (verificación, límite, selector roto) no se reintentan: paran y te avisan
        if (e.message === 'Detenido por ti' || e.noRetry || tries >= 2) throw e;
        tries++;
        if (w) store.log(job, w, `⚠️ ${e.message.slice(0, 200)} — reintento ${tries}/2 en 20 s`);
        await wait(20000);
      }
    }
  } catch (e) {
    const w = WORKER[job.stage];
    if (e.message === 'Detenido por ti') {
      job.status = 'paused';
      job.error = null;
      if (w) store.setWorker(job, w, { state: 'paused', action: '⏸ Parado por ti. Pulsa Reanudar para seguir.' });
      store.save(job);
      return;
    }
    job.status = 'error';
    job.error = e.message;
    notify.send(`❌ Se atascó: ${job.title}`, e.message.slice(0, 200), { priority: 4, tags: 'x' });
    if (w) {
      store.setWorker(job, w, { state: 'error', action: e.message.slice(0, 300) });
      store.log(job, w, '❌ ' + e.message);
    }
    store.save(job);
  } finally {
    active.delete(id);
  }
}

// Tu OK en una parada: pasa a la etapa siguiente
function approve(job, stage) {
  if (job.stage !== stage || !(stage in GATE)) throw new Error('Este trabajo no está en esa parada');
  job.stage = next(stage);
  job.status = job.stage === 'done' ? 'done' : 'running';
  job.error = null;
  store.save(job);
}

module.exports = { STAGES, NAMES, WORKER, GATE, gates, drive, approve };
