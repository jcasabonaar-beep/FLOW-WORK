// 🌙 PILOTO AUTOMÁTICO: cada noche busca ideas virales, pone en cola los videos en "Todo directo" y te avisa al móvil.
// Si se acaba el límite de Claude, espera y sigue solo cuando se renueva.
const { spawn } = require('child_process');
const store = require('./store');
const settings = require('./settings');
const notify = require('./notify');
const pipeline = require('./pipeline');
const { isLimit, EVERY } = require('./limit');
const research = require('../workers/research');
const assistant = require('../workers/assistant');
const config = require('../config.json');

const PID = '_piloto';
const DEFAULTS = { enabled: false, hour: 1, videos: 5, venta: 1, setting: 'kitchen' };
const MIX = ['kitchen', 'walmart', 'kitchen', 'target', 'kitchen', 'supermarket'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let running = false;

const opts = () => ({ ...DEFAULTS, ...(settings.get().autopilot || {}) });
const today = () => new Date().toISOString().slice(0, 10);

function pjob() {
  let j = store.load(PID);
  if (!j) {
    require('fs').mkdirSync(require('path').join(store.jobDir(PID), 'logs'), { recursive: true });
    j = { id: PID, title: 'Piloto automático', createdAt: Date.now(), hidden: true, used: [], runs: [], lastDate: null,
      workers: { autopilot: { state: 'idle', action: '', log: [], paused: false } } };
    store.save(j);
  }
  return j;
}

// Repite fn mientras el problema sea el límite de Claude
async function untilLimitOk(j, label, fn) {
  for (;;) {
    let res, err;
    try { res = await fn(); } catch (e) { err = e.message; }
    const msg = err || (res && res.error);
    if (msg && isLimit(msg)) {
      store.setWorker(j, 'autopilot', { state: 'paused', action: `💤 Sin límite de Claude (${label}): sigo solo cuando se renueve` });
      notify.send('💤 Sin límite de Claude', 'El piloto automático espera y sigue solo en cuanto se renueve.', { key: 'limit', every: 180, tags: 'zzz' });
      await wait(EVERY);
      store.setWorker(j, 'autopilot', { state: 'working', action: `Reintentando: ${label}…` });
      continue;
    }
    if (err) throw new Error(err);
    return res;
  }
}

async function run(reason = 'programado') {
  if (running) return { error: 'El piloto automático ya está trabajando' };
  running = true;
  const j = pjob();
  const o = opts();
  const setW = (patch) => store.setWorker(j, 'autopilot', patch);
  j.lastDate = today();
  store.save(j);
  try {
    setW({ state: 'working', action: 'Buscando ideas virales…' });
    store.log(j, 'autopilot', `🌙 Empiezo (${reason}): ${o.videos} videos`);
    const r = await untilLimitOk(j, 'buscar ideas', () => research.run());
    if (r && r.error) store.log(j, 'autopilot', '⚠️ El investigador no pudo buscar: ' + r.error.slice(0, 160) + ' — uso ideas que ya tenía');
    if (r && r.error && /Instagram/i.test(r.error)) notify.send('⚠️ Instagram pide algo', 'Entra en el Chrome de Flow Studio y mira Instagram. Mientras, uso ideas que ya tenía.', { priority: 4, tags: 'warning' });

    const used = new Set(j.used || []);
    const rj = research.rjob();
    // Viralidad × encaje con nuestro público (señoras hispanas 60+ en EE. UU.); las que no encajan, fuera
    const score = (s) => (s.ratio || 0) * (s.encaje || 6) / 10;
    const sugs = [...(rj.suggestions || [])].filter((s) => s.guion && (s.encaje == null || s.encaje >= 5)).sort((a, b) => score(b) - score(a));
    const pool = sugs.filter((s) => !used.has(s.url)).map((s) => ({ key: s.url, title: s.tema || 'Idea viral', url: s.url, script: s.guion }));
    // Si no hay bastantes ideas nuevas: variaciones de la más viral (mismo formato, otro ingrediente o remedio)
    for (const base of sugs) {
      if (pool.length >= o.videos) break;
      if (!base.analysis) {
        setW({ action: `Sacando variaciones de "${base.tema || base.url}"…` });
        base.analysis = await untilLimitOk(j, 'variaciones', () => assistant.analyze(rj, 'research', { title: base.tema, url: base.url, stats: `${base.views} vistas, ${base.ratio}× la media de @${base.account}`, text: `${base.caption || ''}\n${base.transcript || base.guion || ''}` }));
        store.save(rj);
      }
      for (const v of base.analysis.variaciones || []) {
        const key = `${base.url}#${v.titulo}`;
        if (!used.has(key) && v.guion && pool.length < o.videos) pool.push({ key, title: v.titulo, url: base.url, script: v.guion });
      }
    }
    if (!pool.length) {
      setW({ state: 'error', action: 'No encontré ideas nuevas. Añade más cuentas en "Ideas virales".' });
      notify.send('🌙 Sin ideas esta noche', 'No encontré ideas nuevas. Añade más cuentas en "Ideas virales".', { priority: 4, tags: 'warning' });
      return { error: 'sin ideas' };
    }

    const ids = [];
    for (const [i, it] of pool.slice(0, o.videos).entries()) {
      const setting = o.setting === 'mix' ? MIX[i % MIX.length] : o.setting;
      const job = store.create({ title: '🌙 ' + it.title, url: it.url, script: it.script, setting: config.settings[setting] ? setting : 'kitchen',
        videoType: i < o.venta ? 'venta' : 'crecimiento', mode: 'auto', language: config.language });
      job.autopilot = true;
      store.save(job);
      ids.push(job.id);
      j.used = [...(j.used || []), it.key].slice(-1000);
      pipeline.drive(job.id);
      await wait(1100); // ids distintos
    }
    j.runs = [{ at: Date.now(), jobs: ids, state: 'running', retried: [] }, ...(j.runs || [])].slice(0, 30);
    store.save(j);
    const titles = ids.map((id) => '• ' + store.load(id).title.replace('🌙 ', '')).join('\n');
    setW({ state: 'working', action: `🎬 ${ids.length} videos en marcha` });
    store.log(j, 'autopilot', `🎬 ${ids.length} videos en cola`);
    notify.send(`🌙 Empiezo ${ids.length} videos`, titles, { tags: 'crescent_moon' });
    return { ok: true, jobs: ids };
  } catch (e) {
    setW({ state: 'error', action: e.message.slice(0, 300) });
    store.log(j, 'autopilot', '❌ ' + e.message);
    notify.send('❌ Piloto automático', e.message.slice(0, 200), { priority: 4, tags: 'x' });
    return { error: e.message };
  } finally {
    running = false;
  }
}

// Vigila la tanda: si un video se atasca lo reintenta una vez; al acabar todos, te manda el resumen
function watch() {
  const j = store.load(PID);
  const cur = j && (j.runs || [])[0];
  if (!cur || cur.state !== 'running') return;
  const jobs = cur.jobs.map((id) => store.load(id)).filter(Boolean);
  for (const x of jobs) {
    if (x.status === 'error' && !cur.retried.includes(x.id) && !pipeline.active.has(x.id)) {
      cur.retried.push(x.id);
      store.log(j, 'autopilot', `🔁 "${x.title}" se atascó: lo reintento una vez`);
      pipeline.drive(x.id);
    }
  }
  const finished = jobs.every((x) => x.status === 'done' || (x.status === 'error' && cur.retried.includes(x.id) && !pipeline.active.has(x.id)));
  if (finished) {
    cur.state = 'done';
    const ok = jobs.filter((x) => x.status === 'done');
    const bad = jobs.filter((x) => x.status !== 'done');
    const mins = Math.round((Date.now() - cur.at) / 60000);
    store.setWorker(j, 'autopilot', { state: 'done', action: `✅ ${ok.length}/${jobs.length} videos listos en ${mins} min` });
    store.log(j, 'autopilot', `✅ Tanda terminada: ${ok.length} listos, ${bad.length} con problemas`);
    notify.send(`🌙 ${ok.length}/${jobs.length} videos listos`, [...ok.map((x) => `✅ ${x.driveName || ''} ${x.title.replace('🌙 ', '')}`), ...bad.map((x) => `❌ ${x.title.replace('🌙 ', '')}: ${(x.error || '').slice(0, 80)}`)].join('\n'), { tags: 'tada' });
  }
  store.save(j);
}

// Que Windows no se duerma mientras el piloto automático esté activado (la pantalla sí puede apagarse)
let awake = null;
function keepAwake(on) {
  if (process.platform !== 'win32') return;
  if (on && !awake) {
    const ps = "$s=Add-Type -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint f);' -Name P -Namespace W -PassThru; while($true){ [void]$s::SetThreadExecutionState(0x80000001); Start-Sleep 50 }";
    awake = spawn('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', ps], { windowsHide: true, stdio: 'ignore' });
    awake.on('exit', () => { awake = null; });
  }
  if (!on && awake) { awake.kill(); awake = null; }
}

function start() {
  keepAwake(opts().enabled);
  setInterval(() => {
    const o = opts();
    const j = pjob();
    if (o.enabled && new Date().getHours() === Number(o.hour) && j.lastDate !== today()) run();
    try { watch(); } catch {}
  }, 60000);
}

function configure(patch) {
  const o = { ...opts(), ...patch };
  o.videos = Math.max(1, Math.min(10, Number(o.videos) || 5));
  o.venta = Math.max(0, Math.min(o.videos, Number(o.venta) || 0));
  o.hour = Math.max(0, Math.min(23, Number(o.hour) || 0));
  settings.save({ autopilot: o });
  keepAwake(o.enabled);
  return o;
}

module.exports = { PID, pjob, run, start, watch, opts, configure, isRunning: () => running };
