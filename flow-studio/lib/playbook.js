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

// Media "prudente": con pocos videos se acerca a 1× (no se fía de un solo dato)
const shrink = (vals, k = 2) => (vals.reduce((a, b) => a + b, 0) + k) / (vals.length + k);

function compute() {
  const res = store.load('_resultados') || {};
  const reels = (res.reels || []).filter((r) => r.views && r.jobId);
  const med = median((res.reels || []).map((r) => r.views).filter(Boolean)) || 1;
  const by = {};
  const add = (dim, key, v) => { if (!key) return; ((by[dim] ||= {})[key] ||= []).push(v); };
  const ab = [];
  for (const r of reels) {
    const j = store.load(r.jobId);
    if (!j) continue;
    const ratio = r.views / med;
    const B = r.version === 'B';
    add('formato', (j.plan || {}).format, ratio);
    add('hook', B ? (j.hookB || {}).type : (j.plan || {}).hookType, ratio);
    add('ropa', (j.plan || {}).outfit, ratio);
    add('escenario', j.setting, ratio);
    add('tipo', j.videoType, ratio);
    add('familia', (j.clips || []).some((c) => (c.family || []).length) ? 'con familia' : 'sin familia', ratio);
  }
  // A/B: el mismo video con dos hooks
  const pairs = {};
  for (const r of reels) (pairs[r.jobId] ||= {})[r.version || 'A'] = r.views;
  for (const [id, p] of Object.entries(pairs)) {
    if (!p.A || !p.B) continue;
    const j = store.load(id);
    ab.push({ title: j.title, a: (j.plan || {}).hookType, b: (j.hookB || {}).type, win: p.B > p.A ? 'B' : 'A', ratio: Math.max(p.A, p.B) / Math.max(1, Math.min(p.A, p.B)) });
  }
  // Lo que está explotando fuera (Investigador, últimos 7 días)
  const sug = (store.load('_investigador') || {}).suggestions || [];
  const trend = {};
  for (const s of sug) if (s.formato && (!s.postedAt || Date.now() - Date.parse(s.postedAt) < 7 * 86400000)) (trend[s.formato] ||= []).push(s.ratio || 1);
  const table = (dim) => Object.entries(by[dim] || {}).map(([k, v]) => ({ k, n: v.length, x: Math.round(shrink(v) * 10) / 10 })).sort((a, b) => b.x - a.x);
  const out = { at: Date.now(), median: med, formato: table('formato'), hook: table('hook'), ropa: table('ropa'), escenario: table('escenario'), tipo: table('tipo'), familia: table('familia'), ab,
    trend: Object.entries(trend).map(([k, v]) => ({ k, n: v.length, x: Math.round(median(v) * 10) / 10 })).sort((a, b) => b.n - a.n) };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(JSONF, JSON.stringify(out, null, 2));
  fs.writeFileSync(FILE, text(out));
  return out;
}

const name = (dim, k) => (dim === 'formato' ? FORMATS[k] : dim === 'hook' ? HOOKS[k] : null) || k;
function text(p) {
  const line = (dim, t) => (p[dim] || []).length ? `${t}: ` + p[dim].map((r) => `${name(dim, r.k)} ${r.x}× (${r.n} reel${r.n > 1 ? 's' : ''})`).join(' · ') : '';
  const abWins = p.ab.length ? `A/B tests (same video, two hooks): ` + p.ab.map((r) => `"${r.title}": ganó ${r.win} (${r.win === 'A' ? name('hook', r.a) : name('hook', r.b)} sobre ${r.win === 'A' ? name('hook', r.b) : name('hook', r.a)}, ${r.ratio.toFixed(1)}×)`).join(' · ') : '';
  const tr = p.trend.length ? `Exploding right now in similar accounts (last 7 days, number of virals and typical jump): ` + p.trend.map((r) => `${name('formato', r.k)} ${r.n} virales (${r.x}×)`).join(' · ') : '';
  const rows = [line('formato', 'FORMAT on OUR account (views vs our median, prudent average)'), line('hook', 'HOOK type'), line('ropa', 'Outfit'), line('escenario', 'Setting'), line('tipo', 'Video type'), line('familia', 'Family in the video'), abWins, tr].filter(Boolean);
  return rows.length ? `SELF-LEARNING PLAYBOOK (real data, updated ${new Date(p.at).toISOString().slice(0, 10)}). Favor what is above 1×, avoid what is clearly below, and keep testing formats with few reels:\n- ` + rows.join('\n- ') + '\n' : '';
}

function read() { try { return fs.readFileSync(FILE, 'utf8'); } catch { return ''; } }
function data() { try { return JSON.parse(fs.readFileSync(JSONF, 'utf8')); } catch { return null; } }

// Multiplicador para elegir ideas: lo que funciona en tu cuenta y lo que está explotando fuera pesa más
function weight(formato) {
  const p = data();
  if (!p || !formato) return 1;
  const mine = (p.formato || []).find((r) => r.k === formato);
  const tr = (p.trend || []).find((r) => r.k === formato);
  return Math.max(0.5, Math.min(2, (mine ? mine.x : 1) * (tr && tr.n >= 2 ? 1.15 : 1)));
}

module.exports = { compute, read, data, weight, FORMATS, HOOKS };
