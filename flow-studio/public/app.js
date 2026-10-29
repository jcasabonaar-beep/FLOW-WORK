// Panel de oficinas
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const WORKERS = [
  ['capture', '🎞️', 'Capturador', 'Descarga el reel y saca los fotogramas'],
  ['director', '🎬', 'Director', 'Traduce, revisa y escribe los prompts'],
  ['frames', '🖼️', 'Frames', 'Nano Banana Pro en Flow'],
  ['clips', '🎥', 'Clips', 'Omni en Flow'],
  ['editor', '✂️', 'Editor', 'Montaje, subtítulos y CTA'],
];
const STAGES = [
  ['capture', 'Captura'], ['director', 'Plan'], ['frames', 'Frames'], ['review_frames', '✋ Tu OK frames', true],
  ['clips', 'Clips'], ['editor', 'Edición'], ['review_final', '✋ Tu OK final', true], ['done', 'Listo'],
];
const ITEM_ES = { pending: 'pendiente', done: 'listo', doubt: 'dudoso', regen: 'a rehacer', manual: 'te toca a ti' };
const STATE_ES = { idle: 'en espera', working: 'trabajando', done: 'hecho', waiting_you: 'te espera', error: 'error', paused: 'en pausa' };

let current = null;
let job = null;
let panelSig = '';

async function api(path, body, opts = {}) {
  const r = await fetch('/api/' + path, body !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), ...opts } : opts);
  const j = await r.json();
  if (!r.ok) { alert(j.error || 'Error'); throw new Error(j.error); }
  return j;
}
const file = (p, v) => `/files/${job.id}/${p}${v ? '?v=' + v : ''}`;
const rootFile = (p) => '/root/' + p;

async function loadList() {
  const list = await api('jobs');
  $('#jobList').innerHTML = list.map((j) => `
    <div class="job-item ${j.id === current ? 'sel' : ''}" data-id="${j.id}">
      <span class="dot ${j.status}"></span>
      <div><div>${esc(j.title)}</div><small>${esc(stageName(j.stage))} · ${j.clips} clips</small></div>
    </div>`).join('');
  document.querySelectorAll('.job-item').forEach((el) => el.onclick = () => open(el.dataset.id));
  if (!current && list[0]) open(list[0].id);
}
const stageName = (s) => (STAGES.find((x) => x[0] === s) || [, s])[1];

async function open(id) {
  $('#ideas').hidden = true;
  current = id;
  panelSig = '';
  location.hash = id;
  await refresh();
  loadList();
}

