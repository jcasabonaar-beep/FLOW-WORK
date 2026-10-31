// Panel de oficinas
const $ = (s) => document.querySelector(s);
function showError(msg) {
  let bar = document.getElementById('errBar');
  if (!bar) { bar = document.createElement('div'); bar.id = 'errBar'; bar.onclick = () => bar.remove(); document.body.appendChild(bar); }
  bar.textContent = '⚠️ Algo falló en la página (mándame una captura de esto): ' + msg + '  ✕';
}
window.addEventListener('error', (e) => showError(e.message + (e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : '')));
window.addEventListener('unhandledrejection', (e) => showError(String((e.reason && e.reason.message) || e.reason)));
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
// Una sola pantalla visible a la vez
const VIEWS = ['empty', 'home', 'ideas', 'library', 'results', 'settings', 'job'];
function show(view) {
  for (const v of VIEWS) $('#' + v).hidden = v !== view;
  document.querySelectorAll('.nav [data-view]').forEach((b) => b.classList.toggle('sel', b.dataset.view === view));
}
// El menú de la izquierda se enlaza lo primero: así funciona aunque algo de más abajo falle
document.querySelectorAll('.nav [data-view]').forEach((b) => b.onclick = () => go(b.dataset.view));
const file = (p, v) => `/files/${job.id}/${p}${v ? '?v=' + v : ''}`;
const rootFile = (p) => '/root/' + p;

// Menú ⋯ de cada video: archivar o borrar
const dotsMenu = (id) => `<details class="dots"><summary title="Más opciones">⋯</summary><div class="menu">
  <button data-dots-open="${id}">📂 Abrir</button><button data-dots-archive="${id}">🗑 Archivar (se oculta)</button><button class="danger" data-dots-delete="${id}">✖ Borrar del todo</button></div></details>`;
function bindDots(root) {
  root.querySelectorAll('.dots').forEach((d) => d.onclick = (e) => e.stopPropagation());
  root.querySelectorAll('[data-dots-open]').forEach((b) => b.onclick = () => open(b.dataset.dotsOpen));
  root.querySelectorAll('[data-dots-archive]').forEach((b) => b.onclick = async () => {
    if (!confirm('¿Archivar este video? Desaparece de la lista, pero sus archivos se quedan en el PC.')) return;
    await api('jobs/' + b.dataset.dotsArchive + '/archive', {}); afterRemove(b.dataset.dotsArchive);
  });
  root.querySelectorAll('[data-dots-delete]').forEach((b) => b.onclick = async () => {
    if (!confirm('¿Borrar este video del todo? Se borran su proyecto y el video terminado del PC. No se puede deshacer (lo que ya esté en tu Google Drive se queda).')) return;
    await api('jobs/' + b.dataset.dotsDelete + '/delete', {}); afterRemove(b.dataset.dotsDelete);
  });
}
function afterRemove(id) { if (current === id) go('home'); else { refresh(); loadList(); } }
const needsYou = (j) => ['waiting_you', 'error', 'paused', 'stopped'].includes(j.status);
async function loadList() {
  const list = await api('jobs');
  const item = (j) => `
    <div class="job-item ${j.id === current ? 'sel' : ''}" data-id="${j.id}">
      <span class="dot ${j.status}"></span>
      ${dotsMenu(j.id)}
      <div><div>${esc(j.title)}</div><small>${j.status === 'error' ? 'Se atascó' : ['paused', 'stopped'].includes(j.status) ? '⏸ Parado' : j.status === 'waiting_limit' ? '💤 Esperando límite de Claude' : esc(stageName(j.stage))} · ${j.clips} clips</small></div>
    </div>`;
  const wait = list.filter(needsYou);
  const done = list.filter((j) => j.status === 'done');
  const run = list.filter((j) => !wait.includes(j) && !done.includes(j));
  const group = (title, arr, cls) => arr.length ? `<div class="side-title ${cls || ''}">${title} <span>${arr.length}</span></div>${arr.map(item).join('')}` : '';
  $('#jobList').innerHTML = group('✋ Te esperan', wait, 'warn') + group('⏳ En marcha', run) +
    (done.length ? `<details class="done-group"><summary class="side-title">✅ Terminados <span>${done.length}</span></summary>${done.map(item).join('')}</details>` : '');
  document.querySelectorAll('.job-item').forEach((el) => el.onclick = (e) => { if (!e.target.closest('.dots')) open(el.dataset.id); });
  bindDots($('#jobList'));
  $('#navWait').hidden = !wait.length;
  $('#navWait').textContent = wait.length;
  return list;
}
const stageName = (s) => (STAGES.find((x) => x[0] === s) || [, s])[1];

async function open(id) {
  $('#analysis').innerHTML = '';
  current = id;
  panelSig = '';
  location.hash = id;
  await refresh();
  loadList();
}

