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
      `\n  hook A: ${(full.plan && full.plan.hook) || ''} | primeras palabras A: "${hook ? hook.line : ''}"` +
      (full.hookB ? `\n  hook B (A/B test, same video): ${full.hookB.text || ''} | primeras palabras B: "${full.hookB.line}"` : '') +
      `\n  caption producido: ${((full.kit && full.kit.caption) || '').split('\n')[0].slice(0, 140)}`;
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

    await autoLink(j);
    setW({ action: 'Cruzando las visitas con cómo se hizo cada video…' });
    const now = Date.now();
    const reels = j.reels.map((r) => {
      const age = r.postedAt ? Math.round((now - Date.parse(r.postedAt)) / 3600000) : null;
      const linked = r.linked && r.jobId ? ` · LINKED BY THE PRODUCER to job id ${r.jobId}, version ${r.version || 'A'} (certain)` : r.autoLinked && r.jobId ? ` · MATCHED BY EXACT VIDEO LENGTH to job id ${r.jobId}, version ${r.version || 'A'} (almost certain)` : '';
      const when = r.postedAt ? ` · publicado ${new Date(r.postedAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'short', hour: '2-digit', minute: '2-digit' })} hora España / ${new Date(r.postedAt).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric' })} ET` : '';
      return `- ${r.url}${linked}${when} · ${r.views || '?'} vistas (${med ? (r.views / med).toFixed(1) : '?'}× la media) · ${r.likes ?? '?'} likes · ${r.comments ?? '?'} comentarios · ${age != null ? `hace ${age} h` : 'fecha ?'}\n  caption: ${r.caption || '-'}`;
    }).join('\n');
    const rep = path.join(dir(), 'report.json');
    if (fs.existsSync(rep)) fs.unlinkSync(rep);
    const text = await claude.run({ job: j, worker: 'results', cwd: dir(), tools: ['Write'],
      prompt: fill(P('results_ideas.md'), { ACCOUNT, REELS: reels, JOBS: jobsSummary(), OUT: rep }) });
    const report = fs.existsSync(rep) ? JSON.parse(fs.readFileSync(rep, 'utf8')) : claude.extractJson(text);
    j.report = { ...report, median: med, at: now };
    for (const r of j.reels) if (!r.linked && !r.autoLinked) r.jobId = (report.matches || {})[r.url] || r.jobId || null;
    // Se reescribe entero cada vez (no crece sin fin): el director siempre lee lo último
    fs.mkdirSync(path.dirname(MEMORY), { recursive: true });
    fs.writeFileSync(MEMORY, `Results of OUR published videos on @${ACCOUNT} (updated ${new Date(now).toISOString().slice(0, 10)}, account median ${med} views). Apply these when planning:\n` +
      (report.lecciones || []).map((l) => '- ' + l).join('\n') + (report.probar && report.probar.length ? '\nWorth trying:\n' + report.probar.map((l) => '- ' + l).join('\n') : '') + '\n');
    await makePart2(j, med);
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

