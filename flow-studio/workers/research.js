// 🔎 INVESTIGADOR: busca en las cuentas que vigilas los reels que han dado un salto de visitas
const fs = require('fs');
const path = require('path');
const store = require('../lib/store');
const claude = require('../lib/claude');
const lock = require('../lib/lock');
const { exec, ffmpeg } = require('../lib/ff');
const { fill } = require('./director');
const config = require('../config.json');

const RID = '_investigador';
const R = config.research || {};
const P = (f) => fs.readFileSync(path.join(store.ROOT, 'prompts', f), 'utf8');
const dir = () => store.jobDir(RID);
let running = false;

function rjob() {
  let j = store.load(RID);
  if (!j) {
    for (const d of ['logs', 'vids']) fs.mkdirSync(path.join(dir(), d), { recursive: true });
    j = { id: RID, title: 'Investigador', createdAt: Date.now(), hidden: true, accounts: [...(R.accounts || [])], suggestions: [], lastRun: null,
      workers: { research: { state: 'idle', action: '', log: [], paused: false } } };
    store.save(j);
  }
  if (!j.accounts.length && (R.accounts || []).length) { j.accounts = [...R.accounts]; store.save(j); }
  return j;
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

// "Viral" = salto claro respecto a lo normal de esa cuenta (no un número fijo)
function findViral(data) {
  const now = Date.now();
  const out = [];
  for (const acc of data.accounts || []) {
    const views = (acc.reels || []).map((r) => r.views).filter((v) => v > 0);
    const med = median(views);
    for (const r of acc.reels || []) {
      if (!r.views || !med) continue;
      const ratio = r.views / med;
      if (ratio < (R.minRatio || 3) || r.views < (R.minViews || 50000)) continue;
      const age = r.postedAt ? (now - Date.parse(r.postedAt)) / 3600000 : null;
      out.push({ ...r, account: acc.account, followers: acc.followers || null, median: med, ratio: Math.round(ratio * 10) / 10, ageHours: age != null ? Math.round(age) : null });
    }
  }
  // Solo lo que está pegando AHORA: primero lo de las últimas 72 h, como mucho 5 días; sin fecha, fuera
  const H = R.recentHours || 72, MAX = (R.maxAgeDays || 5) * 24;
  const recent = out.filter((r) => r.ageHours != null && r.ageHours <= H);
  const older = out.filter((r) => r.ageHours != null && r.ageHours > H && r.ageHours <= MAX);
  const pick = [...recent.sort((a, b) => b.ratio - a.ratio), ...older.sort((a, b) => b.ratio - a.ratio).map((r) => ({ ...r, older: true }))];
  return pick.slice(0, R.maxIdeas || 8);
}

async function prepare(j, item) {
  const code = (item.url.match(/\/(reel|p)\/([^/?]+)/) || [])[2] || String(Date.now());
  const vid = path.join(dir(), 'vids', code + '.mp4');
  const thumb = path.join(dir(), 'vids', code + '.jpg');
  const tono = path.join(dir(), 'vids', code + '.txt');
  try {
    if (!fs.existsSync(vid)) {
      try { await exec('yt-dlp', ['-f', 'mp4/bv*+ba/b', '--merge-output-format', 'mp4', '-o', vid, item.url]); } catch (e) {
        // Instagram a veces pide sesión: se reintenta con la del Chrome de Flow Studio
        await exec('yt-dlp', ['--cookies-from-browser', `chrome:${path.join(store.ROOT, 'chrome-profile')}`, '-f', 'mp4/bv*+ba/b', '--merge-output-format', 'mp4', '-o', vid, item.url]);
      }
    }
    await ffmpeg(['-ss', '1', '-i', vid, '-frames:v', '1', '-vf', 'scale=360:-2', thumb]);
    await exec('python', [path.join(store.ROOT, 'tools', 'analyze_ref.py'), vid, tono]);
    item.transcript = fs.readFileSync(tono, 'utf8');
  } catch (e) {
    store.log(j, 'research', `⚠️ No pude descargar o transcribir ${item.url}: ${e.message.split('\n').pop().slice(0, 100)}`);
  }
  item.thumb = fs.existsSync(thumb) ? `vids/${code}.jpg` : null;
  return item;
}

// Devuelve { ok } o { error } (el piloto automático lo usa para saber si esperar al límite de Claude)
async function run() {
  if (running) return { error: 'El investigador ya está trabajando' };
  running = true;
  const j = rjob();
  const setW = (patch) => store.setWorker(j, 'research', patch);
  try {
    if (!j.accounts.length) throw new Error('Añade primero las cuentas que quieres vigilar');
    setW({ state: 'working', action: 'Esperando a que el Chrome quede libre…' });
    await lock.acquire();
    await require('../lib/chrome').ensure(j, 'research');
    const out = path.join(dir(), 'raw.json');
    try {
      if (fs.existsSync(out)) fs.unlinkSync(out);
      setW({ action: `Revisando ${j.accounts.length} cuentas en Instagram…` });
      store.log(j, 'research', `🔎 Reviso ${j.accounts.join(', ')}`);
      const prompt = fill(P('research.md'), { ACCOUNTS: j.accounts.map((a) => '- ' + a).join('\n'), OUT: out, PER_ACCOUNT: R.perAccount || 18, MIN_RATIO: 2 });
      await claude.run({ job: j, worker: 'research', prompt, browser: true, cwd: store.ROOT, tools: ['Read', 'Write'] });
    } finally {
      lock.release();
    }
    const data = JSON.parse(fs.readFileSync(out, 'utf8'));
    // Cuentas que recomienda Instagram en el mismo nicho (para añadirlas con un clic en Ajustes)
    const have = new Set(j.accounts.map((a) => a.toLowerCase()));
    if (Array.isArray(data.suggested)) j.suggestedAccounts = data.suggested.filter((a) => a && a.account && !have.has(String(a.account).toLowerCase().replace(/^@/, ''))).slice(0, 8);
    if (data.blocked) throw new Error('Instagram pide algo: ' + data.blocked + ' — resuélvelo en el Chrome de Flow Studio y vuelve a pulsar Sugerir');
    const seen = new Set(j.seen || []);
    const viral = findViral(data).filter((v) => !seen.has(v.url));
    j.seen = [...seen, ...viral.map((v) => v.url)].slice(-500);
    store.log(j, 'research', `📈 ${viral.length} reels nuevos con un salto claro de visitas (los que ya te sugerí no se repiten)`);
    if (!viral.length) { j.lastRun = Date.now(); store.save(j); setW({ state: 'done', action: 'No hay ningún reel viral nuevo en esas cuentas desde la última búsqueda' }); return { ok: true, count: 0 }; }

    for (const [i, item] of viral.entries()) {
      setW({ action: `Descargando y transcribiendo ${i + 1}/${viral.length}…` });
      await prepare(j, item);
    }
    setW({ action: 'Analizando por qué funcionan y traduciendo los guiones…' });
    const ideasFile = path.join(dir(), 'ideas.json');
    const items = viral.map((v) => `### ${v.url}\n@${v.account} · ${v.views} vistas · ${v.ratio}× su media (${v.median}) · ${v.ageHours != null ? `hace ${v.ageHours} h` : 'fecha desconocida'}\nCaption: ${v.caption || '-'}\nTranscript:\n${v.transcript || '(no transcript: work from the caption)'}`).join('\n\n');
    const text = await claude.run({ job: j, worker: 'research', prompt: fill(P('research_ideas.md'), { ITEMS: items, OUT: ideasFile }), tools: ['Write'], cwd: dir() });
    const ideas = fs.existsSync(ideasFile) ? JSON.parse(fs.readFileSync(ideasFile, 'utf8')) : claude.extractJson(text);
    const clean = (t) => String(t || '').replace(/\[[^\]]*\]/g, '').replace(/\n{3,}/g, '\n\n').trim();
    j.suggestions = viral.map((v) => { const it = { ...v, ...(ideas[v.url] || {}) }; it.guion = clean(it.guion); return it; });
    j.lastRun = Date.now();
    store.save(j);
    setW({ state: 'done', action: `✅ ${j.suggestions.length} ideas listas` });
    store.log(j, 'research', `✅ ${j.suggestions.length} ideas listas`);
    return { ok: true, count: j.suggestions.length };
  } catch (e) {
    store.log(j, 'research', '❌ ' + e.message);
    setW({ state: 'error', action: e.message.slice(0, 300) });
    return { error: e.message };
  } finally {
    running = false;
  }
}

module.exports = { RID, rjob, run, findViral, isRunning: () => running };