async function refresh() {
  if (!current) return;
  if (current === 'home') return refreshHome();
  if (current === 'ideas') return refreshIdeas();
  if (current === 'library') return refreshLibrary();
  if (current === 'results') return refreshResults();
  if (current === 'settings' || current === 'pilot') return refreshSettings();
  job = await api('jobs/' + current);
  show('job');
  $('.more').open = false;
  $('#jTitle').textContent = job.title;
  const mins = Math.round((Object.values(job.timings || {}).reduce((a, b) => a + b, 0)) / 60000);
  $('#jMeta').textContent = `${job.videoType === 'venta' ? '💰 Venta' : '🚀 Crecimiento'} · ${new Date(job.createdAt).toLocaleString()} · ${job.clips.length || '?'} clips · ${mins} min de trabajo${job.url ? ' · ' : ''}`;
  if (job.url) $('#jMeta').insertAdjacentHTML('beforeend', `<a href="${esc(job.url)}" target="_blank" style="color:#93c5fd">referencia</a>`);
  $('#btnPauseAll').textContent = job.paused || job.status === 'paused' ? '▶ Reanudar' : '⏹ Parar ahora';
  $('#btnResetFrames').hidden = job.running || !job.clips.length;
  $('#btnAnalyze').hidden = !job.script;
  $('#btnAnalyze').textContent = job.analysis ? '🧠 Ver ideas' : '🧠 Ideas como esta';
  $('#btnResetPlan').hidden = job.running || !job.clips.length;
  $('#btnPauseAll').hidden = !job.paused && job.status !== 'paused' && !job.running;
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
        <button class="small" data-office="${k}">🔍 Ver oficina</button>
      </div></div>`;
  }).join('');
  renderFloor();
  document.querySelectorAll('[data-pause]').forEach((b) => b.onclick = () => api('jobs/' + job.id + '/' + (job.workers[b.dataset.pause].paused ? 'resume' : 'pause'), { worker: b.dataset.pause }).then(refresh));
  document.querySelectorAll('[data-stop]').forEach((b) => b.onclick = () => confirm('¿Detener a este trabajador ahora? Lo que esté a medias se pierde.') && api('jobs/' + job.id + '/stop-worker', { worker: b.dataset.stop }));
  document.querySelectorAll("[data-office]").forEach((b) => b.onclick = () => viewOffice(b.dataset.office));
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
const COLORS = { capture: '#f59e0b', director: '#a855f7', frames: '#22c55e', clips: '#3b82f6', editor: '#ec4899', boss: '#94a3b8', research: '#14b8a6', results: '#eab308', autopilot: '#6366f1' };
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
        <div><div class="muted" style="font-size:12px;margin-bottom:4px">🅰️ Hook A</div><video controls src="${file(job.output, job.outputV)}"></video></div>
        ${job.outputB ? `<div><div class="muted" style="font-size:12px;margin-bottom:4px">🅱️ Hook B: “${esc((job.hookB && job.hookB.line) || '')}”</div><video controls src="${file(job.outputB, job.outputV)}"></video></div>` : ''}
        <div style="flex:1;min-width:260px">
          ${job.outputB ? '<p class="muted" style="font-size:13px">🅰️🅱️ Sube las dos (una como <b>reel de prueba</b>) y en 📈 Resultados marca cuál es cuál: el analista aprende qué tipo de hook gana.</p>' : ''}
          ${job.stage === 'done' ? `<p>Guardado en <b>flow-studio\\${esc(job.finalFile)}</b>.</p><a href="${rootFile(job.finalFile)}" download><button class="primary">⬇ Descargar A</button></a>${job.outputB ? ` <a href="${file(job.outputB, job.outputV)}" download="video-B.mp4"><button>⬇ Descargar B</button></a>` : ''}` : `
          <label>Texto del hook (pon *asteriscos* en las palabras en cursiva)<input id="inHook" value="${esc(job.plan.hook)}"></label>
          <div class="btns"><button class="good" id="bApprove">✓ Aprobar y guardar</button><button id="bReEdit">↻ Rehacer edición</button></div>
          <p class="muted" style="margin-top:18px">¿Algún clip mal? Márcalo y pulsa "Rehacer clips marcados":</p>
          <div class="btns">${job.clips.map((c) => `<button class="small ${c.clipStatus === 'regen' ? 'primary' : ''}" data-rc="${c.n}">Clip ${c.n}</button>`).join('')}</div>
          <div class="btns"><button id="bRegenClips">↻ Rehacer clips marcados</button></div>`}
        </div>
      </div>${kitHtml()}${reportHtml()}${chatHtml()}${cardsHtml('clips')}`;
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
    bindChat();
    document.querySelectorAll('[data-copykit]').forEach((b) => b.onclick = () => { navigator.clipboard.writeText(kitText(job.kit)); b.textContent = '✓ Copiado'; });
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
  $('#selSetting').innerHTML = cfg.settings.map((s) => `<option value="${s}">${({ kitchen: 'Cocina americana', walmart: 'Frente a Walmart', target: 'Frente a Target', supermarket: 'Dentro del súper', bathroom: 'Baño', reference: 'Como la referencia (cambia de sitio si ella cambia)' })[s] || s}</option>`).join('');
  $('#dlgNew').showModal();
};
$('#formNew').onsubmit = async (e) => {
  if (e.submitter && e.submitter.value === 'cancel') return;
  const data = Object.fromEntries(new FormData(e.target));
  const j = await api('jobs', data);
  e.target.reset();
  open(j.id);
};
$('#btnPauseAll').onclick = () => {
  if (job.paused || job.status === 'paused') return api('jobs/' + job.id + '/resume', {}).then(refresh);
  if (confirm('¿Parar ahora? El trabajador se detiene al momento. Lo ya hecho se guarda y luego puedes Reanudar.')) api('jobs/' + job.id + '/stop-all', {}).then(refresh);
};
$('#btnContinue').onclick = () => api('jobs/' + job.id + '/continue', {}).then(refresh);
$('#dlgOffice').onclose = () => { delete $('#dlgOffice').dataset.w; };

let pending = null;
const es = new EventSource('/api/events');
es.onmessage = (e) => {
  if (e.data === '_investigador') { if (current === 'ideas') refreshIdeas(); return; }
  if (e.data === '_resultados') { if (current === 'results') refreshResults(); return; }
  if (e.data === '_piloto') { if (current === 'settings') refreshSettings(); if (current === 'home') homeSoon(); return; }
  if (current === 'home') { homeSoon(); return; }
  if (e.data !== current) { loadList(); return; }
  clearTimeout(pending);
  pending = setTimeout(() => { refresh(); loadList(); }, 250);
};

let homeTimer = null;
const homeSoon = () => { clearTimeout(homeTimer); homeTimer = setTimeout(refreshHome, 800); };
current = location.hash.slice(1) || 'home';
if (current === 'pilot') current = 'settings';
loadList().then(() => refresh());