async function refresh() {
  if (!current) return;
  if (current === 'ideas') return refreshIdeas();
  job = await api('jobs/' + current);
  $('#empty').hidden = true;
  $('#job').hidden = false;
  $('#jTitle').textContent = job.title;
  const mins = Math.round((Object.values(job.timings || {}).reduce((a, b) => a + b, 0)) / 60000);
  $('#jMeta').textContent = `${job.videoType === 'venta' ? '💰 Venta' : '🚀 Crecimiento'} · ${new Date(job.createdAt).toLocaleString()} · ${job.clips.length || '?'} clips · ${mins} min de trabajo${job.url ? ' · ' : ''}`;
  if (job.url) $('#jMeta').insertAdjacentHTML('beforeend', `<a href="${esc(job.url)}" target="_blank" style="color:#93c5fd">referencia</a>`);
  $('#btnPauseAll').textContent = job.paused ? '▶ Reanudar todo' : '⏸ Pausar todo';
  const canContinue = !job.running && ['error', 'stopped', 'waiting_you'].includes(job.status) && !['review_frames', 'review_final', 'done'].includes(job.stage);
  $('#btnContinue').hidden = !canContinue;

  const si = STAGES.findIndex((s) => s[0] === job.stage);
  $('#stages').innerHTML = STAGES.map((s, i) => `<li class="${i < si ? 'done' : i === si ? 'now' : ''} ${s[2] ? 'stop' : ''}">${i < si ? '✓ ' : ''}${s[1]}</li>`).join('');

  const al = $('#alert');
  if (job.error) { al.hidden = false; al.className = job.status === 'waiting_limit' ? 'alert info' : 'alert'; al.textContent = (job.status === 'waiting_limit' ? '⏳ ' : '⚠️ ') + job.error; }
  else if (job.status === 'waiting_you') { al.hidden = false; al.className = 'alert info'; al.textContent = '✋ ' + waitingText(); }
  else al.hidden = true;

  $('#offices').innerHTML = WORKERS.map(([k, icon, name, desc]) => {
    const w = job.workers[k];
    const st = w.paused && w.state !== 'working' ? 'paused' : w.state;
    return `<div class="office ${st}">
      <div class="office-head"><b>${icon} ${name}</b><span class="badge ${st}">${STATE_ES[st] || st}</span></div>
      <div class="muted" style="font-size:12px">${desc}</div>
      <div class="action">${esc(w.action)}</div>
      <pre class="log">${esc(w.log.slice(-7).join('\n'))}</pre>
      <div class="office-btns">
        <button class="small" data-pause="${k}">${w.paused ? '▶ Reanudar' : '⏸ Pausar'}</button>
        ${w.state === 'working' && ['director', 'frames', 'clips'].includes(k) ? `<button class="small" data-stop="${k}">⏹ Detener ya</button>` : ''}
        <button class="small" data-view="${k}">🔍 Ver oficina</button>
      </div></div>`;
  }).join('');
  renderFloor();
  document.querySelectorAll('[data-pause]').forEach((b) => b.onclick = () => api('jobs/' + job.id + '/' + (job.workers[b.dataset.pause].paused ? 'resume' : 'pause'), { worker: b.dataset.pause }).then(refresh));
  document.querySelectorAll('[data-stop]').forEach((b) => b.onclick = () => confirm('¿Detener a este trabajador ahora? Lo que esté a medias se pierde.') && api('jobs/' + job.id + '/stop-worker', { worker: b.dataset.stop }));
  document.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => viewOffice(b.dataset.view));
  if ($('#dlgOffice').open && $('#dlgOffice').dataset.w) viewOffice($('#dlgOffice').dataset.w, true);

  const sig = JSON.stringify([job.stage, job.status, job.outputV, job.clips.map((c) => [c.frameStatus, c.clipStatus, c.v, c.frame, c.clip])]);
  if (sig !== panelSig && !(document.activeElement && document.activeElement.matches('#stagePanel textarea, #stagePanel input'))) {
    panelSig = sig;
    renderPanel();
  }
}

// ---------- Oficina visual ----------
let viewMode = 'floor';
try { viewMode = localStorage.getItem('viewMode') || 'floor'; } catch {}
const COLORS = { capture: '#f59e0b', director: '#a855f7', frames: '#22c55e', clips: '#3b82f6', editor: '#ec4899', boss: '#94a3b8', research: '#14b8a6' };
const PROPS = { idle: '☕', waiting_you: '✋', error: '💨', paused: '⏸️', done: '✅', limit: '💤' };

function bossState() {
  if (job.status === 'waiting_limit') return ['limit', 'Esperando a que se renueve el límite de Claude'];
  if (job.status === 'error') return ['error', 'Algo ha fallado: mira el aviso de arriba'];
  if (job.stage === 'done') return ['done', '¡Video terminado! 🎉'];
  if (job.status === 'waiting_you') return ['waiting_you', waitingText()];
  if (job.paused) return ['paused', 'Has pausado todo'];
  if (job.running) return ['working', `Coordinando: ${stageName(job.stage)}`];
  return ['idle', 'Esperando a que le digas que siga'];
}

