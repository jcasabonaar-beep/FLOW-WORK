// Rutas del panel para los videos Higgsfield: /api/hf/...
const store = require('../store');
const config = require('../../config.json');
const hfp = require('./pipeline');

async function handle(req, res, parts, { send, readBody, pipeline }) {
  const method = req.method;
  const body = method === 'POST' ? JSON.parse((await readBody(req)).toString() || '{}') : {};
  // GET /api/hf/config
  if (parts[2] === 'config') return send(res, 200, { gates: config.higgsfield.gates, account: config.higgsfield.account, stages: hfp.STAGES, names: hfp.NAMES });
  if (parts[2] !== 'jobs') return send(res, 404, { error: 'ruta' });
  // POST /api/hf/jobs { url, title, outfit, place, notes }
  if (parts.length === 3 && method === 'POST') {
    if (!/^https?:\/\//i.test(String(body.url || '').trim())) return send(res, 400, { error: 'Pega el link del reel (Instagram o TikTok)' });
    const job = store.create({ ...body, kind: 'higgsfield' });
    pipeline.drive(job.id);
    return send(res, 200, job);
  }
  const job = store.load(parts[3]);
  if (!job || job.kind !== 'higgsfield') return send(res, 404, { error: 'No existe ese video Higgsfield' });
  const busy = pipeline.active.has(job.id);
  switch (parts[4]) {
    case 'analysis': {
      // Guardar el análisis editado a mano (JSON)
      if (busy) return send(res, 400, { error: 'Está trabajando: espera a que termine' });
      const { normalize, save } = require('../../workers/hf_analyst');
      let r;
      try { r = normalize(body.analysis, job.hf.refDuration); } catch (e) { return send(res, 400, { error: e.message }); }
      save(job, r.analysis, r.warnings, 'tú');
      store.log(job, 'hf_analyst', `✏️ Análisis v${job.hf.analysisV} editado por ti`);
      await require('../../workers/hf_capture').extractKeyframeRefs(job);
      return send(res, 200, { analysis: r.analysis, warnings: r.warnings });
    }
    case 'correct': {
      // Corrección en texto libre: Claude rehace el análisis aplicándola (manda sobre todo lo demás)
      if (busy) return send(res, 400, { error: 'Está trabajando: espera a que termine' });
      const text = String(body.text || '').trim().slice(0, 2000);
      if (!text) return send(res, 400, { error: 'Escribe la corrección' });
      if (!['analysis', 'review_analysis'].includes(job.stage)) return send(res, 400, { error: 'El análisis ya está aprobado' });
      job.hf.corrections.push({ at: Date.now(), text });
      store.log(job, 'hf_analyst', '✏️ Corrección: ' + text);
      Object.assign(job, { stage: 'analysis', status: 'running', error: null });
      store.save(job);
      pipeline.drive(job.id);
      return send(res, 200, { ok: true });
    }
    case 'approve': {
      if (busy) return send(res, 400, { error: 'Está trabajando: espera a que termine' });
      try { hfp.approve(job, body.stage); } catch (e) { return send(res, 400, { error: e.message }); }
      store.log(job, hfp.WORKER[hfp.STAGES[hfp.STAGES.indexOf(body.stage) - 1]] || 'hf_capture', `👍 ${hfp.NAMES[body.stage].replace('✋ ', '')}: aprobado por ti`);
      if (job.status === 'running') pipeline.drive(job.id);
      return send(res, 200, { ok: true });
    }
    case 'gates': {
      // Interruptores de las paradas solo para este video
      job.hf.gates = { ...(job.hf.gates || {}) };
      for (const k of ['analysis', 'keyframes', 'video']) if (k in body) job.hf.gates[k] = !!body[k];
      store.save(job);
      return send(res, 200, hfp.gates(job));
    }
  }
  return send(res, 404, { error: 'acción' });
}

module.exports = { handle };
