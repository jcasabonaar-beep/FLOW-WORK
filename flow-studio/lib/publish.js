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
  const pending = all.filter((j) => !j.published).sort((a, b) => a.createdAt - b.createdAt);
  const sl = slots(pending.length);
  return {
    hours: hours().map(([h, m]) => `${h}:${String(m).padStart(2, '0')}`),
    items: pending.map((j, i) => ({ id: j.id, title: j.title, videoType: j.videoType, at: sl[i] ? sl[i].getTime() : null, file: j.finalFile, fileB: j.outputB ? j.finalFile.replace(/\.mp4$/, '-B.mp4') : null, hookB: j.hookB && j.hookB.line, kit: j.kit || null, driveName: j.driveName || null, cover: j.kit && j.kit.cover ? `/files/${j.id}/${j.kit.cover}` : null })),
    published: all.filter((j) => j.published).sort((a, b) => b.published.at - a.published.at).slice(0, 10).map((j) => ({ id: j.id, title: j.title, at: j.published.at })),
  };
}

function mark(id, on, at) {
  const j = store.load(id);
  if (!j) return null;
  j.published = on ? { at: Number(at) || Date.now() } : null;
  store.save(j);
  return j.published;
}

module.exports = { queue, mark, hours };