function screenFor(k) {
  // Lo que se ve en el monitor de cada trabajador
  const last = (arr) => arr.filter(Boolean).pop();
  if (k === 'frames') { const c = last(job.clips.filter((x) => x.frame)); if (c) return `<img src="${file(c.frame, c.v)}">`; }
  if (k === 'clips') { const c = last(job.clips.filter((x) => x.clip)); if (c && c.frame) return `<img src="${file(c.frame, c.v)}"><span class="play">▶</span>`; }
  if (k === 'editor' && job.output) { const c = job.clips[0]; if (c && c.frame) return `<img src="${file(c.frame, c.v)}"><span class="play">✂</span>`; }
  if (k === 'capture' && job.sheets && job.sheets.length) return `<img src="${file('ref/' + job.sheets[0])}">`;
  return '<i></i><i></i><i></i><i></i>';
}

function room(k, icon, name, st, action) {
  const prop = st === 'working' ? '' : `<div class="prop">${PROPS[st] || ''}</div>`;
  const bubble = action ? `<div class="bubble">${esc(action.length > 90 ? action.slice(0, 88) + '…' : action)}</div>` : '';
  return `<div class="room ${st}" data-room="${k}" style="--c:${COLORS[k]}">
    <div class="plate">${icon} ${name}<span>${k === 'boss' ? '' : STATE_ES[st] || st}</span></div>
    ${bubble}
    <div class="scene">
      <div class="plant"></div>
      <div class="monitor"><div class="screen">${k === 'boss' ? '<i></i><i></i><i></i>' : screenFor(k)}</div></div>
      <div class="person"><div class="head"></div><div class="body"></div><div class="arm l"></div><div class="arm r"></div></div>
      <div class="desk"></div><div class="chair"></div>
      ${prop}
      ${st === 'error' ? '<div class="smoke"><b></b><b></b><b></b></div>' : ''}
      ${st === 'limit' ? '<div class="zzz"><b>z</b><b>z</b><b>z</b></div>' : ''}
    </div>
  </div>`;
}

function renderFloor() {
  const floor = $('#floor');
  floor.hidden = viewMode !== 'floor';
  $('#offices').hidden = viewMode === 'floor';
  document.querySelectorAll('.viewtabs button').forEach((b) => b.classList.toggle('on', b.dataset.mode === viewMode));
  if (viewMode !== 'floor') return;
  const [bs, ba] = bossState();
  floor.innerHTML = room('boss', '🧑‍💼', 'Jefe', bs, ba) + WORKERS.map(([k, icon, name]) => {
    const w = job.workers[k];
    let st = w.paused && w.state !== 'working' ? 'paused' : w.state;
    if (job.status === 'waiting_limit' && (w.state === 'paused' || w.state === 'working')) st = 'limit';
    const txt = st === 'working' ? (w.action || 'Trabajando…').replace(/^🔧\s*/, '') : st === 'waiting_you' ? w.action : st === 'error' ? w.action : '';
    return room(k, icon, name, st, txt);
  }).join('');
  floor.querySelectorAll('[data-room]').forEach((r) => r.onclick = () => r.dataset.room !== 'boss' && viewOffice(r.dataset.room));
}

document.querySelectorAll('.viewtabs button').forEach((b) => b.onclick = () => {
  viewMode = b.dataset.mode;
  try { localStorage.setItem('viewMode', viewMode); } catch {}
  renderFloor();
});

function waitingText() {
  if (job.stage === 'review_frames') return 'Revisa los frames: marca los que quieras cambiar o apruébalos.';
  if (job.stage === 'review_final') return 'Mira el video final y apruébalo o pide cambios.';
  const w = WORKERS.find(([k]) => job.workers[k].state === 'waiting_you');
  return w ? `${w[2]}: ${job.workers[w[0]].action}` : 'Te necesito para seguir.';
}

