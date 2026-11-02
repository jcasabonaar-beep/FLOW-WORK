// 🧠 Memoria de lo que funciona: cruza lo investigado, lo creado y los resultados reales, y se lo pasa a todos los trabajadores.
// Son cuentas normales (sin gastar créditos): se recalcula cada vez que el Analista lee tus reels.
const fs = require('fs');
const path = require('path');
const store = require('./store');

const FILE = path.join(store.ROOT, 'memory', 'playbook.md');
const JSONF = path.join(store.ROOT, 'memory', 'playbook.json');
const FORMATS = {
  maqueta_transparente: 'maqueta transparente "lo acumulado dentro"', maqueta: 'maqueta anatómica + remedio', si_tu_cuerpo: '"Si tu…" + maqueta del cuerpo',
  experimento: 'experimento (pecera, transformación)', otra_persona: 'remedio aplicado a otra persona', combinacion: '"ponle X a Y y mira lo que pasa"',
  limpieza: 'truco de limpieza antes/después', version_casera: 'versión casera, plato junto a la cara', comida: 'acción fuerte con comida', cabeza_hablando: 'solo hablando a cámara',
};
const HOOKS = { pregunta: 'pregunta', afirmacion: 'afirmación', cifra: 'cifra o dato', error: 'error ("lo haces mal")', llamada_edad: 'llamada a su edad ("Si tienes más de 50")', instruccion: 'instrucción ("ponle…")', secreto: 'secreto de abuela', si_tu: '"Si tu…"' };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

// Solo aprende de lo VIRAL: un reel cuenta como éxito si llega a 50.000 visitas o más (config.viralViews).
// Que uno de 7.000 haga algo mejor que otro de 5.000 es ruido: no enseña nada.
const VIRAL = () => require('../config.json').viralViews || 50000;
// % de virales "prudente": con pocos reels se acerca a la tasa general de la cuenta (no se fía de un solo dato)
const prudent = (hits, n, base, k = 3) => (hits + base * k) / (n + k);

function compute() {
  const V = VIRAL();
  const res = store.load('_resultados') || {};
  const all = (res.reels || []).filter((r) => r.views);
  const reels = all.filter((r) => r.jobId);
  const base = all.length ? all.filter((r) => r.views >= V).length / all.length : 0.1;
  const by = {};
  const add = (dim, key, views) => { if (!key) return; ((by[dim] ||= {})[key] ||= []).push(views); };
  const ab = [];
  for (const r of reels) {
    const j = store.load(r.jobId);
    if (!j) continue;
    const B = r.version === 'B';
    add('formato', (j.plan || {}).format, r.views);
    add('hook', B ? (j.hookB || {}).type : (j.plan || {}).hookType, r.views);
    add('ropa', (j.plan || {}).outfit, r.views);
    add('escenario', j.setting, r.views);
    add('tipo', j.videoType, r.views);
    add('familia', (j.clips || []).some((c) => (c.family || []).length) ? 'con familia' : 'sin familia', r.views);
  }
  // A/B: solo cuenta si al menos una de las dos versiones fue viral
  const pairs = {};
  for (const r of reels) (pairs[r.jobId] ||= {})[r.version || 'A'] = r.views;
  for (const [id, p] of Object.entries(pairs)) {
    if (!p.A || !p.B || Math.max(p.A, p.B) < V) continue;
    const j = store.load(id);
    ab.push({ title: j.title, a: (j.plan || {}).hookType, b: (j.hookB || {}).type, win: p.B > p.A ? 'B' : 'A', ratio: Math.max(p.A, p.B) / Math.max(1, Math.min(p.A, p.B)) });
  }
  // Lo que está explotando fuera (Investigador, últimos 7 días): solo reels de 50.000+
  const sug = (store.load('_investigador') || {}).suggestions || [];
  const trend = {};
  for (const s2 of sug) if (s2.formato && s2.views >= V && (!s2.postedAt || Date.now() - Date.parse(s2.postedAt) < 7 * 86400000)) (trend[s2.formato] ||= []).push(s2.views);
  const table = (dim) => Object.entries(by[dim] || {}).map(([k, v]) => {
    const hits = v.filter((x) => x >= V).length;
    const rate = prudent(hits, v.length, base);
    return { k, n: v.length, hits, best: Math.max(...v), rate: Math.round(rate * 100), x: Math.round((rate / Math.max(base, 0.02)) * 10) / 10 };
  }).sort((a, b) => b.rate - a.rate || b.best - a.best);
  const virals = reels.filter((r) => r.views >= V).map((r) => { const j = store.load(r.jobId) || {}; return { title: j.title, views: r.views, format: (j.plan || {}).format, hook: r.version === 'B' ? (j.hookB || {}).type : (j.plan || {}).hookType }; });
  const out = { at: Date.now(), viral: V, base: Math.round(base * 100), total: all.length, virals, formato: table('formato'), hook: table('hook'), ropa: table('ropa'), escenario: table('escenario'), tipo: table('tipo'), familia: table('familia'), ab,
    trend: Object.entries(trend).map(([k, v]) => ({ k, n: v.length, x: median(v) })).sort((a, b) => b.n - a.n) };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(JSONF, JSON.stringify(out, null, 2));
  fs.writeFileSync(FILE, text(out));
  return out;
}

