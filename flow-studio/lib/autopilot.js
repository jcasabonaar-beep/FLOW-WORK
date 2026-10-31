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
// 6 al día en total: 4 normales + 2 reels de prueba (la versión B de los 2 más fuertes)
const DEFAULTS = { enabled: false, hour: 1, videos: config.dailyMain || 4, venta: 1, setting: 'kitchen' };
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
    // 🔁 Primero las partes 2 de tus reels que funcionan (de las últimas 48 h), luego las ideas virales
    const p2 = ((store.load('_resultados') || {}).part2 || []).filter((p) => !used.has('p2:' + p.key) && Date.now() - p.at < 48 * 3600000)
      .map((p) => ({ key: 'p2:' + p.key, title: p.title, url: p.url, script: p.script, videoType: p.videoType }));
    const pool = [...p2, ...sugs.filter((s) => !used.has(s.url)).map((s) => ({ key: s.url, title: s.tema || 'Idea viral', url: s.url, script: s.guion }))];
    // Si no hay bastantes ideas nuevas: variaciones de la más viral (mismo formato, otro ingrediente o remedio)
    // Para elegir bien hacen falta más candidatas que huecos: unas cuantas variaciones de las más virales
    const want = Math.min(16, o.videos * 2 + 2);
    for (const base of sugs.slice(0, 3)) {
      if (pool.length >= want) break;
      if (!base.analysis) {
        setW({ action: `Sacando variaciones de "${base.tema || base.url}"…` });
        base.analysis = await untilLimitOk(j, 'variaciones', () => assistant.analyze(rj, 'research', { title: base.tema, url: base.url, stats: `${base.views} vistas, ${base.ratio}× la media de @${base.account}`, text: `${base.caption || ''}\n${base.transcript || base.guion || ''}` }));
        store.save(rj);
      }
      for (const v of base.analysis.variaciones || []) {
        const key = `${base.url}#${v.titulo}`;
        if (!used.has(key) && v.guion && pool.length < want) pool.push({ key, title: v.titulo, url: base.url, script: v.guion, from: `variación de un viral de @${base.account} (${base.ratio}× su media)` });
      }
    }
    if (!pool.length) {
      setW({ state: 'error', action: 'No encontré ideas nuevas. Añade más cuentas en "Ideas virales".' });
      notify.send('🌙 Sin ideas esta noche', 'No encontré ideas nuevas. Añade más cuentas en "Ideas virales".', { priority: 4, tags: 'warning' });
      return { error: 'sin ideas' };
    }

    // 🎯 Los mejores del día: un solo paso que compara todas las candidatas y elige las {videos} más fuertes y variadas
    const chosen = await pickBest(j, pool, o, sugs);
    const ids = [];
    for (const [i, it] of chosen.entries()) {
      const setting = o.setting === 'mix' ? MIX[i % MIX.length] : o.setting;
      const job = store.create({ title: '🌙 ' + it.title, url: it.url, script: it.script, setting: config.settings[setting] ? setting : 'kitchen',
        videoType: it.videoType || (it.venta != null ? (it.venta ? 'venta' : 'crecimiento') : i < o.venta ? 'venta' : 'crecimiento'), mode: 'auto', language: config.language });
      job.autopilot = true;
      job.priority = i; // orden de publicación: el 1 sale a la mejor hora
      job.pickReason = it.porque || '';
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
    const when = whenToPost();
    notify.send(`🌙 ${ok.length}/${jobs.length} videos listos`, [...(when ? [`🕐 Prográmalos para: ${when}`] : []),...ok.map((x) => `✅ ${x.driveName || ''} ${x.title.replace('🌙 ', '')}`), ...bad.map((x) => `❌ ${x.title.replace('🌙 ', '')}: ${(x.error || '').slice(0, 80)}`)].join('\n'), { tags: 'tada' });
  }
  store.save(j);
}

