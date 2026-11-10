// 🎥 Ficha de los videos Higgsfield (Diane). Usa los ayudantes de app.js ($, esc, api, job, refresh…)
let hfSig = '';
const hfFile = (p, v) => `/files/${job.id}/${p}${v ? '?v=' + v : ''}`;
const hfReview = (s) => HF_STAGES.some((x) => x[0] === s && x[2]);
const HF_WAIT = {
  review_analysis: 'Revisa el análisis de la referencia. Si algo no cuadra, escribe la corrección (manda sobre el análisis). Cuando esté bien, pulsa ✅ Aprobar análisis.',
  review_keyframes: 'Revisa los keyframes y apruébalos.',
  review_video: 'Revisa el vídeo y el informe de QA.',
  review_final: 'Todo listo: vídeo, hook, overlays y descripción.',
};
const fmtES = { loop: '🔁 Bucle (ejercicios)', narrative: '📖 Narrativa con objetos', talking: '🗣️ Hablando a cámara' };
const sec = (x) => `${Number(x).toFixed(1).replace(/\.0$/, '')}s`;

function renderHf(j) {
  renderHfTop(j);
  const sig = JSON.stringify([j.stage, j.status, j.running, j.hf.analysisV, (j.hf.sheets || []).length, (j.hf.corrections || []).length, j.hf.gates]);
  const editing = document.activeElement && document.activeElement.closest && document.activeElement.closest('#hfPanel') && document.activeElement.matches('textarea, input');
  if (sig !== hfSig && !editing) { hfSig = sig; renderHfPanel(j); }
}

function renderHfTop(j) {
  const si = HF_STAGES.findIndex((s) => s[0] === j.stage);
  const canContinue = !j.running && ['error', 'stopped', 'waiting_you'].includes(j.status) && !hfReview(j.stage);
  const paused = j.paused || j.status === 'paused';
  const mins = Math.round(Object.values(j.timings || {}).reduce((a, b) => a + b, 0) / 60000);
  let alert = '';
  if (j.error) alert = `<div class="alert ${j.status === 'waiting_limit' ? 'info' : ''}">${j.status === 'waiting_limit' ? '⏳' : '⚠️'} ${esc(j.error)}</div>`;
  else if (j.status === 'waiting_you') {
    const w = HF_WORKERS.find(([k]) => j.workers[k].state === 'waiting_you');
    alert = `<div class="alert info">✋ ${esc(HF_WAIT[j.stage] || (w && j.workers[w[0]].action) || 'Necesita que lo mires')}</div>`;
  }
  $('#hfTop').innerHTML = `
    <header class="job-head">
      <div><h1>🎥 ${esc(j.title)}</h1>
        <div class="muted">Higgsfield · @diane.glows · ${new Date(j.createdAt).toLocaleString()} · ${mins} min de trabajo${j.url ? ` · <a href="${esc(j.url)}" target="_blank" style="color:#93c5fd">referencia</a>` : ''}</div></div>
      <div class="head-actions">
        ${paused || j.running ? `<button id="hfPause">${paused ? '▶ Reanudar' : '⏹ Parar ahora'}</button>` : ''}
        ${canContinue ? '<button id="hfContinue" class="primary">▶ Continuar</button>' : ''}
        ${dotsMenu(j.id)}
      </div>
    </header>
    <ol class="stages">${HF_STAGES.map((s, i) => `<li class="${i < si ? 'done' : i === si ? 'now' : ''} ${s[2] ? 'stop' : ''}">${i < si ? '✓ ' : ''}${s[1]}</li>`).join('')}</ol>
    ${alert}
    <div class="offices">${HF_WORKERS.map(([k, icon, name, desc]) => {
      const w = j.workers[k];
      const st = w.paused && w.state !== 'working' ? 'paused' : w.state;
      return `<div class="office ${st}">
        <div class="office-head"><b>${icon} ${name}</b><span class="badge ${st}">${STATE_ES[st] || st}</span></div>
        <div class="muted" style="font-size:12px">${desc}</div>
        <div class="action">${esc(w.action)}</div>
        <pre class="log">${esc(w.log.slice(-6).join('\n'))}</pre>
        <div class="office-btns">${w.state === 'working' && k === 'hf_analyst' ? `<button class="small" data-hfstop="${k}">⏹ Detener ya</button>` : ''}<button class="small" data-hfoffice="${k}">🔍 Ver oficina</button></div>
      </div>`;
    }).join('')}</div>`;
  const b = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
  b('hfContinue', () => api('jobs/' + j.id + '/continue', {}).then(refresh));
  b('hfPause', () => {
    if (paused) return api('jobs/' + j.id + '/resume', {}).then(refresh);
    if (confirm('¿Parar ahora? Lo ya hecho se guarda y luego puedes Reanudar.')) api('jobs/' + j.id + '/stop-all', {}).then(refresh);
  });
  document.querySelectorAll('[data-hfoffice]').forEach((x) => x.onclick = () => viewOffice(x.dataset.hfoffice));
  document.querySelectorAll('[data-hfstop]').forEach((x) => x.onclick = () => confirm('¿Detener ya? Lo que esté a medias se pierde.') && api('jobs/' + j.id + '/stop-worker', { worker: x.dataset.hfstop }));
  bindDots($('#hfTop'));
  if ($('#dlgOffice').open && $('#dlgOffice').dataset.w) viewOffice($('#dlgOffice').dataset.w, true);
}