function viewOffice(k, silent) {
  const d = $('#dlgOffice');
  d.dataset.w = k;
  $('#oTitle').textContent = WORKERS.find((w) => w[0] === k).slice(1, 3).join(' ') + ' — todo lo que ha hecho';
  const pre = $('#oLog');
  const atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 20;
  pre.textContent = job.workers[k].log.join('\n') || 'Todavía nada.';
  if (!silent || atBottom) pre.scrollTop = pre.scrollHeight;
  if (!d.open) d.showModal();
}

// ---------- Panel según la etapa ----------
function renderPanel() {
  const p = $('#stagePanel');
  if (job.stage === 'capture' && job.workers.capture.state === 'waiting_you') {
    p.innerHTML = `<h2 class="sec">Sube el video de referencia</h2>
      <p class="muted">Descárgalo de Instagram (por ejemplo con <b>snapinsta.app</b> o desde la app: Compartir → Descargar) y arrástralo aquí.</p>
      <div class="dropzone" id="dzRef">Arrastra aquí el video o <label style="display:inline;color:#93c5fd;cursor:pointer">elige el archivo<input type="file" accept="video/*" hidden id="inRef"></label></div>`;
    bindDrop($('#dzRef'), $('#inRef'), async (f) => { await upload('ref', 0, f); await api('jobs/' + job.id + '/continue', {}); });
    return;
  }
  if (!job.clips.length) { p.innerHTML = ''; return; }

  const notes = job.notes && job.notes.length ? `<div class="notes"><b>📝 Cambios del director (revisa sobre todo los de salud):</b><ul>${job.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>` : '';
  const hook = job.plan && job.plan.hook ? `<div class="muted">Hook: <b style="color:#fff">${esc(job.plan.hook).replace(/\*([^*]+)\*/g, '<i style="font-family:Georgia,serif">$1</i>')}</b> · CTA: <b style="color:#fff">${esc(job.plan.ctaWord)}</b></div>` : '';

  if (job.stage === 'review_final' || job.stage === 'done') {
    p.innerHTML = `<h2 class="sec">${job.stage === 'done' ? '✅ Video terminado' : '✋ Parada 2: video final'}</h2>
      <div class="final">
        <video controls src="${file(job.output, job.outputV)}"></video>
        <div style="flex:1;min-width:260px">
          ${job.stage === 'done' ? `<p>Guardado en la carpeta <b>${esc(job.finalFile)}</b>.</p><a href="${rootFile(job.finalFile)}" download><button class="primary">⬇ Descargar</button></a>` : `
          <label>Texto del hook (pon *asteriscos* en las palabras en cursiva)<input id="inHook" value="${esc(job.plan.hook)}"></label>
          <div class="btns"><button class="good" id="bApprove">✓ Aprobar y guardar</button><button id="bReEdit">↻ Rehacer edición</button></div>
          <p class="muted" style="margin-top:18px">¿Algún clip mal? Márcalo y pulsa "Rehacer clips marcados":</p>
          <div class="btns">${job.clips.map((c) => `<button class="small ${c.clipStatus === 'regen' ? 'primary' : ''}" data-rc="${c.n}">Clip ${c.n}</button>`).join('')}</div>
          <div class="btns"><button id="bRegenClips">↻ Rehacer clips marcados</button></div>`}
        </div>
      </div>${cardsHtml('clips')}`;
    if (job.stage === 'review_final') {
      $('#bApprove').onclick = () => api('jobs/' + job.id + '/final', { action: 'approve' }).then(refresh);
      $('#bReEdit').onclick = () => api('jobs/' + job.id + '/final', { action: 'redo-edit', hook: $('#inHook').value }).then(refresh);
      $('#bRegenClips').onclick = () => job.clips.some((c) => c.clipStatus === 'regen') ? api('jobs/' + job.id + '/final', { action: 'regen-clips' }).then(refresh) : alert('Marca primero qué clips rehacer');
      document.querySelectorAll('[data-rc]').forEach((b) => b.onclick = () => {
        const c = job.clips.find((x) => x.n == b.dataset.rc);
        api(`jobs/${job.id}/clip/${c.n}`, { regenClip: c.clipStatus !== 'regen' }).then(() => { panelSig = ''; refresh(); });
      });
    }
    bindCards();
    return;
  }

  const mode = ['clips', 'editor'].includes(job.stage) ? 'clips' : 'frames';
  const review = job.stage === 'review_frames';
  p.innerHTML = `<h2 class="sec">${review ? '✋ Parada 1: revisa los frames' : mode === 'frames' ? 'Frames' : 'Clips'}</h2>${hook}${notes}
    ${review ? '<p class="muted">Para cada frame: <b>Vale</b>, <b>Cambiar</b> (escribe qué cambiar, en español) o <b>Subir el mío</b>. Los marcados en naranja son los que el trabajador ve dudosos.</p>' : ''}
    ${cardsHtml(mode)}
    ${review ? `<div class="bigbar"><button class="good" id="bApproveFrames">${job.clips.some((c) => c.frameStatus === 'regen') ? '↻ Rehacer los marcados' : '✓ Aprobar frames y animar'}</button></div>` : ''}`;
  if (review) {
    $('#stagePanel .muted').outerHTML = `<div class="row"><label>Hook (palabras en cursiva entre *asteriscos*)<input id="inHook1" value="${esc(job.plan.hook)}"></label><label>Palabra del CTA<input id="inCta1" value="${esc(job.plan.ctaWord)}"></label></div>`;
    $('#inHook1').onchange = () => api('jobs/' + job.id + '/plan', { hook: $('#inHook1').value });
    $('#inCta1').onchange = () => api('jobs/' + job.id + '/plan', { ctaWord: $('#inCta1').value });
  }
  if (review) $('#bApproveFrames').onclick = () => api('jobs/' + job.id + '/approve-frames', {}).then(refresh);
  bindCards();
}