// ---------- Ideas virales ----------
const fmt = (n) => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + ' M' : n >= 1e3 ? Math.round(n / 1e3) + ' mil' : String(n);
let ideasSig = '';
async function refreshIdeas() {
  const r = await api('research');
  show('ideas');
  if (document.activeElement !== $('#inAccounts')) $('#inAccounts').value = (r.accounts || []).join('\n');
  const w = r.workers.research;
  const st = r.running ? 'working' : w.state;
  $('#btnRunIdeas').disabled = r.running;
  $('#btnStopIdeas').hidden = !r.running;
  $('#iMeta').textContent = r.lastRun ? `Última búsqueda: ${new Date(r.lastRun).toLocaleString()} · cuenta @laabuelaemma_` : 'Todavía no has buscado. Añade cuentas y pulsa Sugerir.';
  $('#iRoom').innerHTML = room('research', '🔎', 'Investigador', st, st === 'working' || st === 'error' ? w.action : (w.action || 'Listo para buscar')) + `<pre class="log">${esc(w.log.slice(-8).join('\n'))}</pre>`;
  const sig = JSON.stringify([r.lastRun, (r.suggestions || []).length]);
  if (sig === ideasSig) return;
  ideasSig = sig;
  $('#ideaCards').innerHTML = (r.suggestions || []).map((s, i) => `<div class="card">
    <h3><span>@${esc(s.account)}</span><span class="badge ${s.older ? '' : 'done'}">${s.older ? 'esta semana' : s.ageHours != null ? 'hace ' + s.ageHours + ' h' : ''}</span></h3>
    <div class="pair"><figure>${s.thumb ? `<img src="/files/_investigador/${s.thumb}">` : '<div class="ph">sin miniatura</div>'}</figure>
      <div><div style="font-size:22px;font-weight:800">${fmt(s.views)}</div><div class="muted">vistas · <b style="color:#86efac">${s.ratio}×</b> su media (${fmt(s.median)})</div>${s.encaje ? `<div class="muted" style="font-size:12px">👵 Encaje con tu público: <b style="color:${s.encaje >= 7 ? '#86efac' : s.encaje >= 5 ? '#fcd34d' : '#fca5a5'}">${s.encaje}/10</b></div>` : ''}
      <p style="margin:10px 0 4px"><b>${esc(s.tema || '')}</b></p><div class="muted">Hook: “${esc(s.hook || '')}”</div>
      <p style="font-size:12px">${esc(s.porque || '')}</p><a href="${esc(s.url)}" target="_blank" style="color:#93c5fd">Ver en Instagram</a></div></div>
    <details><summary class="muted">Guion en español</summary><pre>${esc(s.guion || '')}</pre></details>
    <div class="btns"><button class="good" data-idea="${i}">🎬 Crear video con esta</button><button class="small" data-ana="${i}">🧠 Variaciones</button></div>
    <div id="ana${i}">${s.analysis ? analysisHtml(s.analysis, 'idea') : ''}</div>
  </div>`).join('') || (r.lastRun ? '<p class="muted">No hay reels con un salto claro de visitas en esas cuentas. Prueba con más cuentas.</p>' : '');
  document.querySelectorAll('[data-idea]').forEach((b) => b.onclick = () => newFromIdea(r.suggestions[b.dataset.idea]));
  (r.suggestions || []).forEach((sg) => sg.analysis && bindVariations(sg.analysis, sg.url));
  document.querySelectorAll('[data-ana]').forEach((b) => b.onclick = async () => {
    const sg = r.suggestions[b.dataset.ana];
    $('#ana' + b.dataset.ana).innerHTML = '<p class="muted">🧠 Analizando (menos de 1 minuto)…</p>';
    try { sg.analysis = await api('research/analyze', { url: sg.url }); } catch { return; }
    $('#ana' + b.dataset.ana).innerHTML = analysisHtml(sg.analysis, 'idea');
    bindVariations(sg.analysis, sg.url);
  });
}

async function newFromIdea(s) {
  await $('#btnNew').onclick();
  const f = $('#formNew');
  f.title.value = s.tema || '';
  f.url.value = s.url;
  f.script.value = cleanScript(s.guion);
}
// Las notas entre corchetes ([Nota: …]) nunca son parte del guion: el director completa lo que falte
const cleanScript = (t) => String(t || '').replace(/\[[^\]]*\]/g, '').replace(/\n{3,}/g, '\n\n').trim();

$('#btnRunIdeas').onclick = async () => {
  await api('research/accounts', { accounts: $('#inAccounts').value.split(/[\n,]+/) });
  await api('research/run', {});
  refreshIdeas();
};
$('#btnStopIdeas').onclick = () => api('research/stop', {}).then(refreshIdeas);
$('#inAccounts').onchange = () => api('research/accounts', { accounts: $('#inAccounts').value.split(/[\n,]+/) });

$('#btnResetFrames').onclick = () => confirm('¿Borrar TODOS los frames y clips de este video y hacerlos de nuevo con el mismo plan?') && api('jobs/' + job.id + '/reset', { from: 'frames' }).then(() => { panelSig = ''; refresh(); });
$('#btnResetPlan').onclick = () => confirm('¿Borrar el plan, los frames y los clips y que el Director lo rehaga con las reglas nuevas? (el guion y la referencia se mantienen)') && api('jobs/' + job.id + '/reset', { from: 'director' }).then(() => { panelSig = ''; refresh(); });