const name = (dim, k) => (dim === 'formato' ? FORMATS[k] : dim === 'hook' ? HOOKS[k] : null) || k;
function text(p) {
  const k = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : Math.round(n / 1000) + 'k';
  const line = (dim, t) => (p[dim] || []).length ? `${t}: ` + p[dim].map((r) => `${name(dim, r.k)} ${r.hits}/${r.n} virales (${r.rate}%, mejor ${k(r.best)})`).join(' · ') : '';
  const vir = p.virals.length ? `OUR VIRAL REELS (${p.viral / 1000}k+): ` + p.virals.map((v) => `"${v.title}" ${k(v.views)} [${name('formato', v.format)}, hook ${name('hook', v.hook)}]`).join(' · ') : `None of our reels has reached ${p.viral / 1000}k yet: copy what goes viral in other accounts.`;
  const abWins = p.ab.length ? `A/B tests with a viral version: ` + p.ab.map((r) => `"${r.title}": ganó ${r.win} (${r.win === 'A' ? name('hook', r.a) : name('hook', r.b)})`).join(' · ') : '';
  const tr = p.trend.length ? `Going viral (${p.viral / 1000}k+) right now in similar accounts, last 7 days: ` + p.trend.map((r) => `${name('formato', r.k)} ${r.n} virales`).join(' · ') : '';
  const rows = [vir, line('formato', 'FORMAT on our account (how many reached ' + p.viral / 1000 + 'k)'), line('hook', 'HOOK type'), line('ropa', 'Outfit'), line('escenario', 'Setting'), line('tipo', 'Video type'), line('familia', 'Family'), abWins, tr].filter(Boolean);
  return `SELF-LEARNING PLAYBOOK (real data, ${new Date(p.at).toISOString().slice(0, 10)}). A reel only counts as a success if it reached ${p.viral / 1000}k views; ${p.base}% of our reels do. Repeat what produced virals, drop what never does, keep testing what has few reels:\n- ` + rows.join('\n- ') + '\n';
}

function read() { try { return fs.readFileSync(FILE, 'utf8'); } catch { return ''; } }
function data() { try { return JSON.parse(fs.readFileSync(JSONF, 'utf8')); } catch { return null; } }

// Multiplicador para elegir ideas: lo que funciona en tu cuenta y lo que está explotando fuera pesa más
function weight(formato) {
  const p = data();
  if (!p || !formato) return 1;
  const mine = (p.formato || []).find((r) => r.k === formato);
  const tr = (p.trend || []).find((r) => r.k === formato);
  return Math.max(0.5, Math.min(2.5, (mine ? mine.x : 1) * (tr && tr.n >= 2 ? 1.2 : 1)));
}

module.exports = { compute, read, data, weight, FORMATS, HOOKS };