function cardsHtml(mode) {
  const review = job.stage === 'review_frames';
  return `<div class="cards">${job.clips.map((c) => {
    const pr = (job.prompts || []).find((x) => x.n === c.n) || {};
    const st = mode === 'frames' ? c.frameStatus : c.clipStatus;
    const media = mode === 'frames' || !c.clip
      ? (c.frame ? `<img src="${file(c.frame, c.v)}">` : `<div class="ph drop" data-drop="frame" data-n="${c.n}">${st === 'manual' ? 'Arrastra aquí el frame' : 'Generando…'}</div>`)
      : `<video src="${file(c.clip, c.v)}" controls preload="metadata"></video>`;
    const clipDrop = mode === 'clips' && !c.clip ? `<div class="ph drop" data-drop="clip" data-n="${c.n}" style="aspect-ratio:auto;margin-top:6px">${st === 'manual' ? 'Arrastra aquí el clip' : 'Animando…'}</div>` : '';
    const note = mode === 'frames' ? c.frameNote : c.clipNote;
    return `<div class="card ${st}">
      <h3><span>Clip ${c.n}</span><span class="badge">${ITEM_ES[st] || esc(st)}</span></h3>
      <div class="pair">
        <figure>${c.ref ? `<img src="${file(c.ref)}">` : '<div class="ph">ref</div>'}<figcaption>Referencia ${c.refTime}s</figcaption></figure>
        <figure>${media}${clipDrop}</figure>
      </div>
      ${note ? `<div class="note">⚠ ${esc(note)}</div>` : ''}
      ${review ? `<label class="line">Frase (${job.language === "en" ? "inglés" : "español"})<textarea rows="2" data-line="${c.n}">${esc(c.line)}</textarea></label>` : `<div class="line">“${esc(c.line)}”</div>`}
      ${review ? `
        <div class="btns">
          <button class="small ${c.frameStatus !== 'regen' ? 'good' : ''}" data-ok="${c.n}">✓ Vale</button>
          <button class="small ${c.frameStatus === 'regen' ? 'primary' : ''}" data-chg="${c.n}">✎ Cambiar</button>
          <button class="small" data-fresh="${c.n}">↻ Desde cero</button>
          <select class="small" data-same="${c.n}" style="width:auto"><option value="">⧉ Igual que…</option>${job.clips.filter((x) => x.n !== c.n && x.frame).map((x) => `<option value="${x.n}">clip ${x.n}</option>`).join('')}</select>
          <label class="small" style="margin:0"><button class="small" onclick="this.nextElementSibling.click()">⬆ Subir el mío</button><input type="file" accept="image/*" hidden data-up="frame" data-n="${c.n}"></label>
        </div>
        <textarea rows="2" data-fb="${c.n}" placeholder="Qué cambiar: ej. la cara más cerca, quita el texto del bote…" ${c.frameStatus === 'regen' ? '' : 'hidden'}>${esc(c.feedback)}</textarea>` : ''}
      ${st === 'manual' && mode === 'clips' ? `<label class="small" style="margin:6px 0"><input type="file" accept="video/*" data-up="clip" data-n="${c.n}"></label>` : ''}
      ${st === 'manual' && mode === 'frames' ? `<label class="small" style="margin:6px 0"><input type="file" accept="image/*" data-up="frame" data-n="${c.n}"></label>
        <label>Prompt del frame (puedes corregirlo)<textarea rows="6" data-fp="${c.n}">${esc(c.framePrompt)}</textarea></label>
        <button class="small primary" data-retry="${c.n}">↻ Reintentar con este prompt</button>` : ''}
      <details><summary class="muted">Ver prompts e imágenes de Flow</summary>
        <div class="muted" style="margin-top:6px">Imágenes a subir en Flow (en este orden):</div>
        <div class="thumbs">${(pr.frameInputs || []).map((p, i) => `<a href="${p.startsWith('avatar/') ? rootFile(p) : file(p.replace(/^jobs\/[^/]+\//, ''))}" target="_blank" title="Imagen ${'ABC'[i]}"><img src="${p.startsWith('avatar/') ? rootFile(p) : file(p.replace(/^jobs\/[^/]+\//, ''))}"></a>`).join('')}</div>
        <div class="btns"><button class="small" data-copy="frame" data-n="${c.n}">📋 Copiar prompt del frame</button><button class="small" data-copy="clip" data-n="${c.n}">📋 Copiar prompt del clip</button></div>
        <pre>${esc(c.framePrompt)}</pre>
      </details>
    </div>`;
  }).join('')}</div>`;
}