// ---------- Chat de cambios ----------
function chatHtml() {
  const msgs = [{ role: 'assistant', text: '¿Qué quieres cambiar del video? Dímelo con tus palabras (por ejemplo: "en el clip 3 la cara sale rara", "el hook más corto", "quita las pausas del final") y me pongo a trabajar.' }, ...(job.chat || [])];
  return `<div class="chat"><h2 class="sec">💬 ¿Qué cambiamos?</h2>
    <div class="chat-log" id="chatLog">${msgs.map((m) => `<div class="msg ${m.role}">${esc(m.text)}</div>`).join('')}</div>
    <form class="chat-in" id="chatForm"><input id="chatIn" placeholder="Escribe aquí lo que quieres cambiar…" autocomplete="off"><button class="primary">Enviar</button></form></div>`;
}
function bindChat() {
  const f = $('#chatForm');
  if (!f) return;
  const log = $('#chatLog');
  log.scrollTop = log.scrollHeight;
  f.onsubmit = async (e) => {
    e.preventDefault();
    const text = $('#chatIn').value.trim();
    if (!text) return;
    log.insertAdjacentHTML('beforeend', `<div class="msg user">${esc(text)}</div><div class="msg assistant" id="thinking">Pensando…</div>`);
    log.scrollTop = log.scrollHeight;
    $('#chatIn').value = '';
    try { await api(`jobs/${job.id}/chat`, { message: text }); } catch {}
    panelSig = '';
    refresh();
  };
}

// ---------- Analista: por qué es viral + variaciones ----------
function analysisHtml(a, src) {
  if (!a) return '';
  return `<div class="notes"><b>🧠 Por qué funciona</b><ul>${(a.porque || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    <p><b>Fórmula:</b> ${esc(a.formula || '')}</p></div>
    <div class="cards">${(a.variaciones || []).map((v, i) => `<div class="card"><h3><span>${esc(v.titulo)}</span></h3>
      <div class="muted">Hook: “${esc(v.hook)}”</div><p style="font-size:12px">${esc(v.porque || '')}</p>
      <details><summary class="muted">Guion</summary><pre>${esc(v.guion)}</pre></details>
      <div class="btns"><button class="good" data-var="${i}" data-src="${esc(src)}">🎬 Crear video con esta</button><label class="small" style="margin:0;display:flex;gap:6px;align-items:center"><input type="checkbox" data-pick="${i}" style="width:auto"> Lote</label></div></div>`).join('')}</div>
    <div class="btns"><button data-batch="crecimiento">🌙 Hacer las marcadas esta noche · 🚀 Crecimiento</button><button data-batch="venta">🌙 Hacer las marcadas · 💰 Venta</button></div>`;
}
function bindVariations(a, url) {
  document.querySelectorAll('[data-batch]').forEach((b) => b.onclick = () => {
    const box = b.closest('.btns').previousElementSibling;  // la lista de variaciones justo encima
    const picked = [...box.querySelectorAll('[data-pick]:checked')].map((x) => a.variaciones[x.dataset.pick]);
    makeBatch(picked, url, b.dataset.batch);
  });
  document.querySelectorAll('[data-var]').forEach((b) => b.onclick = async () => {
    const v = a.variaciones[b.dataset.var];
    await $('#btnNew').onclick();
    const f = $('#formNew');
    f.title.value = v.titulo; f.url.value = url || ''; f.script.value = cleanScript(v.guion);
  });
}
// Las ideas salen en una ventana encima del panel
function showIdeas(a, url) {
  $('#ideasBody').innerHTML = analysisHtml(a, 'job');
  bindVariations(a, url);
  if (!$('#dlgIdeas').open) $('#dlgIdeas').showModal();
}
$('#btnAnalyze').onclick = async () => {
  if (job.analysis) return showIdeas(job.analysis, job.url);
  $('#ideasBody').innerHTML = '<p class="muted" style="padding:30px;text-align:center">🧠 El analista está viendo por qué funciona este video y buscando variaciones…<br>Tarda menos de 1 minuto.</p>';
  $('#dlgIdeas').showModal();
  try { job.analysis = await api(`jobs/${job.id}/analyze`, {}); } catch (e) { $('#ideasBody').innerHTML = `<p class="alert">No pude analizarlo: ${esc(e.message)}</p>`; return; }
  showIdeas(job.analysis, job.url);
  $('#btnAnalyze').textContent = '🧠 Ver ideas';
};

// ---------- Videos completos ----------
async function refreshLibrary() {
  const lib = await api('library');
  show('library');
  const dayOf = (v) => { const t = new Date(v.createdAt).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }); return t[0].toUpperCase() + t.slice(1); };
  const days = [...new Set(lib.map(dayOf))];
  const card = (v) => `<div class="card"><h3><span>${v.auto ? '🌙 ' : ''}${esc(v.title)}${v.driveName ? ` <span class="badge done">☁️ ${esc(v.driveName)}</span>` : ''}</span><span class="badge">${v.videoType === 'venta' ? '💰 Venta' : '🚀 Crecimiento'}</span></h3>
    <video controls preload="metadata" src="${rootFile(encodeURI(v.file))}" style="width:100%;aspect-ratio:9/16;border-radius:8px;background:#000"></video>
    ${v.fileB ? `<details style="margin-top:6px"><summary class="muted" style="font-size:12px;cursor:pointer">🅱️ Versión B: ${esc((v.hookB || '').replace(/\*/g, ''))}</summary><video controls preload="none" src="${rootFile(encodeURI(v.fileB))}" style="width:100%;aspect-ratio:9/16;border-radius:8px;background:#000;margin-top:6px"></video></details>` : ''}
    <div class="btns"><a href="${rootFile(encodeURI(v.file))}" download><button class="small">⬇ Descargar${v.fileB ? ' A' : ''}</button></a>${v.fileB ? `<a href="${rootFile(encodeURI(v.fileB))}" download><button class="small">⬇ B</button></a>` : ''}${v.kit ? `<button class="small" data-libkit="${v.id}">📋 Texto</button>` : ''}<button class="small" data-openjob="${v.id}">💬 Cambiar algo</button><button class="small" data-drive="${v.id}">☁️ ${v.driveName ? 'Renombrar en Drive' : 'Subir a Drive'}</button>${dotsMenu(v.id)}</div></div>`;
  $('#libCards').innerHTML = days.map((d) => `<h2 class="sec day">📅 ${esc(d)} <span class="muted">· ${lib.filter((v) => dayOf(v) === d).length} videos</span></h2><div class="cards">${lib.filter((v) => dayOf(v) === d).map(card).join('')}</div>`).join('') || '<p class="muted">Todavía no hay videos terminados.</p>';
  bindDots($('#libCards'));
  document.querySelectorAll('[data-openjob]').forEach((b) => b.onclick = () => open(b.dataset.openjob));
  document.querySelectorAll('[data-drive]').forEach((b) => b.onclick = async () => {
    const cur = await api('drive/' + b.dataset.drive);
    const name = prompt(cur.uploaded ? 'Nuevo nombre en Drive:' : 'Nombre con el que se sube a Drive:', cur.name);
    if (!name) return;
    b.textContent = '☁️ Subiendo…';
    const r = await fetch('/api/drive/' + b.dataset.drive, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }).then((x) => x.json());
    if (r.error) alert(r.error);
    refreshLibrary();
  });
  document.querySelectorAll('[data-libkit]').forEach((b) => b.onclick = () => { const v = lib.find((x) => x.id === b.dataset.libkit); navigator.clipboard.writeText(kitText(v.kit)); b.textContent = '✓ Copiado'; });
}