// 🔁 Parte 2: los reels que superan 2× la media (y son de los últimos 5 días) tienen continuación en 24-48 h
async function makePart2(j, med) {
  const done = new Set(j.part2Done || []);
  const wins = (j.reels || []).filter((r) => med && r.views >= 2 * med && r.postedAt && Date.now() - Date.parse(r.postedAt) < 5 * 86400000 && !done.has(r.url));
  if (!wins.length) return;
  store.setWorker(j, 'results', { action: `🔁 Preparando la parte 2 de ${wins.length} reel(s) que funcionan…` });
  const items = wins.map((r) => {
    const job = r.jobId && store.load(r.jobId);
    return `### ${r.url}\n${r.views} views (${(r.views / med).toFixed(1)}× our median), ${r.comments ?? '?'} comments\nCaption: ${r.caption || '-'}` +
      (job ? `\nTitle: ${job.title}\nOur script: ${(job.clips || []).map((c) => c.line).join(' ') || job.script}` : '');
  }).join('\n\n');
  const out = path.join(dir(), 'part2.json');
  if (fs.existsSync(out)) fs.unlinkSync(out);
  try {
    const text = await claude.run({ job: j, worker: 'results', cwd: dir(), tools: ['Write'], prompt: fill(P('part2.md'), { WINNERS: items, OUT: out }) });
    const res = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : claude.extractJson(text);
    for (const r of wins) {
      const p = res[r.url];
      if (!p || !p.guion) continue;
      const job = r.jobId && store.load(r.jobId);
      // La referencia de composición: la del video original (o el propio reel si no salió de Flow Studio)
      j.part2 = [{ key: r.url, title: 'Parte 2: ' + (p.titulo || (job && job.title) || 'idea'), hook: p.hook, script: p.guion, url: (job && job.url) || r.url, videoType: (job && job.videoType) || 'crecimiento', views: r.views, at: Date.now() }, ...(j.part2 || [])].slice(0, 20);
      done.add(r.url);
      store.log(j, 'results', `🔁 Parte 2 lista: "${p.titulo}" (el original lleva ${r.views} vistas)`);
      require('../lib/notify').send('🔁 Parte 2 lista', `Tu reel va ${(r.views / med).toFixed(1)}× por encima de tu media. Parte 2: "${p.titulo}". ${require('../lib/autopilot').opts().enabled ? 'El piloto la hará esta noche.' : 'Créala desde 🏠 Hoy.'}`, { tags: 'repeat' });
    }
    j.part2Done = [...done].slice(-200);
  } catch (e) {
    store.log(j, 'results', '⚠️ No pude preparar la parte 2: ' + e.message.slice(0, 100));
  }
}

// 🔗 Enlace automático: la duración exacta del reel coincide con la de un video nuestro (A o B)
async function autoLink(j) {
  const { duration } = require('../lib/ff');
  const mine = [];
  for (const x of store.list().filter((x) => x.finalFile)) {
    const full = store.load(x.id);
    for (const [ver, f] of [['A', full.finalFile], ['B', full.finalFile.replace(/\.mp4$/, '-B.mp4')]]) {
      const key = ver === 'A' ? 'finalDuration' : 'finalDurationB';
      if (full[key] == null && fs.existsSync(path.join(store.ROOT, f))) { try { full[key] = await duration(path.join(store.ROOT, f)); store.save(full); } catch {} }
      if (full[key]) mine.push({ id: x.id, ver, d: full[key], at: x.createdAt });
    }
  }
  let n = 0;
  for (const r of j.reels) {
    if (r.linked) continue;
    const posted = r.postedAt ? Date.parse(r.postedAt) : Date.now();
    // Publicado a mano a esa hora (botón ✓ Publicado): enlace casi seguro
    const byTime = store.list().filter((x) => x.published && Math.abs(x.published.at - posted) < 3 * 3600000);
    if (byTime.length === 1) { Object.assign(r, { jobId: byTime[0].id, version: 'A', autoLinked: true }); n++; continue; }
    const hits = r.duration ? mine.filter((m) => Math.abs(m.d - r.duration) < 0.25 && m.at <= posted + 3600000 && posted - m.at < 20 * 86400000) : [];
    if (hits.length === 1) { Object.assign(r, { jobId: hits[0].id, version: hits[0].ver, autoLinked: true }); n++; }
  }
  if (n) store.log(j, 'results', `🔗 ${n} reels enlazados solos con su video (misma duración exacta)`);
}

// Tú dices qué video es cada reel (los captions de Instagram suelen ser iguales y no se pueden emparejar solos)
function link(url, jobId) {
  const j = rjob();
  const r = (j.reels || []).find((x) => x.url === url);
  if (!r) return null;
  const [id, version] = String(jobId || '').split('#');
  Object.assign(r, { jobId: id || null, version: version === 'B' ? 'B' : 'A', linked: !!id, autoLinked: false });
  store.save(j);
  return r;
}

module.exports = { RID, rjob, run, schedule, memory, link, autoLink, makePart2, isRunning: () => running };