function bindCards() {
  const n = (el, k) => parseInt(el.dataset[k], 10);
  document.querySelectorAll('[data-ok]').forEach((b) => b.onclick = () => api(`jobs/${job.id}/clip/${n(b, 'ok')}`, { keepFrame: true }).then(refresh));
  document.querySelectorAll('[data-retry]').forEach((b) => b.onclick = async () => {
    const k = n(b, 'retry');
    await api(`jobs/${job.id}/clip/${k}`, { framePrompt: document.querySelector(`[data-fp="${k}"]`).value, regenFrame: true });
    if (!job.running) await api('jobs/' + job.id + '/continue', {});
    panelSig = '';
    refresh();
  });
  document.querySelectorAll('[data-same]').forEach((sel) => sel.onchange = () => sel.value && api(`jobs/${job.id}/clip/${n(sel, 'same')}`, { copyFrameFrom: sel.value }).then(() => { panelSig = ''; refresh(); }));
  document.querySelectorAll('[data-fresh]').forEach((b) => b.onclick = () => api(`jobs/${job.id}/clip/${n(b, 'fresh')}`, { freshFrame: true }).then(() => { panelSig = ''; refresh(); }));
  document.querySelectorAll('[data-chg]').forEach((b) => b.onclick = () => {
    const ta = document.querySelector(`[data-fb="${n(b, 'chg')}"]`);
    ta.hidden = false;
    ta.focus();
  });
  document.querySelectorAll('[data-fb]').forEach((ta) => ta.onchange = () => {
    const v = ta.value.trim();
    api(`jobs/${job.id}/clip/${n(ta, 'fb')}`, v ? { feedback: v, regenFrame: true } : { keepFrame: true }).then(() => { panelSig = ''; refresh(); });
  });
  document.querySelectorAll('[data-line]').forEach((ta) => ta.onchange = () => api(`jobs/${job.id}/clip/${n(ta, 'line')}`, { line: ta.value.trim() }));
  document.querySelectorAll('[data-up]').forEach((inp) => inp.onchange = async () => {
    if (!inp.files[0]) return;
    await upload(inp.dataset.up, n(inp, 'n'), inp.files[0]);
    afterManualUpload();
  });
  document.querySelectorAll('[data-drop]').forEach((el) => bindDrop(el, null, async (f) => { await upload(el.dataset.drop, n(el, 'n'), f); afterManualUpload(); }));
  document.querySelectorAll('[data-copy]').forEach((b) => b.onclick = () => {
    const c = job.clips.find((x) => x.n === n(b, 'n'));
    const pr = (job.prompts || []).find((x) => x.n === c.n) || {};
    navigator.clipboard.writeText(b.dataset.copy === 'frame' ? c.framePrompt : pr.clipPrompt);
    b.textContent = '✓ Copiado';
  });
}

