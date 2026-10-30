// 📈 ANALISTA DE RESULTADOS: mira las visitas de TUS reels, las cruza con cómo se hizo cada video y le pasa lo aprendido al director
const fs = require('fs');
const path = require('path');
const store = require('../lib/store');
const claude = require('../lib/claude');
const lock = require('../lib/lock');
const { fill } = require('./director');
const config = require('../config.json');

const RID = '_resultados';
const C = config.results || {};
const ACCOUNT = (config.research || {}).instagramAccount || 'laabuelaemma_';
const P = (f) => fs.readFileSync(path.join(store.ROOT, 'prompts', f), 'utf8');
const dir = () => store.jobDir(RID);
const MEMORY = path.join(store.ROOT, 'memory', 'resultados.md');
let running = false;

function rjob() {
  let j = store.load(RID);
  if (!j) {
    fs.mkdirSync(path.join(dir(), 'logs'), { recursive: true });
    j = { id: RID, title: 'Resultados', createdAt: Date.now(), hidden: true, reels: [], report: null, lastRun: null,
      workers: { results: { state: 'idle', action: '', log: [], paused: false } } };
    store.save(j);
  }
  return j;
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

// Lo que el director lee antes de planificar cada video
function memory() {
  try { return fs.readFileSync(MEMORY, 'utf8'); } catch { return ''; }
}

function jobsSummary() {
  return store.list().filter((x) => x.finalFile).map((x) => {
    const full = store.load(x.id) || x;
    const hook = (full.clips || [])[0];
    return `- id ${x.id} · "${x.title}" · producido ${new Date(x.createdAt).toISOString().slice(0, 10)} · ${full.videoType} · escenario ${full.setting} · CTA ${(full.plan && full.plan.ctaWord) || full.ctaWord} · ${(full.clips || []).filter((c) => !c.skip).length} clips` +
      `\n  hook: ${(full.plan && full.plan.hook) || ''} | primeras palabras: "${hook ? hook.line : ''}"\n  caption producido: ${((full.kit && full.kit.caption) || '').split('\n')[0].slice(0, 140)}`;
  }).join('\n') || '(none yet)';
}

async function run() {
  if (running) return;
  running = true;
  const j = rjob();
  const setW = (patch) => store.setWorker(j, 'results', patch);
  try {
    setW({ state: 'working', action: 'Esperando a que el Chrome quede libre…' });
    await lock.acquire();
    const out = path.join(dir(), 'raw.json');
    try {
      await require('../lib/chrome').ensure(j, 'results');
      if (fs.existsSync(out)) fs.unlinkSync(out);
      setW({ action: `Leyendo las visitas de @${ACCOUNT}…` });
      // Los reels de hace más de 10 días ya no cambian mucho: no hace falta abrirlos otra vez
      const known = (j.reels || []).filter((r) => r.postedAt && Date.now() - Date.parse(r.postedAt) > 10 * 86400000).map((r) => r.url);
      await claude.run({ job: j, worker: 'results', browser: true, cwd: store.ROOT, tools: ['Read', 'Write'],
        prompt: fill(P('results.md'), { ACCOUNT, OUT: out, MAX: C.maxReels || 6, KNOWN: known.length ? known.join(' ') : '(none)' }) });
    } finally {
      lock.release();
    }
    const data = JSON.parse(fs.readFileSync(out, 'utf8'));
    if (data.blocked) throw new Error('Instagram pide algo: ' + data.blocked + ' — resuélvelo en el Chrome de Flow Studio y vuelve a pulsar Analizar');
    const old = Object.fromEntries((j.reels || []).map((r) => [r.url, r]));
    // Solo mira los últimos; los anteriores se quedan guardados con sus últimos datos para seguir comparando
    const fresh = (data.reels || []).map((r) => ({ ...(old[r.url] || {}), ...Object.fromEntries(Object.entries(r).filter(([, v]) => v != null)) }));
    const seen = new Set(fresh.map((r) => r.url));
    j.reels = [...fresh, ...(j.reels || []).filter((r) => !seen.has(r.url))].slice(0, 80);
    j.followers = data.followers || j.followers;
    const med = median(j.reels.map((r) => r.views).filter(Boolean));
    store.log(j, 'results', `📊 ${j.reels.length} reels leídos · media de la cuenta ${med} vistas`);
    if (!j.reels.length) throw new Error('No he encontrado reels publicados en @' + ACCOUNT);

    setW({ action: 'Cruzando las visitas con cómo se hizo cada video…' });
    const now = Date.now();
    const reels = j.reels.map((r) => {
      const age = r.postedAt ? Math.round((now - Date.parse(r.postedAt)) / 3600000) : null;
      const linked = r.linked && r.jobId ? ` · LINKED BY THE PRODUCER to job id ${r.jobId} (certain)` : '';
      return `- ${r.url}${linked} · ${r.views || '?'} vistas (${med ? (r.views / med).toFixed(1) : '?'}× la media) · ${r.likes ?? '?'} likes · ${r.comments ?? '?'} comentarios · ${age != null ? `hace ${age} h` : 'fecha ?'}\n  caption: ${r.caption || '-'}`;
    }).join('\n');
    const rep = path.join(dir(), 'report.json');
    if (fs.existsSync(rep)) fs.unlinkSync(rep);
    const text = await claude.run({ job: j, worker: 'results', cwd: dir(), tools: ['Write'],
      prompt: fill(P('results_ideas.md'), { ACCOUNT, REELS: reels, JOBS: jobsSummary(), OUT: rep }) });
    const report = fs.existsSync(rep) ? JSON.parse(fs.readFileSync(rep, 'utf8')) : claude.extractJson(text);
    j.report = { ...report, median: med, at: now };
    for (const r of j.reels) if (!r.linked) r.jobId = (report.matches || {})[r.url] || r.jobId || null;
    // Se reescribe entero cada vez (no crece sin fin): el director siempre lee lo último
    fs.mkdirSync(path.dirname(MEMORY), { recursive: true });
    fs.writeFileSync(MEMORY, `Results of OUR published videos on @${ACCOUNT} (updated ${new Date(now).toISOString().slice(0, 10)}, account median ${med} views). Apply these when planning:\n` +
      (report.lecciones || []).map((l) => '- ' + l).join('\n') + (report.probar && report.probar.length ? '\nWorth trying:\n' + report.probar.map((l) => '- ' + l).join('\n') : '') + '\n');
    j.lastRun = now;
    store.save(j);
    setW({ state: 'done', action: `✅ Analizados ${j.reels.length} reels · ${(report.lecciones || []).length} lecciones para el director` });
    store.log(j, 'results', `✅ ${(report.lecciones || []).length} lecciones nuevas guardadas para el director`);
  } catch (e) {
    store.log(j, 'results', '❌ ' + e.message);
    setW({ state: 'error', action: e.message.slice(0, 300) });
  } finally {
    running = false;
  }
}

// Una vez al día, solo, cuando el Chrome no esté ocupado con un video
function schedule() {
  const hours = C.autoEveryHours ?? 24;
  if (!hours) return;
  setInterval(() => {
    const j = rjob();
    // La primera vez la lanzas tú (para que ya hayas iniciado sesión en Instagram)
    if (running || !j.lastRun || lock.isBusy() || Date.now() - j.lastRun < hours * 3600000) return;
    run();
  }, 30 * 60000);
}

// Tú dices qué video es cada reel (los captions de Instagram suelen ser iguales y no se pueden emparejar solos)
function link(url, jobId) {
  const j = rjob();
  const r = (j.reels || []).find((x) => x.url === url);
  if (!r) return null;
  Object.assign(r, { jobId: jobId || null, linked: !!jobId });
  store.save(j);
  return r;
}

module.exports = { RID, rjob, run, schedule, memory, link, isRunning: () => running };
