// 🧬 ESTRATEGA DEL AVATAR: con lo que va guardando el Investigador, diseña (y mejora cada semana) el perfil ideal para una cuenta futura
const fs = require('fs');
const path = require('path');
const store = require('../lib/store');
const claude = require('../lib/claude');
const lab = require('../lib/avatarlab');
const { fill } = require('./director');

const AID = '_avatar';
let running = false;

function ajob() {
  let j = store.load(AID);
  if (!j) {
    fs.mkdirSync(path.join(store.jobDir(AID), 'logs'), { recursive: true });
    j = { id: AID, title: 'Avatar ideal', createdAt: Date.now(), hidden: true, workers: { avatar: { state: 'idle', action: '', log: [], paused: false } } };
    store.save(j);
  }
  return j;
}

async function run() {
  if (running) return;
  running = true;
  const j = ajob();
  const setW = (p) => store.setWorker(j, 'avatar', p);
  try {
    const rank = lab.ranking().filter((a) => a.medianViews);
    if (rank.length < 3) throw new Error('Aún hay pocos datos: el Investigador necesita revisar al menos 3 cuentas (pulsa 🔎 Sugerir en Ideas)');
    setW({ state: 'working', action: `Estudiando ${rank.length} cuentas…` });
    const d = lab.load();
    const prev = d.versions[0];
    const accounts = rank.map((a) => `- @${a.account}: ${a.followers ?? '?'} seguidores, ${a.posts ?? '?'} publicaciones, visitas típicas ${a.medianViews}, máx ${a.maxViews}, eficiencia ${a.efficiency ?? '?'}×` +
      `${a.history && a.history.length > 1 ? `, seguidores hace ${Math.round((Date.now() - a.history[0].at) / 86400000)} días: ${a.history[0].followers ?? '?'}` : ''}\n  aspecto: ${a.look || '?'}\n  concepto: ${a.concept || '?'} · idioma ${a.lang || '?'}\n  bio: ${(a.bio || '').replace(/\n/g, ' ').slice(0, 160)}`).join('\n');
    const out = path.join(store.jobDir(AID), 'ideal.json');
    if (fs.existsSync(out)) fs.unlinkSync(out);
    const text = await claude.run({ job: j, worker: 'avatar', tools: ['Write'], cwd: store.jobDir(AID),
      prompt: fill(fs.readFileSync(path.join(store.ROOT, 'prompts', 'avatar_lab.md'), 'utf8'), { ACCOUNTS: accounts, OUT: out, PREVIOUS: prev ? JSON.stringify(prev.ideal).slice(0, 4000) : '(first version)' }) });
    const ideal = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : claude.extractJson(text);
    d.versions = [{ at: Date.now(), accounts: rank.length, ideal }, ...(d.versions || [])].slice(0, 12);
    lab.save(d);
    setW({ state: 'done', action: `✅ Perfil ideal v${d.versions.length} listo (con ${rank.length} cuentas)` });
    store.log(j, 'avatar', `✅ Nueva versión del perfil ideal. ${ideal.cambios || ''}`);
  } catch (e) {
    setW({ state: 'error', action: e.message.slice(0, 300) });
    store.log(j, 'avatar', '❌ ' + e.message);
  } finally {
    running = false;
  }
}

module.exports = { AID, ajob, run, isRunning: () => running };