function renderHfPanel(j) {
  const hf = j.hf;
  const g = { ...(window.HF_GATES || {}), ...(hf.gates || {}) };
  let h = `<div class="notes hf-gates"><b>Paradas para tu OK</b>
    ${[['analysis', 'Análisis'], ['keyframes', 'Keyframes'], ['video', 'Vídeo']].map(([k, n]) => `<label class="inline"><input type="checkbox" data-hfgate="${k}" ${g[k] !== false ? 'checked' : ''}> ${n}</label>`).join('')}
    <span class="muted" style="font-size:12px">La entrega final siempre te espera.</span></div>`;

  // ---- Referencia ----
  h += '<h2 class="sec">🎞️ Referencia</h2>';
  if (j.stage === 'capture' && !j.running && j.workers.hf_capture.state === 'waiting_you' || !hf.sheets) {
    h += `<div class="notes">${hf.sheets ? '' : '<span class="muted">Todavía sin descargar. </span>'}Si no se puede descargar, súbela tú:
      <label class="inline"><input type="file" accept="video/*" id="hfRefFile"></label></div>`;
  }
  if (hf.sheets && hf.sheets.length) {
    h += `<div class="hf-ref">
      <video src="${hfFile('ref/video.mp4', hf.refDuration)}" controls playsinline class="hf-video"></video>
      <div class="hf-sheets">${hf.sheets.map((s) => `<a href="${hfFile(s)}" target="_blank"><img src="${hfFile(s)}" alt="hoja de contactos"></a>`).join('')}
        <div class="muted" style="font-size:12px">${sec(hf.refDuration)} · ${hf.frames.length} frames a 2 fps · ${hf.scenes.length} cortes (en rojo) · ${esc(hf.platform)}${hf.refInfo && hf.refInfo.views ? ` · ${hf.refInfo.views.toLocaleString()} visitas` : ''}</div></div></div>`;
    if (hf.description) h += `<details class="notes"><summary>📝 Descripción original</summary><pre class="hf-pre">${esc(hf.description)}</pre></details>`;
    if (hf.transcript) h += `<details class="notes"><summary>🎧 Lo que dice</summary><p>${esc(hf.transcript)}</p></details>`;
  }
  const o = hf.overrides || {};
  if (o.outfit || o.place || o.notes) h += `<div class="notes"><b>Tus ajustes:</b> ${[o.outfit && 'ropa: ' + esc(o.outfit), o.place && 'sitio: ' + esc(o.place), o.notes && 'notas: ' + esc(o.notes)].filter(Boolean).join(' · ')}</div>`;

  // ---- Análisis ----
  const a = hf.analysis;
  if (a) h += analysisHtml(j, a);
  else if (['analysis', 'capture'].includes(j.stage)) h += `<h2 class="sec">🧠 Análisis</h2><p class="muted">${j.stage === 'analysis' && j.running ? 'Claude está mirando la referencia…' : 'Cuando la referencia esté lista, Claude hará el análisis.'}</p>`;
  $('#hfPanel').innerHTML = h;
  bindHfPanel(j);
}