async function afterManualUpload() {
  await refresh();
  const key = job.stage === 'clips' ? 'clipStatus' : 'frameStatus';
  if (['frames', 'clips'].includes(job.stage) && !job.running && !job.clips.some((c) => c[key] === 'manual')) await api('jobs/' + job.id + '/continue', {});
  panelSig = '';
  refresh();
}

function bindDrop(el, input, onFile) {
  if (input) input.onchange = () => input.files[0] && onFile(input.files[0]);
  el.ondragover = (e) => { e.preventDefault(); el.classList.add('over'); };
  el.ondragleave = () => el.classList.remove('over');
  el.ondrop = (e) => { e.preventDefault(); el.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) onFile(f); };
}

async function upload(kind, n, f) {
  const r = await fetch(`/api/jobs/${job.id}/upload?kind=${kind}&n=${n}`, { method: 'POST', headers: { 'x-filename': encodeURIComponent(f.name) }, body: f });
  if (!r.ok) alert((await r.json()).error || 'Error al subir');
}

// ---------- Botones generales ----------
$('#btnNew').onclick = async () => {
  const cfg = await api('config');
  $('#selSetting').innerHTML = cfg.settings.map((s) => `<option value="${s}">${({ kitchen: 'Cocina americana', walmart: 'Frente a Walmart', target: 'Frente a Target', supermarket: 'Dentro del súper' })[s] || s}</option>`).join('');
  $('#dlgNew').showModal();
};
$('#formNew').onsubmit = async (e) => {
  if (e.submitter && e.submitter.value === 'cancel') return;
  const data = Object.fromEntries(new FormData(e.target));
  const j = await api('jobs', data);
  e.target.reset();
  open(j.id);
};
$('#btnPauseAll').onclick = () => api('jobs/' + job.id + '/' + (job.paused ? 'resume' : 'pause'), {}).then(refresh);
$('#btnContinue').onclick = () => api('jobs/' + job.id + '/continue', {}).then(refresh);
$('#dlgOffice').onclose = () => { delete $('#dlgOffice').dataset.w; };

let pending = null;
const es = new EventSource('/api/events');
es.onmessage = (e) => {
  if (e.data === '_investigador') { if (current === 'ideas') refreshIdeas(); return; }
  if (e.data !== current) { loadList(); return; }
  clearTimeout(pending);
  pending = setTimeout(() => { refresh(); loadList(); }, 250);
};

