// 🎓 MODO APRENDIZAJE: Claude recorre a la vista las pantallas de imagen y vídeo de Higgsfield en el Chrome de Flow Studio
// y guarda el mapa de selectores (memory/higgsfield-selectors.json). Después un script lo comprueba sin generar.
const fs = require('fs');
const path = require('path');
const store = require('../lib/store');
const claude = require('../lib/claude');
const lock = require('../lib/lock');
const config = require('../config.json');
const { FILE, loadMap, validate } = require('../lib/hf/selectors');

const LID = '_higgsfield';
const W = 'hf_learn';
let running = false;

function ljob() {
  let j = store.load(LID);
  if (!j) {
    fs.mkdirSync(path.join(store.jobDir(LID), 'logs'), { recursive: true });
    j = { id: LID, title: 'Aprender Higgsfield', createdAt: Date.now(), hidden: true, clips: [], workers: { [W]: { state: 'idle', action: '', log: [], paused: false } } };
    store.save(j);
  }
  return j;
}

function status() {
  const j = ljob();
  const map = loadMap();
  return { running, worker: j.workers[W], learnedAt: map.learnedAt || null, blocked: map.blocked || null, notes: map.notes_es || '', errors: Object.keys(map).length ? validate(map) : ['sin aprender'], last: j.last || null };
}

async function run() {
  if (running) return { error: 'Ya está aprendiendo' };
  running = true;
  const j = ljob();
  try {
    if (lock.isBusy()) store.setWorker(j, W, { state: 'idle', action: '⏳ Esperando a que el Chrome quede libre (Flow u otra generación)…' });
    await lock.acquire();
    try {
      store.setWorker(j, W, { state: 'working', action: 'Abriendo Higgsfield en el Chrome de Flow Studio…', startedAt: Date.now() });
      await require('../lib/chrome').ensure(j, W);
      if (fs.existsSync(FILE)) fs.copyFileSync(FILE, FILE.replace(/\.json$/, `.${Date.now()}.bak.json`));
      const lf = path.join(store.ROOT, 'memory', 'lecciones-higgsfield.md');
      // Errores actuales de los vídeos Higgsfield parados (por ejemplo, un control que no encontró)
      const stuck = store.list().filter((x) => x.kind === 'higgsfield' && x.status === 'error' && x.error).map((x) => `- [${x.stage}] ${x.error}`).join('\n');
      const prompt = fs.readFileSync(path.join(store.ROOT, 'prompts', 'hf_learn.md'), 'utf8').replace(/\{\{(\w+)\}\}/g, (m, k) => ({
        IMAGE_MODEL: config.higgsfield.imageModel, VIDEO_MODEL: config.higgsfield.videoModel, OUT: FILE,
        CHECK: path.join(store.ROOT, 'tools', 'hf-check.js'), LESSONS: [(fs.existsSync(lf) ? fs.readFileSync(lf, 'utf8').slice(-4000) : ''), stuck].filter(Boolean).join('\n') || '(none)',
        PREVIOUS: fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : '(none: first time)',
      })[k] ?? m);
      const summary = await claude.run({ job: j, worker: W, prompt, browser: true, cwd: store.ROOT, tools: ['Read', 'Write', 'Edit', `Bash(node ${path.join(store.ROOT, 'tools', 'hf-check.js')}:*)`, 'Bash(node tools/hf-check.js:*)'] });
      const map = loadMap();
      const errors = map.blocked ? ['Higgsfield pidió algo: ' + map.blocked] : validate(map);
      j.last = { at: Date.now(), summary: String(summary || '').slice(0, 3000), errors };
      store.setWorker(j, W, { state: errors.length ? 'error' : 'done', action: errors.length ? errors.join(' · ').slice(0, 300) : '✅ Mapa de Higgsfield aprendido', endedAt: Date.now() });
      store.log(j, W, errors.length ? '⚠️ ' + errors.join(' · ') : '✅ Mapa guardado en ' + FILE);
      return j.last;
    } finally {
      lock.release();
    }
  } catch (e) {
    store.setWorker(j, W, { state: e.message === 'Detenido por ti' ? 'paused' : 'error', action: e.message.slice(0, 300) });
    store.log(j, W, '❌ ' + e.message);
    return { error: e.message };
  } finally {
    running = false;
  }
}

const stop = () => claude.stop(LID, W);

module.exports = { run, stop, status, LID };
