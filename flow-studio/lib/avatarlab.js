// 🧬 Laboratorio del avatar ideal: va guardando cómo son las cuentas que más viralizan con pocos videos
// y, de vez en cuando, diseña el perfil ideal para una cuenta futura. Separado de la producción.
const fs = require('fs');
const path = require('path');
const store = require('./store');

const FILE = path.join(store.ROOT, 'memory', 'avatar_lab.json');
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return { accounts: {}, versions: [] }; } }
function save(d) { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(d, null, 2)); }

// Cuentas a las que les falta (o tienen viejo, >7 días) el retrato del perfil: solo esas se miran con captura
function needProfile(accounts) {
  const d = load();
  return accounts.filter((a) => { const x = d.accounts[a]; return !x || !x.look || Date.now() - (x.profileAt || 0) > 7 * 86400000; });
}

// Guarda lo que ha leído el Investigador de cada cuenta
function record(data) {
  const d = load();
  for (const acc of data.accounts || []) {
    const views = (acc.reels || []).map((r) => r.views).filter((v) => v > 0);
    if (!views.length) continue;
    const x = d.accounts[acc.account] || { history: [] };
    const med = median(views);
    Object.assign(x, { followers: acc.followers || x.followers || null, medianViews: med, maxViews: Math.max(...views), updated: Date.now() });
    if (acc.profile) Object.assign(x, { posts: acc.profile.posts ?? x.posts, bio: acc.profile.bio || x.bio, look: acc.profile.look || x.look, concept: acc.profile.concept || x.concept, lang: acc.profile.lang || x.lang, profileAt: Date.now() });
    x.history = [...(x.history || []), { at: Date.now(), followers: x.followers, median: med }].slice(-30);
    d.accounts[acc.account] = x;
  }
  save(d);
}

// Eficiencia: visitas típicas por video frente a seguidores (las que viralizan sin tener aún comunidad)
function ranking() {
  const d = load();
  return Object.entries(d.accounts).map(([account, x]) => ({ account, ...x, efficiency: x.followers ? Math.round((x.medianViews / x.followers) * 100) / 100 : null }))
    .sort((a, b) => (b.efficiency ?? 0) - (a.efficiency ?? 0));
}

module.exports = { load, save, record, needProfile, ranking };
