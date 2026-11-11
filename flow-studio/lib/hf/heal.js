// 🩹 Autorreparación: si Higgsfield no se comporta como el mapa (un botón cambió de nombre, un panel escondido…),
// Claude mira la captura de ese momento, arregla el mapa y se reintenta solo. Como mucho 2 veces por paso.
// Lo que de verdad te necesita (login, captcha, términos, límites, créditos) NO se arregla solo: para y te avisa.
const store = require('../store');

async function withHeal(job, worker, label, fn, { max = 2 } = {}) {
  for (let k = 0; ; k++) {
    try {
      return await fn();
    } catch (e) {
      if (!e.heal || k >= max) {
        if (e.heal) e.message += ' (ya lo intenté arreglar solo ' + k + ' veces: mándame la captura)';
        throw e;
      }
      store.log(job, worker, `🩹 ${label}: Higgsfield no está como esperaba (${e.message.slice(0, 160)}). Lo arreglo solo (${k + 1}/${max})…`);
      store.setWorker(job, worker, { action: `🩹 Arreglando el mapa de Higgsfield (${k + 1}/${max}): no toques el Chrome de Flow Studio…` });
      const r = await require('../../workers/hf_learn').run({ haveLock: true, problem: e.message, debug: e.debug, skipTest: true });
      const bad = r && (r.error || (r.errors || []).length);
      if (bad) {
        const err = new Error(`No pude arreglar solo el mapa de Higgsfield: ${r.error || r.errors.join(' · ')}. Error original: ${e.message}`);
        err.noRetry = true;
        err.debug = e.debug;
        throw err;
      }
      store.log(job, worker, '🩹 Mapa arreglado: lo intento otra vez');
    }
  }
}

module.exports = { withHeal };

// Si todavía no hay mapa de Higgsfield (o está incompleto para esta pantalla), aprende solo antes de seguir
async function ensureMap(job, worker, kind) {
  const config = require('../../config.json');
  if ((config.higgsfield.provider || 'web') !== 'web') return;
  const { loadMap, validate } = require('./selectors');
  const errs = () => validate(loadMap()).filter((e) => e.startsWith(kind));
  if (!errs().length) return;
  store.log(job, worker, `🎓 Todavía no sé manejar la pantalla de ${kind === 'video' ? 'vídeo' : 'imagen'} de Higgsfield: la aprendo ahora (unos minutos; no toques el Chrome de Flow Studio)`);
  store.setWorker(job, worker, { action: '🎓 Aprendiendo Higgsfield (unos minutos; no toques el Chrome de Flow Studio)…' });
  const r = await require('../../workers/hf_learn').run({ haveLock: true, skipTest: kind !== 'image' });
  const left = errs();
  if ((r && r.error) || left.length) {
    const e = new Error(`No pude aprender Higgsfield: ${(r && r.error) || left.join(' · ')}. Mira el recuadro "Mapa de Higgsfield" (más abajo) y mándame una captura.`);
    e.noRetry = true;
    throw e;
  }
  store.log(job, worker, '🎓 Higgsfield aprendido');
}

module.exports.ensureMap = ensureMap;