function analysisHtml(j, a) {
  const hf = j.hf;
  const canEdit = ['analysis', 'review_analysis'].includes(j.stage) && !j.running;
  const ot = a.onscreen_text || {};
  const kv = (k, v) => (v ? `<div><span class="muted">${k}</span> ${esc(v)}</div>` : '');
  const cam = a.camera || {};
  let h = `<h2 class="sec">🧠 Análisis <span class="badge">v${hf.analysisV}${hf.analysisBy === 'tú' ? ' · editado por ti' : ''}</span></h2>
    <div class="notes"><p style="margin-top:0">${esc(a.summary_es)}</p>
      <span class="badge">${fmtES[a.format] || a.format}</span> <span class="badge">⏱ ${a.target_seconds} s</span> <span class="badge">🖼️ keyframes: ${a.keyframes.strategy === 'loop' ? 'bucle (una imagen)' : 'start + end'}</span> <span class="badge">📷 ${cam.support === 'handheld' ? 'en mano' : 'trípode'}</span></div>`;
  if ((hf.warnings || []).length) h += `<div class="alert">⚠️ ${hf.warnings.map(esc).join('<br>⚠️ ')}</div>`;
  if ((a.questions_es || []).length) h += `<div class="notes hf-q"><b>❓ Dudas del análisis</b> <span class="muted">(respóndelas en la corrección)</span><ul>${a.questions_es.map((q) => `<li>${esc(q)}</li>`).join('')}</ul></div>`;
  h += `<table class="hf-table"><thead><tr><th>Tramo</th><th>Acción</th></tr></thead><tbody>${a.actions.map((x) => `<tr><td>${sec(x.from)}–${sec(x.to)}</td><td>${esc(x.es)}<div class="muted hf-en">${esc(x.en)}</div></td></tr>`).join('')}</tbody></table>`;
  h += `<div class="hf-grid">
    <div class="notes">${kv('👗 Ropa', a.outfit)}${kv('🏠 Sitio', a.setting)}${kv('💇 Peinado', a.hairstyle)}${kv('💡 Luz', a.light)}</div>
    <div class="notes">${kv('📷 Soporte', cam.support)}${kv('Altura', cam.height)}${kv('Distancia', cam.distance_m ? cam.distance_m + ' m' : '')}${kv('Encuadre', cam.framing)}${kv('Ángulo', cam.angle)}</div>
    <div class="notes">${ot.hook ? `<div><span class="muted">Hook de la referencia</span> “${esc(ot.hook)}”</div>` : '<div class="muted">Sin hook en pantalla</div>'}${kv('Hook para Diane', ot.hook_diane)}
      ${(ot.counters || []).map((c) => `<div><span class="muted">Contador ${sec(c.from)}–${sec(c.to)}</span> ${esc(c.text)}</div>`).join('')}
      ${(ot.other || []).map((c) => `<div><span class="muted">Texto ${sec(c.from || 0)}–${sec(c.to || 0)}</span> ${esc(c.text)}</div>`).join('')}
      ${(a.overlays || []).map((c) => `<div><span class="muted">Panel ${sec(c.from || 0)}–${sec(c.to || 0)}</span> ${esc(c.what_es || '')}</div>`).join('')}</div>
  </div>`;
  h += `<h3>🖼️ Keyframes previstos</h3><div class="cards">${a.keyframes.items.map((k) => `<div class="card"><h3>${k.role === 'start' ? (a.keyframes.strategy === 'loop' ? 'Start = end frame' : 'Start frame') : 'End frame'} <span class="muted">${sec(k.ref_time)} de la referencia</span></h3>
      ${k.ref_file ? `<a href="${hfFile(k.ref_file, hf.analysisV)}" target="_blank"><img class="hf-kf" src="${hfFile(k.ref_file, hf.analysisV)}"></a>` : ''}
      <div style="font-size:13px">${esc(k.why_es)}</div><div class="muted hf-en">${esc(k.pose_en)}</div></div>`).join('')}</div>
    ${a.keyframes.why_es ? `<p class="muted">${esc(a.keyframes.why_es)}</p>` : ''}`;
  if ((a.risks_es || []).length) h += `<div class="notes"><b>🔎 Riesgos para el QA</b><ul>${a.risks_es.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>`;
  if ((hf.corrections || []).length) h += `<div class="notes"><b>✏️ Tus correcciones</b> (mandan sobre el análisis)<ol>${hf.corrections.map((c) => `<li>${esc(c.text)}</li>`).join('')}</ol></div>`;
  if (canEdit) {
    h += `<div class="notes"><label style="margin-top:0">Corrección (en tus palabras; Claude rehace el análisis aplicándola)
        <textarea id="hfCorr" rows="3" placeholder="p. ej. en el segundo ejercicio abre piernas y brazos a la vez"></textarea></label>
        <button id="hfCorrBtn">✏️ Corregir con Claude</button></div>
      <details class="notes"><summary>🛠 Editar el JSON a mano</summary><textarea id="hfJson" rows="18" class="hf-json">${esc(JSON.stringify(a, null, 2))}</textarea><button id="hfJsonBtn">💾 Guardar el JSON</button></details>`;
  }
  if (j.stage === 'review_analysis' && !j.running) h += '<div class="bigbar"><button class="good big" id="hfApprove">✅ Aprobar análisis y pasar a keyframes</button></div>';
  return h;
}