// ---------- Kit para publicar ----------
// Igual que lib/kit.js: descripción, 7 puntos en líneas separadas (esconden los hashtags) y los hashtags
const kitText = (k) => [k.caption || '', k.disclosure ? '\n' + k.disclosure : '', ...Array(7).fill('.'), k.hashtags || ''].join('\n').replace(/\n{3,}\./, '\n\n.').trim();
const kitPlace = (k) => `<div style="font-size:12px;margin-top:6px;color:#fcd34d">🤖 Al publicar: activa <b>"Hecho con IA"</b> (junto a Reels de prueba). Siempre.</div>` + (k && k.comentario ? `<div class="muted" style="font-size:12px;margin-top:6px">📌 Comentario para fijar: <b>${esc(k.comentario)}</b> <button class="small" onclick="navigator.clipboard.writeText(${esc(JSON.stringify(k.comentario))});this.textContent='✓'">📋</button></div>` : '') +
  (k && k.ubicacion ? `<div class="muted" style="font-size:12px;margin-top:6px">📍 Pon de ubicación: <b>${esc(k.ubicacion)}</b> (ayuda a que salga en EE. UU.)</div>` : '');
function kitHtml() {
  const k = job.kit;
  if (!k) return '';
  return `<h2 class="sec">📦 Para publicar</h2><div class="kit">
    ${k.cover ? `<a href="${file(k.cover, job.outputV)}" download="portada.jpg"><img src="${file(k.cover, job.outputV)}" title="Descargar portada"></a>` : ''}
    <div style="flex:1;min-width:240px"><pre class="kit-text">${esc(kitText(k))}</pre>${kitPlace(k)}
    <div class="btns"><button class="primary small" data-copykit>📋 Copiar descripción y hashtags</button>${k.cover ? `<a href="${file(k.cover, job.outputV)}" download="portada.jpg"><button class="small">⬇ Portada</button></a>` : ''}</div></div></div>`;
}

