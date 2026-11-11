// Rutas del panel para los videos Higgsfield: /api/hf/...
const store = require('../store');
const config = require('../../config.json');
const hfp = require('./pipeline');

async function handle(req, res, parts, { send, readBody, pipeline }) {
  const method = req.method;
  const body = method === 'POST' ? JSON.parse((await readBody(req)).toString() || '{}') : {};
  // GET /api/hf/config
  if (parts[2] === 'config') return send(res, 200, { gates: config.higgsfield.gates, account: config.higgsfield.account, stages: hfp.STAGES, names: hfp.NAMES });
  // 🎓 Modo aprendizaje de Higgsfield
  if (parts[2] === 'learn') {
    const learn = require('../../workers/hf_learn');
    if (method === 'POST' && parts[3] === 'stop') return send(res, 200, { ok: learn.stop() });
    if (method === 'POST' && parts[3] === 'check') {
      if (require('../lock').isBusy()) return send(res, 400, { error: 'El Chrome está ocupado (generando o aprendiendo): espera a que termine' });
      const { loadMap, validate } = require('./selectors');
      try {
        const report = await require('./provider/web').check();
        return send(res, 200, { format: validate(loadMap()), report });
      } catch (e) { return send(res, 400, { error: e.message }); }
    }
    if (method === 'POST') {
      // Con thenJob: si aprende bien, ese vídeo sigue solo
      const then = body.thenJob && store.load(body.thenJob);
      if (then) { store.log(then, 'hf_keyframes', '🎓 Volviendo a aprender Higgsfield; después sigo solo'); Object.assign(then, { error: 'Aprendiendo Higgsfield otra vez… al terminar sigo solo (mira el recuadro de Keyframes).' }); store.save(then); }
      learn.run().then((r) => {
        if (!then) return;
        const ok = r && !r.error && !(r.errors || []).length;
        const j2 = store.load(then.id);
        if (ok) pipeline.drive(then.id);
        else { j2.error = 'El aprendizaje no terminó bien: ' + ((r && (r.error || (r.errors || []).join(' · '))) || '¿?') + '. Mira el recuadro de Keyframes y mándame una captura.'; store.save(j2); }
      });
      return send(res, 200, { ok: true });
    }
    const fs = require('fs');
    const test = require('path').join(store.ROOT, 'memory', 'higgsfield-learn', 'test.png');
    return send(res, 200, { ...learn.status(), testImage: fs.existsSync(test) ? 'memory/higgsfield-learn/test.png?v=' + fs.statSync(test).mtimeMs : null });
  }
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
    case 'kf': {
      // Keyframes: aprobar / elegir otro intento / regenerar / editar con nota
      if (busy) return send(res, 400, { error: 'Está trabajando: espera a que termine' });
      const kfw = require('../../workers/hf_keyframes');
      if (!job.hf.analysis) return send(res, 400, { error: 'Falta el análisis' });
      const kf = kfw.ensureState(job);
      const item = kf.items.find((x) => x.role === body.role);
      if (!item) return send(res, 404, { error: 'Ese keyframe no existe' });
      const note = String(body.note || '').trim().slice(0, 2000);
      const cur = kfw.current(item);
      if (body.action === 'approve' || body.action === 'choose') {
        if (body.n) { if (!item.tries.some((t) => t.n === +body.n)) return send(res, 400, { error: 'Ese intento no existe' }); item.chosen = +body.n; }
        if (!kfw.current(item)) return send(res, 400, { error: 'Todavía no hay imagen' });
        if (body.action === 'approve') { item.status = 'approved'; kfw.current(item).verdict = 'aprobado'; store.log(job, 'hf_keyframes', `👍 ${item.role} frame (intento ${item.chosen}) aprobado por ti`); }
        store.save(job);
        return send(res, 200, item);
      }
      if (body.action === 'regen' || body.action === 'edit') {
        if (body.action === 'edit' && (!note || !cur)) return send(res, 400, { error: 'Escribe qué hay que cambiar' });
        if (cur) cur.verdict = (body.action === 'edit' ? 'editar: ' : 'regenerar: ') + (note || 'sin nota');
        Object.assign(item, { status: 'regen', mode: body.action === 'edit' ? 'edit' : null, note });
        store.log(job, 'hf_keyframes', `${body.action === 'edit' ? '✏️ Editar' : '↻ Regenerar'} ${item.role} frame${note ? ': ' + note : ''}`);
        if (['review_keyframes', 'keyframes'].includes(job.stage)) Object.assign(job, { stage: 'keyframes', status: 'running', error: null });
        store.save(job);
        if (job.stage === 'keyframes') pipeline.drive(job.id);
        return send(res, 200, item);
      }
      return send(res, 400, { error: 'acción' });
    }
    case 'approve': {
      if (busy) return send(res, 400, { error: 'Está trabajando: espera a que termine' });
      if (body.stage === 'review_keyframes' && !((job.hf.kf || {}).items || []).every((x) => x.status === 'approved')) return send(res, 400, { error: 'Aprueba antes cada keyframe' });
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