function bindHfPanel(j) {
  const b = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
  document.querySelectorAll('[data-hfgate]').forEach((x) => x.onchange = () => api(`hf/jobs/${j.id}/gates`, { [x.dataset.hfgate]: x.checked }).then(refresh));
  const rf = document.getElementById('hfRefFile');
  if (rf) rf.onchange = async () => { if (rf.files[0]) { await upload('ref', 0, rf.files[0]); await api('jobs/' + j.id + '/continue', {}); refresh(); } };
  b('hfCorrBtn', async () => {
    const t = $('#hfCorr').value.trim();
    if (!t) return alert('Escribe la corrección');
    await api(`hf/jobs/${j.id}/correct`, { text: t });
    hfSig = '';
    refresh();
  });
  b('hfJsonBtn', async () => {
    let parsed;
    try { parsed = JSON.parse($('#hfJson').value); } catch (e) { return alert('El JSON no es válido: ' + e.message); }
    const r = await api(`hf/jobs/${j.id}/analysis`, { analysis: parsed });
    if (r.warnings && r.warnings.length) alert('Guardado. Avisos:\n- ' + r.warnings.join('\n- '));
    hfSig = '';
    refresh();
  });
  b('hfApprove', async () => {
    if ((j.hf.analysis.questions_es || []).length && !(j.hf.corrections || []).length && !confirm('El análisis tiene dudas sin responder. ¿Aprobar igualmente?')) return;
    await api(`hf/jobs/${j.id}/approve`, { stage: 'review_analysis' });
    hfSig = '';
    refresh();
  });
}

// ---- Botón "Nuevo vídeo Higgsfield" ----
$('#btnHfNew').onclick = async () => {
  try { const c = await api('hf/config'); window.HF_GATES = c.gates; } catch {}
  $('#dlgHf').showModal();
};
$('#formHf').onsubmit = async (e) => {
  if (e.submitter && e.submitter.value === 'cancel') return;
  const data = Object.fromEntries(new FormData(e.target));
  const j = await api('hf/jobs', data);
  e.target.reset();
  open(j.id);
};
api('hf/config').then((c) => { window.HF_GATES = c.gates; }).catch(() => {});
