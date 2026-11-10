// Estado de los trabajos: un job.json por video dentro de jobs/<id>/
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const ROOT = path.join(__dirname, '..');
const JOBS = path.join(ROOT, 'jobs');
const WORKERS = ['capture', 'director', 'frames', 'clips', 'editor'];
// Trabajadores del pipeline Higgsfield (Diane)
const HF_WORKERS = ['hf_capture', 'hf_analyst', 'hf_keyframes', 'hf_video', 'hf_post'];

const bus = new EventEmitter();
bus.setMaxListeners(100);
const cache = new Map();

function jobDir(id) { return path.join(JOBS, id); }

function newId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function blankWorker() {
  return { state: 'idle', action: '', log: [], paused: false, startedAt: null, endedAt: null };
}

function create({ title, url, script, setting, ctaWord, language, videoType, mode, kind, outfit, place, notes }) {
  if (kind === 'higgsfield') return createHf({ title, url, outfit, place, notes });
  const id = newId();
  fs.mkdirSync(path.join(jobDir(id), 'ref'), { recursive: true });
  for (const d of ['frames', 'clips', 'edit', 'logs']) fs.mkdirSync(path.join(jobDir(id), d), { recursive: true });
  const job = {
    id, title: title || 'Video ' + id, url: url || '', script: String(script || '').replace(/\[[^\]]*\]/g, '').trim(), setting: setting || 'kitchen',
    ctaWord: ctaWord || 'AUTO', videoType: videoType === 'venta' ? 'venta' : 'crecimiento', auto: mode === 'auto', language: language || require('../config.json').language, createdAt: Date.now(),
    stage: 'capture', // capture → director → frames → review_frames → clips → editor → review_final → done
    status: 'running', // running | paused | waiting_you | done | error
    workers: Object.fromEntries(WORKERS.map((w) => [w, blankWorker()])),
    plan: null, clips: [], notes: [], output: null, error: null, timings: {},
  };
  save(job);
  return job;
}

// 🎥 Video Higgsfield de Diane: link de referencia + ajustes opcionales (ropa, sitio, notas de coreografía)
function createHf({ title, url, outfit, place, notes }) {
  const id = newId();
  for (const d of ['ref', 'keyframes', 'video', 'post', 'debug', 'logs']) fs.mkdirSync(path.join(jobDir(id), d), { recursive: true });
  const clean = (x) => String(x || '').trim().slice(0, 2000);
  const job = {
    id, kind: 'higgsfield', title: clean(title) || 'Diane ' + id, url: clean(url), createdAt: Date.now(),
    stage: 'capture', // capture → analysis → review_analysis → keyframes → review_keyframes → video → review_video → post → review_final → done
    status: 'running',
    // Todos los trabajadores (los de Flow también) para que el resto del panel no falle con estos trabajos
    workers: Object.fromEntries([...WORKERS, ...HF_WORKERS].map((w) => [w, blankWorker()])),
    clips: [], notes: [], output: null, error: null, timings: {},
    hf: { overrides: { outfit: clean(outfit), place: clean(place), notes: clean(notes) }, corrections: [], analysis: null, analysisV: 0, warnings: [] },
  };
  save(job);
  return job;
}

function load(id) {
  if (cache.has(id)) return cache.get(id);
  const f = path.join(jobDir(id), 'job.json');
  if (!fs.existsSync(f)) return null;
  const job = JSON.parse(fs.readFileSync(f, 'utf8'));
  cache.set(id, job);
  return job;
}

function save(job) {
  cache.set(job.id, job);
  const f = path.join(jobDir(job.id), 'job.json');
  fs.writeFileSync(f + '.tmp', JSON.stringify(job, null, 2));
  fs.renameSync(f + '.tmp', f);
  bus.emit('job', job.id);
}

function list() {
  if (!fs.existsSync(JOBS)) return [];
  return fs.readdirSync(JOBS).filter((d) => fs.existsSync(path.join(JOBS, d, 'job.json')))
    .map(load).filter((j) => j && !j.hidden).sort((a, b) => b.createdAt - a.createdAt);
}

// Escribe una línea en la "oficina" de un trabajador
function log(job, worker, msg) {
  const w = job.workers[worker];
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  w.log.push(line);
  if (w.log.length > 400) w.log.splice(0, w.log.length - 400);
  fs.appendFileSync(path.join(jobDir(job.id), 'logs', worker + '.log'), line + '\n');
  save(job);
}

function setWorker(job, worker, patch) {
  Object.assign(job.workers[worker], patch);
  save(job);
}

function remove(id) {
  cache.delete(id);
  fs.rmSync(jobDir(id), { recursive: true, force: true });
}

module.exports = { ROOT, JOBS, WORKERS, HF_WORKERS, bus, jobDir, create, load, save, list, log, setWorker, remove };