// ---------- Informe de tiempos y gasto ----------
function reportHtml() {
  const t = job.timings || {};
  const names = { capture: 'Captura', director: 'Director', frames: 'Frames', clips: 'Clips', editor: 'Editor' };
  const mins = Object.entries(names).filter(([k]) => t[k]).map(([k, n]) => `${n} ${(t[k] / 60000).toFixed(1)} min`);
  const u = job.usage || {};
  const tot = Object.values(u).reduce((a, b) => a + b, 0);
  const use = Object.entries(u).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${names[k] || k} ${Math.round((v / tot) * 100)} %`);
  if (!mins.length) return '';
  const total = Object.values(t).reduce((a, b) => a + b, 0) / 60000;
  return `<div class="notes"><b>⏱️ Tiempo de máquina: ${total.toFixed(0)} min</b> · ${mins.join(' · ')}${tot ? `<br><b>🔋 Gasto de Claude:</b> ≈ ${Math.round(tot / 1000)} mil tokens · ${use.join(' · ')}` : ''}</div>`;
}

// ---------- Lote nocturno ----------
async function makeBatch(list, url, videoType) {
  if (!list.length) return alert('Marca primero las ideas que quieres');
  if (!confirm(`¿Crear ${list.length} videos en 🌙 Todo directo (${videoType === 'venta' ? 'Venta' : 'Crecimiento'})? Se harán solos y en cola.`)) return;
  const r = await api('jobs/batch', { videoType, setting: 'kitchen', items: list.map((v) => ({ title: v.titulo, url, script: cleanScript(v.guion) })) });
  alert(`🌙 ${r.created} videos en cola. Los tendrás en "Videos completos".`);
  loadList();
}

// ---------- Resultados de tus videos ----------
async function refreshResults() {
  const r = await api('results');
  show('results');
  const w = r.workers.results;
  const st = r.running ? 'working' : w.state;
  $('#btnRunResults').disabled = r.running;
  $('#btnStopResults').hidden = !r.running;
  $('#rMeta').textContent = (r.lastRun ? `Último análisis: ${new Date(r.lastRun).toLocaleString()}` : 'Todavía no se ha analizado. Inicia sesión en Instagram en el Chrome de Flow Studio y pulsa Analizar ahora.') +
    (r.auto && r.lastRun ? ` · se repite solo cada ${r.auto} h` : '');
  $('#rRoom').innerHTML = room('results', '📈', 'Analista de resultados', st, st === 'working' || st === 'error' ? w.action : (w.action || 'Listo')) + `<pre class="log">${esc(w.log.slice(-8).join('\n'))}</pre>`;
  const p = r.report;
  $('#rReport').innerHTML = p ? `<div class="notes"><b>Resumen</b><p>${esc(p.resumen || '')}</p>
    ${(p.patrones || []).length ? `<b>Lo que marca la diferencia</b><ul>${p.patrones.map((x) => `<li>${esc(x.texto)} <span class="badge ${x.fuerza === 'fuerte' ? 'done' : ''}">${esc(x.fuerza || '')}</span></li>`).join('')}</ul>` : ''}
    ${(p.lecciones || []).length ? `<b>Lo que ya aplica el director en los próximos videos</b><ul>${p.lecciones.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${p.horario ? `<b>🕐 Cuándo publicar</b><p>${esc(p.horario)}</p>` : ''}
    ${(p.probar || []).length ? `<b>Para probar</b><ul>${p.probar.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>` : '';
  const med = p && p.median;
  const reels = [...(r.reels || [])].sort((a, b) => (b.views || 0) - (a.views || 0));
  $('#rTable').innerHTML = reels.length ? `<table class="rtable"><tr><th>Vistas</th><th>vs media</th><th>Likes</th><th>Coment.</th><th>Publicado</th><th>Reel</th><th>Video de Flow Studio</th></tr>${reels.map((x) => `<tr>
    <td><b>${fmt(x.views || 0)}</b></td><td style="color:${med && x.views / med >= 1.5 ? '#86efac' : med && x.views / med < 0.6 ? '#fca5a5' : 'inherit'}">${med && x.views ? (x.views / med).toFixed(1) + '×' : x.postedAt && Date.now() - Date.parse(x.postedAt) < 48 * 3600000 ? '<span class="muted">recién publicado</span>' : '–'}</td>
    <td>${x.likes ?? ''}</td><td>${x.comments ?? ''}</td><td>${x.postedAt ? new Date(x.postedAt).toLocaleDateString() : ''}</td>
    <td><a href="${esc(x.url)}" target="_blank" style="color:#93c5fd">Ver reel</a></td>
    <td><select data-link="${esc(x.url)}" style="max-width:260px"><option value="">— ¿Qué video es? —</option>${Object.entries(r.titles).map(([id, t]) => `<option value="${id}" ${x.jobId === id && x.version !== 'B' ? 'selected' : ''}>${esc(t)}${r.withB[id] ? ' · A' : ''}</option>${r.withB[id] ? `<option value="${id}#B" ${x.jobId === id && x.version === 'B' ? 'selected' : ''}>${esc(t)} · B</option>` : ''}`).join('')}</select>${x.linked ? ' ✓' : x.autoLinked ? ' <span class="muted">🔗 auto (misma duración)</span>' : x.jobId ? ' <span class="muted">(adivinado)</span>' : ''}</td></tr>`).join('')}</table>
    <p class="muted" style="font-size:12px">Elige qué video es cada reel: así el analista sabe qué hook, escenario y tipo de video tuvo cada resultado. Se tiene en cuenta en el próximo análisis.</p>` : '';
  document.querySelectorAll('[data-link]').forEach((sel) => sel.onchange = () => api('results/link', { url: sel.dataset.link, jobId: sel.value }).then(refreshResults));
}
$('#btnRunResults').onclick = async () => { await api('results/run', {}); refreshResults(); };
$('#btnStopResults').onclick = () => api('results/stop', {}).then(refreshResults);

// ---------- Piloto automático y avisos al móvil ----------
const SETTING_ES = { kitchen: 'Cocina', walmart: 'Walmart', target: 'Target', supermarket: 'Supermercado', bathroom: 'Baño', reference: 'Como la referencia', mix: 'Variado (cocina, Walmart, Target…)' };
const STATUS_ES = { done: '✅ listo', running: '⏳ en marcha', waiting_limit: '💤 esperando límite', error: '❌ atascado', waiting_you: '✋ te espera', paused: '⏸ parado', stopped: '⏹ parado' };
let pilotFormSig = '';
async function refreshSettings() {
  const p = await api('autopilot');
  show('settings');
  renderDrive();
  const r = await api('research');
  if (document.activeElement !== $('#inAccounts')) $('#inAccounts').value = (r.accounts || []).join('\n');
  const sug = (r.suggestedAccounts || []).filter((a) => !(r.accounts || []).includes(String(a.account).replace(/^@/, '')));
  $('#sugAccounts').innerHTML = sug.length ? `<div class="muted" style="font-size:12px;margin-top:8px">Cuentas parecidas que ha encontrado el Investigador (las de 🇺🇸 inglés te adelantan lo que se hará viral en español):</div><div class="btns">${sug.map((a) => `<button class="small" data-addacc="${esc(String(a.account).replace(/^@/, ''))}">＋ ${a.lang === 'en' ? '🇺🇸' : '🇪🇸'} @${esc(String(a.account).replace(/^@/, ''))}${a.followers ? ' · ' + fmt(a.followers) : ''}</button>`).join('')}</div>` : '';
  document.querySelectorAll('[data-addacc]').forEach((b) => b.onclick = async () => { await api('research/accounts', { accounts: [...(r.accounts || []), b.dataset.addacc] }); refreshSettings(); });
  const o = p.opts;
  const sig = JSON.stringify([o, p.ntfyTopic, p.speed, p.silences, p.fixedTags, p.captionStyle]);
  if (sig !== pilotFormSig) {
    pilotFormSig = sig;
    $('#pilotForm').innerHTML = `Cada noche busca ideas virales, hace los videos solo y los sube a tu Drive. Si se acaba el límite de Claude, espera y sigue cuando se renueva. ${o.enabled ? `<span class="badge done">activado · cada noche a las ${o.hour}:00</span>` : '<span class="badge">desactivado</span>'}
      <div class="row" style="margin-top:8px;align-items:end">
        <label style="flex:none;display:flex;gap:6px;align-items:center"><input type="checkbox" id="apOn" style="width:auto" ${o.enabled ? 'checked' : ''}> Activado</label>
        <label>Hora <select id="apHour">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h == o.hour ? 'selected' : ''}>${h}:00</option>`).join('')}</select></label>
        <label>Videos por noche <input id="apVideos" type="number" min="1" max="10" value="${o.videos}"></label>
        <label>De ellos 💰 Venta <input id="apVenta" type="number" min="0" max="10" value="${o.venta}"></label>
        <label>Escenario <select id="apSetting">${[...p.settings, 'mix'].map((k) => `<option value="${k}" ${k === o.setting ? 'selected' : ''}>${SETTING_ES[k] || k}</option>`).join('')}</select></label>
        <button class="primary" id="apSave" style="flex:none">Guardar</button>
      </div>
      <div class="muted" style="font-size:12px">Deja el PC encendido, enchufado y con Flow Studio abierto (no se dormirá mientras esté activado). Si es portátil, no cierres la tapa.</div>`;
    $('#notifyBox').innerHTML = `${p.ntfyTopic ? '<span class="badge done">activados</span>' : '<span class="badge">desactivados</span>'}
      <ol style="font-size:13px;margin:8px 0;padding-left:18px"><li>Instala en tu móvil la app gratuita <b>ntfy</b> (App Store / Google Play).</li><li>En la app pulsa <b>＋</b> y suscríbete al canal: <b>${esc(p.ntfyTopic || '(pulsa Crear canal)')}</b></li><li>Pulsa <b>Enviar prueba</b>.</li></ol>
      <div class="row" style="align-items:end"><label>Canal<input id="ntfyTopic" value="${esc(p.ntfyTopic)}" placeholder="flowstudio-…"></label>
      <button id="ntfyNew" style="flex:none">Crear canal</button><button class="primary" id="ntfySave" style="flex:none">Guardar</button><button id="ntfyTest" style="flex:none">Enviar prueba</button></div>
      <div class="muted" style="font-size:12px">Te avisa cuando un video está listo, cuando te necesita, si se atasca, si se acaba el límite de Claude y el resumen de cada noche.</div>`;
    $('#editBox').innerHTML = `<div class="row" style="align-items:end">
        <label>⚡ Velocidad del video <select id="edSpeed">${[[1, 'Normal (x1)'], [1.05, 'Un poco más rápido (x1,05)'], [1.1, 'Más dinámico (x1,1)'], [1.15, 'Rápido (x1,15)'], [1.2, 'Muy rápido (x1,2)']].map(([v, t]) => `<option value="${v}" ${Number(p.speed) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>🤫 Silencios entre frases <select id="edSil">${[['normal', 'Normales'], ['corto', 'Cortos (recomendado)'], ['muycorto', 'Muy cortos (casi sin pausas)']].map(([v, t]) => `<option value="${v}" ${p.silences === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>🔤 Subtítulos <select id="edCap">${[['bold', 'GRUESOS en mayúsculas, palabra clave en color'], ['elegant', 'Elegantes, palabra clave en cursiva']].map(([v, t]) => `<option value="${v}" ${p.captionStyle === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <button class="primary" id="edSave" style="flex:none">Guardar</button></div>
      <div class="row" style="align-items:end"><label># Hashtags fijos (van siempre al final; Instagram deja 5 en total, los otros los elige el sistema)<input id="edTags" value="${esc((p.fixedTags || []).join(' '))}" placeholder="#hashtag1 #hashtag2"></label></div>
      <div class="muted" style="font-size:12px">La velocidad acelera imagen y voz a la vez sin cambiar el tono de la voz. Se aplica a los videos que se monten a partir de ahora (o pulsa "↻ Rehacer edición" en uno ya hecho).</div>`;
    $('#edSave').onclick = async () => { await api('autopilot', { speed: $('#edSpeed').value, silences: $('#edSil').value, fixedTags: $('#edTags').value, captionStyle: $('#edCap').value }); pilotFormSig = ''; refreshSettings(); };
    $('#apSave').onclick = async () => { await api('autopilot', { autopilot: { enabled: $('#apOn').checked, hour: $('#apHour').value, videos: $('#apVideos').value, venta: $('#apVenta').value, setting: $('#apSetting').value } }); pilotFormSig = ''; refreshSettings(); };
    $('#ntfyNew').onclick = () => { $('#ntfyTopic').value = 'flowstudio-' + Math.random().toString(36).slice(2, 10); };
    $('#ntfySave').onclick = async () => { await api('autopilot', { ntfyTopic: $('#ntfyTopic').value }); pilotFormSig = ''; refreshSettings(); };
    $('#ntfyTest').onclick = async () => { await api('autopilot', { ntfyTopic: $('#ntfyTopic').value }); pilotFormSig = ''; await api('autopilot/test', {}); alert('Enviado. Mira tu móvil.'); refreshSettings(); };
  }
}

async function renderDrive() {
  const dv = await api('drive');
  if ($('#driveBox').contains(document.activeElement)) return;
  $('#driveBox').innerHTML = `${dv.target ? `<span class="badge done">activa → ${esc(dv.target)}</span>` : '<span class="badge">desactivada</span>'}
    <div class="row" style="margin-top:8px;align-items:end">
      <label>Carpeta de tu Google Drive en este PC ${dv.detected.length ? `(encontrada: ${dv.detected.map(esc).join(', ')})` : '(instala Google Drive para ordenador)'}<input id="inDrive" value="${esc(dv.driveFolder || dv.detected[0] || '')}" placeholder="G:\\Mi unidad"></label>
      <label>Subcarpeta<input id="inDriveSub" value="${esc(dv.driveSubfolder)}"></label>
      <button class="primary" id="btnDrive" style="flex:none">Guardar</button>
    </div>
    <div class="muted" style="font-size:12px">Cada video terminado se sube como <b>1-DDMMAAAAIA.mp4</b>, <b>2-DDMMAAAAIA.mp4</b>… (número del día + fecha + IA), con su texto y su portada. Déjalo vacío para no subir.</div>`;
  $('#btnDrive').onclick = async () => { await api('drive', { driveFolder: $('#inDrive').value, driveSubfolder: $('#inDriveSub').value }); renderDrive(); };
}

// ---------- 🏠 Hoy ----------
async function refreshHome() {
  show('home');
  const [list, p, r] = await Promise.all([loadList(), api('autopilot'), api('results')]);
  const wait = list.filter(needsYou);
  const run = list.filter((j) => !needsYou(j) && j.status !== 'done');
  const today = list.filter((j) => j.status === 'done' && new Date(j.createdAt).toDateString() === new Date().toDateString());
  $('#hMeta').textContent = `${new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })} · ${today.length} videos terminados hoy`;
  const why = (j) => j.status === 'error' ? '❌ Se atascó: ábrelo y pulsa Continuar' : ['paused', 'stopped'].includes(j.status) ? '⏸ Parado: ábrelo y pulsa Continuar (o archívalo en ⋯ Más)' : j.stage === 'review_frames' ? 'Revisa los frames' : j.stage === 'review_final' ? 'Dale el OK final' : 'Necesita que lo mires';
  const row = (j, txt) => `<div class="hrow" data-openjob="${j.id}"><span class="dot ${j.status}"></span><div><b>${esc(j.title)}</b><small>${esc(txt)}</small></div></div>`;
  $('#hWait').innerHTML = `<h3>✋ Te esperan <span class="badge ${wait.length ? 'waiting_you' : ''}">${wait.length}</span></h3>` +
    (wait.map((j) => row(j, why(j))).join('') || '<p class="muted">Nada pendiente. 👌</p>');
  $('#hRun').innerHTML = `<h3>⏳ En marcha <span class="badge ${run.length ? 'working' : ''}">${run.length}</span></h3>` +
    (run.map((j) => row(j, j.status === 'waiting_limit' ? '💤 Esperando a que se renueve el límite de Claude' : stageName(j.stage))).join('') || '<p class="muted">Ningún video trabajando ahora.</p>');
  const o = p.opts;
  const last = p.runs[0];
  const w = p.worker;
  $('#hPilot').innerHTML = `<h3>🌙 Piloto automático ${o.enabled ? `<span class="badge done">cada noche a las ${o.hour}:00</span>` : '<span class="badge">desactivado</span>'}</h3>
    <p>${o.enabled ? `Esta noche hará <b>${o.videos} videos</b> (${o.venta} de 💰 Venta) y los subirá a tu Drive.` : 'Actívalo en ⚙️ Ajustes para que haga videos mientras duermes.'}</p>
    ${p.running || w.state === 'working' || w.state === 'paused' ? `<p class="muted">Ahora: ${esc(w.action)}</p>` : ''}
    ${last ? `<div class="muted" style="font-size:12px">Última tanda (${new Date(last.at).toLocaleString()}):</div>${last.jobs.map((x) => row(x, (STATUS_ES[x.status] || x.status) + (x.driveName ? ' · ☁️ ' + x.driveName : ''))).join('')}` : ''}
    <div class="btns"><button id="hPilotRun" ${p.running ? 'disabled' : ''}>▶ Lanzar ahora</button><button data-go="settings">⚙️ Cambiar</button></div>`;
  const rep = r.report;
  const top = [...(r.reels || [])].sort((a, b) => (b.views || 0) - (a.views || 0))[0];
  $('#hResults').innerHTML = `<h3>📈 Tus reels</h3>` + (rep ? `<p>${esc((rep.resumen || '').split(/(?<=\.)\s/)[0])}</p>
    ${rep.horario ? `<p>🕐 <b>Publica:</b> ${esc(rep.horario)}</p>` : ''}
    ${top ? `<p class="muted">Mejor: <b>${fmt(top.views)}</b> vistas${rep.median ? ` · ${(top.views / rep.median).toFixed(1)}× tu media` : ''}</p>` : ''}
    ${(rep.lecciones || []).length ? `<div class="muted" style="font-size:12px">El director ya aplica:</div><ul>${rep.lecciones.slice(0, 3).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}` : '<p class="muted">Todavía no hay análisis.</p>') +
    `<div class="btns"><button data-go="results">Ver todo</button></div>`;
  document.querySelectorAll('#home [data-openjob]').forEach((b) => b.onclick = () => open(b.dataset.openjob));
  document.querySelectorAll('#home [data-go]').forEach((b) => b.onclick = () => go(b.dataset.go));
  $('#hPilotRun').onclick = async () => { if (!confirm('¿Lanzar el piloto automático ahora? Buscará ideas y empezará los videos.')) return; await api('autopilot/run', {}); refreshHome(); };
}

// Navegación
function go(view) {
  current = view;
  location.hash = view;
  show(view);
  if (view === 'ideas') ideasSig = '';
  if (view === 'settings') pilotFormSig = '';
  refresh();
  loadList();
}
// (enlazado al principio del archivo, para que funcione aunque algo de abajo falle)
$('#btnHomeNew').onclick = () => $('#btnNew').onclick();
$('#btnHomeIdeas').onclick = () => go('ideas');
$('#btnArchive').onclick = async () => {
  if (!confirm('¿Archivar este video? Desaparece de la lista, pero sus archivos se quedan en el PC.')) return;
  await api('jobs/' + job.id + '/archive', {});
  go('home');
};
document.querySelectorAll('.more .menu button').forEach((b) => b.addEventListener('click', () => { $('.more').open = false; }));

// ---------- 🩺 Estado del sistema ----------
$('#btnHealth').onclick = async () => {
  $('#healthBox').innerHTML = '<span class="muted">Comprobando…</span>';
  const list = await api('health');
  const bad = list.filter((x) => !x.ok && !x.soft).length;
  $('#healthBox').innerHTML = `<p>${bad ? `⚠️ <b>${bad} cosa(s) por arreglar</b>` : '✅ <b>Todo listo</b>'}</p><ul>${list.map((x) => `<li>${x.ok ? '✅' : x.soft ? '➖' : '❌'} <b>${esc(x.name)}</b> <span class="muted">${esc(x.info || 'no encontrado')}</span>${!x.ok && x.fix ? `<br><span style="font-size:12px">👉 ${esc(x.fix)}</span>` : ''}</li>`).join('')}</ul>`;
};
