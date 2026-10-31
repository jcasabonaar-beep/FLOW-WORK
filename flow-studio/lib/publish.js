// 📅 Publicar: reparte los videos terminados en las mejores horas (1-2 al día, separados) para programarlos a mano en Instagram
const store = require('./store');
const settings = require('./settings');
const config = require('../config.json');

// Horas (España) en las que publicar: las que diga el Analista de resultados o, si no hay datos, 14:00 y 20:00 (8:00 y 14:00 en Nueva York)
function hours() {
  const s = settings.get().publishHours;
  const r = ((store.load('_resultados') || {}).report || {}).horas;
  const list = (Array.isArray(s) && s.length ? s : Array.isArray(r) && r.length ? r : config.publishHours || ['14:00', '20:00'])
    .map((h) => String(h).match(/^(\d{1,2})(?::(\d{2}))?/)).filter(Boolean).map((m) => [+m[1], +(m[2] || 0)]);
  return list.sort((a, b) => a[0] * 60 + a[1] - (b[0] * 60 + b[1]));
}

// Próximos huecos a partir de ahora (hora de España)
function slots(n) {
  const out = [];
  const hs = hours();
  const now = new Date();
  for (let d = 0; out.length < n && d < 30; d++) {
    for (const [h, m] of hs) {
      const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, h, m);
      if (t - now > 20 * 60000) out.push(t);
      if (out.length >= n) break;
    }
  }
  return out;
}

function queue() {
  const all = store.list().filter((j) => j.status === 'done' && j.finalFile);
  const day = (t) => new Date(t).toDateString();
  const order = (a, b) => (day(a.createdAt) === day(b.createdAt) ? (a.priority ?? 99) - (b.priority ?? 99) || a.createdAt - b.createdAt : a.createdAt - b.createdAt);
  const base = (j) => ({ id: j.id, title: j.title, why: j.pickReason || '', videoType: j.videoType, kit: j.kit || null, driveName: j.driveName || null, cover: j.kit && j.kit.cover ? `/files/${j.id}/${j.kit.cover}` : null });
  const mains = all.filter((j) => !j.published).sort(order).map((j) => ({ ...base(j), file: j.finalFile }));
  const trials = all.filter((j) => j.outputB && !j.publishedB).sort(order).map((j) => ({ ...base(j), trial: true, hookB: j.hookB && j.hookB.line, file: j.finalFile.replace(/\.mp4$/, '-B.mp4') }));
  // Cada reel de prueba (B) va justo después de su video normal: A1, B1, A2, B2, A3, A4…
  const items = [];
  for (const m of mains) { items.push(m); const t = trials.findIndex((x) => x.id === m.id); if (t >= 0) items.push(...trials.splice(t, 1)); }
  items.push(...trials); // pruebas cuyo video normal ya se publicó
  const sl = slots(items.length);
  items.forEach((it, i) => { it.at = sl[i] ? sl[i].getTime() : null; });
  return {
    hours: hours().map(([h, m]) => `${h}:${String(m).padStart(2, '0')}`),
    items,
    published: all.filter((j) => j.published).sort((a, b) => b.published.at - a.published.at).slice(0, 10).map((j) => ({ id: j.id, title: j.title, at: j.published.at })),
  };
}

function mark(id, on, at, trial) {
  const j = store.load(id);
  if (!j) return null;
  const k = trial ? 'publishedB' : 'published';
  j[k] = on ? { at: Number(at) || Date.now() } : null;
  store.save(j);
  return j[k];
}

module.exports = { queue, mark, hours };
