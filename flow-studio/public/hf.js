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
  const kfSig = [((j.hf.kf || {}).items || []).map((x) => [x.role, x.status, x.chosen, x.tries.length, (x.tries[x.tries.length - 1] || {}).qa ? 1 : 0]),
    j.hf.video ? [j.hf.video.status, j.hf.video.chosen, j.hf.video.tries.length, (j.hf.video.tries[j.hf.video.tries.length - 1] || {}).qa ? 1 : 0] : 0, j.hf.post ? j.hf.post.at : 0];
  const sig = JSON.stringify([j.stage, j.status, j.running, j.hf.analysisV, (j.hf.sheets || []).length, (j.hf.corrections || []).length, j.hf.gates, kfSig, j.hf.debug]);
  const editing = document.activeElement && document.activeElement.closest && document.activeElement.closest('#hfPanel') && document.activeElement.matches('textarea, input');
  if (sig !== hfSig && !editing) { hfSig = sig; renderHfPanel(j); }
}

function renderHfTop(j) {
  const si = HF_STAGES.findIndex((s) => s[0] === j.stage);
  const canContinue = !j.running && ['error', 'stopped', 'waiting_you'].includes(j.status) && !hfReview(j.stage);
  const paused = j.paused || j.status === 'paused';
  const mins = Math.round(Object.values(j.timings || {}).reduce((a, b) => a + b, 0) / 60000);
  let alert = '';
  if (j.error) alert = `<div class="alert ${j.status === 'waiting_limit' ? 'info' : ''}">${j.status === 'waiting_limit' ? '⏳' : '⚠️'} ${esc(j.error)}${j.hf.debug && j.status === 'error' ? ` · <a href="${hfFile(j.hf.debug)}" target="_blank" style="color:#93c5fd">ver captura de Higgsfield</a>` : ''}${/Aprender Higgsfield/.test(j.error) && !j.running ? `<div style="margin-top:10px"><button class="primary big" id="hfLearnFix">🎓 Volver a aprender Higgsfield y seguir</button> <span class="muted" style="font-size:13px">Unos minutos. No toques el Chrome de Flow Studio mientras tanto; al terminar, este vídeo sigue solo.</span></div>` : ''}</div>`;
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
  b('hfLearnFix', async () => {
    await api('hf/learn', { thenJob: j.id });
    const el = document.getElementById('hfLearnFix');
    if (el) { el.disabled = true; el.textContent = '🎓 Aprendiendo… (mira el recuadro de Keyframes, más abajo)'; }
  });
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
  const afterAnalysis = HF_STAGES.findIndex((s) => s[0] === j.stage) >= HF_STAGES.findIndex((s) => s[0] === 'keyframes');
  // Con el análisis ya aprobado, los keyframes van primero y el análisis se pliega
  const idx = (s) => HF_STAGES.findIndex((x) => x[0] === s);
  if (a && afterAnalysis) {
    // Lo más reciente arriba: entrega → vídeo → keyframes → análisis
    if (idx(j.stage) >= idx('post') && hf.post && hf.post.description) h += postHtml(j);
    if (idx(j.stage) >= idx('video')) h += videoHtml(j);
    const kfFirst = idx(j.stage) < idx('video');
    h += kfFirst ? keyframesHtml(j) : `<details class="notes"><summary>🖼️ Keyframes aprobados</summary>${keyframesHtml(j)}</details>`;
    h += `<details class="notes"><summary>🧠 Análisis aprobado (v${hf.analysisV})</summary>${analysisHtml(j, a)}</details>`;
  }
  else if (a) h += analysisHtml(j, a);
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

function qaKf(t) {
  if (!t || !t.qa) return '';
  const q = t.qa;
  return `<div class="hf-qa ${q.pass ? 'ok' : 'bad'}">🔎 QA: ${q.pass ? '✅ todo bien' : '❌ ' + esc((q.problems_es || []).join(' · '))}${t.overlay ? ` <span class="muted">(fondo ${t.overlay.background_diff} · torso ${t.overlay.torso_diff})</span>` : ''}</div>`;
}

function videoHtml(j) {
  const v = j.hf.video;
  let h = '<h2 class="sec">🎥 Vídeo · Seedance (Unlimited)</h2>';
  if (!v || !v.tries.length) return h + `<p class="muted">${j.running ? esc(j.workers.hf_video.action || 'Trabajando…') : 'Todavía no hay vídeo.'}</p>`;
  const cur = v.tries.find((t) => t.n === v.chosen) || v.tries[v.tries.length - 1];
  const q = cur.qa;
  const canAct = !j.running && ['review_video', 'video'].includes(j.stage);
  h += `<div class="hf-ref"><video src="${hfFile(cur.file, cur.at)}" controls loop playsinline class="hf-video"></video><div style="flex:1;min-width:260px">
    <div><b>Intento ${cur.n}</b> · ${cur.seconds} s ${v.status === 'approved' ? '<span class="badge done">✅ aprobado</span>' : ''} ${cur.loop ? `<span class="badge">🔁 bucle ×${(cur.loop.after || cur.loop.before).ratio}${cur.loop.after ? ' (arreglado)' : ''}</span>` : ''}</div>
    ${v.tries.length > 1 ? `<div class="hf-btns" style="margin:6px 0">${v.tries.map((t) => `<button class="small" data-vchoose="${t.n}" ${t.n === cur.n ? 'disabled' : ''}>Intento ${t.n}${t.qa ? (t.qa.pass ? ' ✅' : ' ❌') : ''}</button>`).join('')}</div>` : ''}
    ${q ? `<table class="hf-table"><thead><tr><th>Tramo</th><th>QA</th></tr></thead><tbody>${(q.beats || []).map((b) => `<tr><td>${sec(b.from)}–${sec(b.to)}</td><td>${b.ok ? '✅' : '❌'} ${esc(b.seen_es || '')}${b.problem_es ? `<div class="hf-en" style="color:#fca5a5">${esc(b.problem_es)}</div>` : ''}</td></tr>`).join('')}</tbody></table>
      ${(q.deformations_es || []).length ? `<div class="hf-qa bad">Deformaciones: ${esc(q.deformations_es.join(' · '))}</div>` : ''}` : '<div class="muted">Sin QA todavía</div>'}
    ${cur.qaSheets ? `<details><summary class="muted" style="font-size:12px">Frames cada 0,4 s</summary>${cur.qaSheets.map((s) => `<a href="${hfFile(s)}" target="_blank"><img src="${hfFile(s)}" style="max-width:100%;border-radius:6px;margin-top:6px"></a>`).join('')}</details>` : ''}
    <details><summary class="muted" style="font-size:12px">Prompt</summary><pre class="hf-pre hf-en">${esc(cur.prompt)}</pre></details>
    ${canAct ? `<textarea rows="2" id="hfVNote" placeholder="Nota para regenerar (p. ej. en el segundo ejercicio abre piernas y brazos a la vez)"></textarea>
      <div class="hf-btns" style="margin-top:6px">${v.status !== 'approved' ? '<button class="small good" id="hfVApprove">✅ Aprobar vídeo</button>' : ''}<button class="small" id="hfVRegen">↻ Regenerar con la nota</button></div>` : ''}
  </div></div>`;
  if (j.stage === 'review_video' && !j.running) h += `<div class="bigbar"><button class="good big" id="hfVNext" ${v.status === 'approved' ? '' : 'disabled'}>✅ Vídeo aprobado: preparar la entrega</button>${v.status === 'approved' ? '' : '<span class="muted">Aprueba el vídeo para seguir.</span>'}</div>`;
  return h;
}

function postHtml(j) {
  const p = j.hf.post;
  let h = '<h2 class="sec">📦 Entrega</h2><div class="hf-grid">';
  h += `<div class="notes"><b>Hook en pantalla</b> <span class="muted">${sec(p.hook.from || 0)}–${sec(p.hook.to || 3)}</span><div class="hf-hook">${(p.hook.lines || []).map(esc).join('<br>')}</div>${p.hook.es ? `<div class="muted" style="font-size:12px">${esc(p.hook.es)}</div>` : ''}
    ${(p.counters || []).length ? `<b>Contadores</b><ul>${p.counters.map((c) => `<li>${sec(c.from)}–${sec(c.to)}: ${esc(c.text)}</li>`).join('')}</ul>` : ''}
    ${(p.panels || []).length ? `<b>Paneles 21:9</b><ol>${p.panels.map((x) => `<li>${sec(x.from)}–${sec(x.to)}: ${esc(x.what_es)}<details><summary class="muted" style="font-size:12px">prompt</summary><pre class="hf-pre hf-en">${esc(x.prompt_en)}</pre></details></li>`).join('')}</ol>` : ''}
    ${p.plan ? `<details><summary><b>Plan de CapCut</b></summary><p style="white-space:pre-wrap;font-size:13px">${esc(p.plan)}</p></details>` : ''}
    <div class="hf-btns"><a href="${hfFile(p.video)}" download><button class="small">⬇️ Vídeo limpio</button></a><a href="${hfFile('post/overlays.md')}" target="_blank"><button class="small">📝 Overlays</button></a></div></div>`;
  h += `<div class="notes"><b>Descripción</b> <button class="small primary" id="hfCopy">📋 Copiar</button> ${p.docUrl ? `<a href="${esc(p.docUrl)}" target="_blank" style="color:#93c5fd;font-size:13px">📄 Google Doc</a>` : '<span class="muted" style="font-size:12px">(sin Google Doc)</span>'}
    ${(p.warnings || []).length ? `<div class="hf-qa bad">⚠️ ${esc(p.warnings.join(' · '))}</div>` : ''}
    <pre class="hf-pre hf-desc" id="hfDesc">${esc(p.description)}</pre></div>`;
  h += `<div class="notes"><b>📌 Al publicar</b><ul><li>Activa la etiqueta de <b>contenido IA</b>.</li><li>Programa a las <b>8:00 ET</b> (son las <b>5:00</b> en el iPhone, hora de Los Ángeles).</li></ul>${p.driveDir ? `<div class="muted" style="font-size:12px">☁️ En tu Drive: ${esc(p.driveDir)}</div>` : ''}</div></div>`;
  if (j.stage === 'review_final' && !j.running) h += `<div class="notes"><textarea rows="2" id="hfPNote" placeholder="¿Cambiar algo de la entrega? (p. ej. el hook más corto, 6 puntos en vez de 7)"></textarea><button class="small" id="hfPRegen">↻ Rehacer la entrega con la nota</button></div>
    <div class="bigbar"><button class="good big" id="hfDone">✅ Listo: pasar a Terminados</button></div>`;
  return h;
}

const KF_ES = { pending: 'pendiente', generated: 'para revisar', approved: '✅ aprobado', regen: 'a rehacer' };
function keyframesHtml(j) {
  const kf = j.hf.kf || { items: [] };
  const loop = j.hf.analysis.keyframes.strategy === 'loop';
  const name = (r) => (r === 'start' ? (loop ? 'Start = end frame (bucle)' : 'Start frame') : 'End frame');
  let h = '<h2 class="sec">🖼️ Keyframes · Nano Banana Pro (Unlimited)</h2><div id="hfLearn" class="notes"><span class="muted">Mirando el mapa de Higgsfield…</span></div>';
  if (!kf.items.length) return h + `<p class="muted">${j.running ? 'Escribiendo el primer prompt…' : 'Todavía no hay keyframes.'}</p>`;
  h += `<div class="cards">${kf.items.map((it) => {
    const cur = it.tries.find((t) => t.n === it.chosen) || it.tries[it.tries.length - 1];
    const canAct = !j.running && cur && ['review_keyframes', 'keyframes'].includes(j.stage);
    return `<div class="card ${it.status === 'regen' ? 'regen' : ''}">
      <h3>${name(it.role)} <span class="badge ${it.status === 'approved' ? 'done' : it.status === 'generated' ? 'waiting_you' : ''}">${KF_ES[it.status] || it.status}</span></h3>
      ${cur ? `<a href="${hfFile(cur.file, cur.at)}" target="_blank"><img class="hf-kf" src="${hfFile(cur.file, cur.at)}"></a>` : `<div class="muted">${j.running ? 'Generando…' : 'Sin imagen todavía'}</div>`}
      ${it.tries.length > 1 ? `<div class="thumbs">${it.tries.map((t) => `<a href="#" data-kfchoose="${it.role}:${t.n}" title="Intento ${t.n}${t.verdict ? ' · ' + esc(t.verdict) : ''}"><img src="${hfFile(t.file, t.at)}" style="${t.n === (cur && cur.n) ? 'outline:2px solid #a78bfa' : 'opacity:.6'}"></a>`).join('')}</div>` : ''}
      ${cur ? `<div class="muted" style="font-size:12px">Intento ${cur.n} · ${cur.kind === 'edit' ? 'edición' : 'nuevo'}${cur.note ? ' · nota: ' + esc(cur.note) : ''}</div>
        <details><summary class="muted" style="font-size:12px">Prompt e imágenes</summary><div class="hf-en">${cur.images.map((f, i) => `Image ${i + 1}: ${esc(f)}`).join('<br>')}</div><pre class="hf-pre hf-en">${esc(cur.prompt)}</pre></details>` : ''}
      ${qaKf(cur)}
      ${it.status === 'regen' && it.note ? `<div class="muted" style="font-size:12px">A rehacer: ${esc(it.note)}</div>` : ''}
      ${canAct ? `<textarea rows="2" data-kfnote="${it.role}" placeholder="Nota: qué cambiar (p. ej. el pelo suelto por delante de los hombros)"></textarea>
        <div class="hf-btns" style="margin-top:6px">
          ${it.status !== 'approved' ? `<button class="small good" data-kfact="${it.role}:approve">✅ Aprobar</button>` : ''}
          <button class="small" data-kfact="${it.role}:regen" title="Prompt nuevo desde cero (con tu nota si la escribes)">↻ Regenerar</button>
          <button class="small" data-kfact="${it.role}:edit" title="Edita esta imagen (Image 1) cambiando solo lo de tu nota">✏️ Editar con nota</button>
        </div>` : ''}
    </div>`;
  }).join('')}</div>`;
  if (j.stage === 'review_keyframes' && !j.running) {
    const all = kf.items.every((x) => x.status === 'approved');
    h += `<div class="bigbar"><button class="good big" id="hfKfApprove" ${all ? '' : 'disabled title="Aprueba antes cada keyframe"'}>✅ Keyframes aprobados: pasar al vídeo</button>${all ? '' : '<span class="muted">Aprueba cada keyframe para seguir.</span>'}</div>`;
  }
  return h;
}

// Caja del modo aprendizaje: estado del mapa, botones y la imagen de prueba
async function renderLearn() {
  const box = document.getElementById('hfLearn');
  if (!box) return;
  const s = await api('hf/learn');
  const w = s.worker || {};
  const ok = !s.errors.length;
  box.innerHTML = `<b>🎓 Mapa de Higgsfield</b> ${s.running ? '<span class="badge working">aprendiendo…</span>' : ok ? `<span class="badge done">aprendido ${new Date(s.learnedAt).toLocaleString()}</span>` : '<span class="badge waiting_you">sin aprender</span>'}
    <div class="muted" style="font-size:12px;margin:4px 0">${s.running ? esc(w.action || '') : ok ? esc(s.notes || 'Listo para generar.') : 'Primero tengo que aprender la web: abro Higgsfield en el Chrome de Flow Studio (a la vista), apunto dónde está cada botón y hago una imagen de prueba en Unlimited. No toques ese Chrome mientras tanto.'}</div>
    ${!ok && !s.running && s.errors[0] !== 'sin aprender' ? `<div class="muted" style="font-size:12px">Falta: ${esc(s.errors.join(' · '))}</div>` : ''}
    ${s.testImage ? `<a href="/root/${s.testImage}" target="_blank"><img src="/root/${s.testImage}" style="height:90px;border-radius:6px;margin:4px 0"></a>` : ''}
    <div class="hf-btns">${s.running ? '<button class="small" id="hfLearnStop">⏹ Detener</button>' : `<button class="small ${ok ? '' : 'primary'}" id="hfLearnGo">🎓 ${ok ? 'Volver a aprender' : 'Aprender Higgsfield'}</button>${ok ? '<button class="small" id="hfLearnCheck">🔎 Comprobar mapa</button>' : ''}`}
      <button class="small" id="hfLearnLog">📜 Ver lo que hace</button></div>
    <pre class="log" id="hfLearnPre" hidden>${esc((w.log || []).slice(-60).join('\n'))}</pre><div id="hfLearnReport"></div>`;
  const b = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
  b('hfLearnGo', async () => { if (!confirm('Voy a abrir Higgsfield en el Chrome de Flow Studio y recorrer sus pantallas (y una imagen de prueba en Unlimited). No lo toques mientras tanto. ¿Empiezo?')) return; await api('hf/learn', {}); renderLearn(); });
  b('hfLearnStop', async () => { await api('hf/learn/stop', {}); renderLearn(); });
  b('hfLearnLog', () => { const p = document.getElementById('hfLearnPre'); p.hidden = !p.hidden; p.scrollTop = p.scrollHeight; });
  b('hfLearnCheck', async () => {
    const r = document.getElementById('hfLearnReport');
    r.innerHTML = '<span class="muted">Comprobando en el Chrome de Flow Studio (sin generar)…</span>';
    try {
      const x = await api('hf/learn/check', {});
      r.innerHTML = `<ul style="font-size:12px">${[...x.format.map((e) => `<li>✗ ${esc(e)}</li>`), ...x.report.map((y) => `<li>${y.ok ? '✓' : '✗'} ${esc(y.kind)} · ${esc(y.key)}: ${esc(y.msg)}</li>`)].join('')}</ul>`;
    } catch (e) { r.innerHTML = ''; }
  });
}
setInterval(() => { if (document.getElementById('hfLearn') && !document.querySelector('#hfLearn:hover')) renderLearn().catch(() => {}); }, 5000);

function bindHfPanel(j) {
  const b = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
  renderLearn().catch(() => {});
  document.querySelectorAll('[data-kfchoose]').forEach((x) => x.onclick = async (e) => {
    e.preventDefault();
    const [role, n] = x.dataset.kfchoose.split(':');
    await api(`hf/jobs/${j.id}/kf`, { role, action: 'choose', n: +n });
    hfSig = ''; refresh();
  });
  document.querySelectorAll('[data-kfact]').forEach((x) => x.onclick = async () => {
    const [role, action] = x.dataset.kfact.split(':');
    const note = (document.querySelector(`[data-kfnote="${role}"]`) || {}).value || '';
    if (action === 'edit' && !note.trim()) return alert('Escribe en la nota qué hay que cambiar');
    await api(`hf/jobs/${j.id}/kf`, { role, action, note });
    hfSig = ''; refresh();
  });
  b('hfKfApprove', async () => { await api(`hf/jobs/${j.id}/approve`, { stage: 'review_keyframes' }); hfSig = ''; refresh(); });
  const again = () => { hfSig = ''; refresh(); };
  document.querySelectorAll('[data-vchoose]').forEach((x) => x.onclick = () => api(`hf/jobs/${j.id}/video`, { action: 'choose', n: +x.dataset.vchoose }).then(again));
  b('hfVApprove', () => api(`hf/jobs/${j.id}/video`, { action: 'approve' }).then(again));
  b('hfVRegen', () => api(`hf/jobs/${j.id}/video`, { action: 'regen', note: ($('#hfVNote') || {}).value || '' }).then(again));
  b('hfVNext', () => api(`hf/jobs/${j.id}/approve`, { stage: 'review_video' }).then(again));
  b('hfPRegen', () => api(`hf/jobs/${j.id}/post`, { note: ($('#hfPNote') || {}).value || '' }).then(again));
  b('hfDone', () => confirm('¿Pasar este vídeo a Terminados?') && api(`hf/jobs/${j.id}/approve`, { stage: 'review_final' }).then(again));
  b('hfCopy', async () => {
    const t = j.hf.post.description;
    try { await navigator.clipboard.writeText(t); } catch { const r = document.createRange(); r.selectNodeContents($('#hfDesc')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand('copy'); }
    const el = document.getElementById('hfCopy'); if (el) { el.textContent = '✅ Copiada'; setTimeout(() => { el.textContent = '📋 Copiar'; }, 2000); }
  });
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