async function pickBest(j, pool, o, sugs) {
  const fallback = pool.slice(0, o.videos);
  if (pool.length <= o.videos) return fallback;
  setW(j, { action: `🎯 Eligiendo los ${o.videos} mejores de ${pool.length} candidatas…` });
  const info = Object.fromEntries(sugs.map((s) => [s.url, s]));
  const cands = pool.map((p) => {
    const s = info[p.key];
    return `- key: ${p.key}\n  ${p.title}${p.key.startsWith('p2:') ? ' · PARTE 2 de un reel nuestro que funciona' : ''}${s ? ` · @${s.account}: ${s.views} vistas (${s.ratio}× su media), hace ${s.ageHours ?? '?'} h, encaje ${s.encaje ?? '?'}/10, por qué: ${s.porque || ''}` : p.from ? ' · ' + p.from : ''}\n  guion: ${(p.script || '').slice(0, 300)}`;
  }).join('\n');
  const out = require('path').join(store.jobDir(PID), 'pick.json');
  try {
    const fs = require('fs');
    if (fs.existsSync(out)) fs.unlinkSync(out);
    const { fill } = require('../workers/director');
    const P = fs.readFileSync(require('path').join(store.ROOT, 'prompts', 'pick.md'), 'utf8');
    const text = await untilLimitOk(j, 'elegir los mejores', () => require('./claude').run({ job: j, worker: 'autopilot', tools: ['Write'], cwd: store.jobDir(PID),
      prompt: fill(P, { ACCOUNT: (config.research || {}).instagramAccount || '', N: o.videos, VENTA: o.venta, CANDIDATES: cands, OUT: out, LESSONS: require('../workers/results').memory() || '(no data yet)' }) }));
    const res = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : require('./claude').extractJson(text);
    const byKey = Object.fromEntries(pool.map((p) => [p.key, p]));
    const picked = (res.pick || []).map((x) => byKey[x.key] && { ...byKey[x.key], venta: x.venta, porque: x.porque }).filter(Boolean).slice(0, o.videos);
    if (picked.length) { store.log(j, 'autopilot', `🎯 Elegidos: ${picked.map((p, i) => `${i + 1}. ${p.title}`).join(' · ')}`); return picked; }
  } catch (e) {
    store.log(j, 'autopilot', '⚠️ No pude comparar las candidatas, uso el orden por viralidad: ' + e.message.slice(0, 100));
  }
  return fallback;
}
const setW = (j, patch) => store.setWorker(j, 'autopilot', patch);

// Mejor hora para publicar según el Analista de resultados
function whenToPost() {
  try { return ((store.load('_resultados') || {}).report || {}).horario || ''; } catch { return ''; }
}

// 📊 Domingo por la mañana: resumen de la semana al móvil (sin gastar créditos)
function weekly(j) {
  const now = new Date();
  if (now.getDay() !== 0 || now.getHours() !== 11 || j.lastWeekly === now.toDateString()) return;
  j.lastWeekly = now.toDateString();
  store.save(j);
  require('./health').updateYtdlp(); // de paso, yt-dlp al día (Instagram cambia a menudo)
  const week = store.list().filter((x) => x.status === 'done' && Date.now() - x.createdAt < 7 * 86400000);
  const r = store.load('_resultados') || {};
  const top = [...(r.reels || [])].filter((x) => x.postedAt && Date.now() - Date.parse(x.postedAt) < 7 * 86400000).sort((a, b) => (b.views || 0) - (a.views || 0))[0];
  const lesson = ((r.report || {}).lecciones || [])[0];
  notify.send('📊 Tu semana', [
    `🎬 ${week.length} videos hechos (${week.filter((x) => x.autopilot).length} por el piloto automático)`,
    top ? `🏆 Mejor reel de la semana: ${top.views.toLocaleString('es-ES')} vistas` : '',
    lesson ? `💡 Lo que más funciona: ${lesson}` : '',
    whenToPost() ? `🕐 Publica: ${whenToPost()}` : '',
  ].filter(Boolean).join('\n'), { tags: 'bar_chart' });
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
    try { weekly(j); } catch {}
    try { require('./publish').remind(); } catch {}
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
