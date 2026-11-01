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

// 🎨 Imágenes del avatar (en Flow): 4 fotos de la versión actual. Si elegiste una "base" (⭐), salen con esa misma cara,
// así el personaje se va puliendo con el tiempo en vez de empezar de cero.
const SHOTS = [
  ['retrato', 'close-up portrait, face and shoulders, looking straight into the lens with a warm confident expression'],
  ['cocina', 'waist-up shot in the kitchen of the house, holding a bowl of a homemade remedy toward the camera, talking'],
  ['cuerpo', 'full-body shot standing in the house showing the signature outfit clearly, natural relaxed pose'],
  ['accion', 'medium shot doing a typical video action of the account (pouring a liquid on a clear glass prop on the counter), looking at the camera'],
];
async function makeImages() {
  if (running) return;
  running = true;
  const j = ajob();
  const setW = (p) => store.setWorker(j, 'avatar', p);
  const lock = require('../lib/lock');
  try {
    const d = lab.load();
    const v = d.versions[0];
    if (!v) throw new Error('Primero crea el perfil ideal (🧬 Actualizar ahora)');
    const P = v.ideal.personaje || {};
    const rel = `avatar_lab/v${d.versions.length}`;
    const dir = path.join(store.ROOT, rel);
    fs.mkdirSync(dir, { recursive: true });
    const fav = d.favorite && fs.existsSync(path.join(store.ROOT, d.favorite)) ? path.join(store.ROOT, d.favorite) : null;
    const who = `${P.genero || ''} ${P.edad || ''}: ${P.aspecto || ''}`.trim();
    const tasks = SHOTS.map(([k, shot]) => ({ dest: path.join(dir, `${k}.png`), text: `### Avatar ${k}\n${fav ? `Upload Image A = ${fav}\n` : 'No images to upload.\n'}Aspect ratio 9:16, 1 output.\n` +
      `Prompt: "Ultra-realistic smartphone photo, ${shot}. ${fav ? 'The SAME person as Image A (keep the face, hair and age exactly), ' : ''}${who}. Wearing ${P.ropa || 'casual clothes'}. Setting: ${P.casa || 'a bright modern American home'}, with a small US flag visible. Natural daylight, natural skin texture with pores and wrinkles, no beauty filter, vertical 9:16, no text."\nThen download and save to: ${path.join(dir, `${k}.png`)}` }));
    setW({ state: 'working', action: 'Esperando a que el Chrome de Flow quede libre…' });
    await lock.acquire();
    try {
      setW({ action: `🎨 Creando 4 imágenes del avatar (versión ${d.versions.length})…` });
      await require('../lib/chrome').ensure(j, 'avatar');
      const { operatorPrompt } = require('./flow');
      const config = require('../config.json');
      await claude.run({ job: j, worker: 'avatar', browser: true, cwd: store.ROOT, tools: ['Read', 'Write', 'Edit', 'Bash(node:*)'],
        prompt: operatorPrompt(j, 'FRAMES worker', `${config.frameModel} (image generation)`, tasks, path.join(dir, 'status.json'), 'These are 4 portraits of a NEW avatar for a future account (not Emma). 1 output each, no quality retries unless clearly broken.\n\n') });
    } finally {
      lock.release();
    }
    const d2 = lab.load();
    d2.versions[0].images = SHOTS.map(([k]) => `${rel}/${k}.png`).filter((f) => fs.existsSync(path.join(store.ROOT, f)));
    lab.save(d2);
    setW({ state: 'done', action: `✅ ${d2.versions[0].images.length} imágenes del avatar (versión ${d2.versions.length})` });
  } catch (e) {
    setW({ state: 'error', action: e.message.slice(0, 300) });
    store.log(j, 'avatar', '❌ ' + e.message);
  } finally {
    running = false;
  }
}

function favorite(file) {
  const d = lab.load();
  d.favorite = file || null;
  lab.save(d);
  return d.favorite;
}

module.exports = { AID, ajob, run, makeImages, favorite, isRunning: () => running };