current = location.hash.slice(1) || null;
loadList().then(() => current && refresh());

// ---------- Ideas virales ----------
const fmt = (n) => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + ' M' : n >= 1e3 ? Math.round(n / 1e3) + ' mil' : String(n);
let ideasSig = '';
async function refreshIdeas() {
  const r = await api('research');
  $('#empty').hidden = true; $('#job').hidden = true; $('#ideas').hidden = false;
  if (document.activeElement !== $('#inAccounts')) $('#inAccounts').value = (r.accounts || []).join('\n');
  const w = r.workers.research;
  const st = r.running ? 'working' : w.state;
  $('#btnRunIdeas').disabled = r.running;
  $('#btnStopIdeas').hidden = !r.running;
  $('#iMeta').textContent = r.lastRun ? `Última búsqueda: ${new Date(r.lastRun).toLocaleString()} · cuenta @${'laabuelaemma'}` : 'Todavía no has buscado. Añade cuentas y pulsa Sugerir.';
  $('#iRoom').innerHTML = room('research', '🔎', 'Investigador', st, st === 'working' || st === 'error' ? w.action : (w.action || 'Listo para buscar')) + `<pre class="log">${esc(w.log.slice(-8).join('\n'))}</pre>`;
  const sig = JSON.stringify([r.lastRun, (r.suggestions || []).length]);
  if (sig === ideasSig) return;
  ideasSig = sig;
  $('#ideaCards').innerHTML = (r.suggestions || []).map((s, i) => `<div class="card">
    <h3><span>@${esc(s.account)}</span><span class="badge ${s.older ? '' : 'done'}">${s.older ? 'esta semana' : s.ageHours != null ? 'hace ' + s.ageHours + ' h' : ''}</span></h3>
    <div class="pair"><figure>${s.thumb ? `<img src="/files/_investigador/${s.thumb}">` : '<div class="ph">sin miniatura</div>'}</figure>
      <div><div style="font-size:22px;font-weight:800">${fmt(s.views)}</div><div class="muted">vistas · <b style="color:#86efac">${s.ratio}×</b> su media (${fmt(s.median)})</div>
      <p style="margin:10px 0 4px"><b>${esc(s.tema || '')}</b></p><div class="muted">Hook: “${esc(s.hook || '')}”</div>
      <p style="font-size:12px">${esc(s.porque || '')}</p><a href="${esc(s.url)}" target="_blank" style="color:#93c5fd">Ver en Instagram</a></div></div>
    <details><summary class="muted">Guion en español</summary><pre>${esc(s.guion || '')}</pre></details>
    <div class="btns"><button class="good" data-idea="${i}">🎬 Crear video con esta</button></div>
  </div>`).join('') || (r.lastRun ? '<p class="muted">No hay reels con un salto claro de visitas en esas cuentas. Prueba con más cuentas.</p>' : '');
  document.querySelectorAll('[data-idea]').forEach((b) => b.onclick = () => newFromIdea(r.suggestions[b.dataset.idea]));
}

async function newFromIdea(s) {
  await $('#btnNew').onclick();
  const f = $('#formNew');
  f.title.value = s.tema || '';
  f.url.value = s.url;
  f.script.value = s.guion || '';
}

$('#btnIdeas').onclick = () => { current = 'ideas'; location.hash = 'ideas'; ideasSig = ''; refreshIdeas(); loadList(); };
$('#btnRunIdeas').onclick = async () => {
  await api('research/accounts', { accounts: $('#inAccounts').value.split(/[\n,]+/) });
  await api('research/run', {});
  refreshIdeas();
};
$('#btnStopIdeas').onclick = () => api('research/stop', {}).then(refreshIdeas);
$('#inAccounts').onchange = () => api('research/accounts', { accounts: $('#inAccounts').value.split(/[\n,]+/) });
