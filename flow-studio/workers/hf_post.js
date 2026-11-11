// 📦 HIGGSFIELD · ENTREGA: vídeo limpio, hook (siempre 63), contadores, paneles para CapCut y descripción revisada en código.
// Se guarda en la carpeta del trabajo, como Google Doc (emojis intactos en el iPhone) y en tu Google Drive.
const fs = require('fs');
const path = require('path');
const store = require('../lib/store');
const claude = require('../lib/claude');
const config = require('../config.json');
const { checkDescription } = require('../lib/hf/description');

const W = 'hf_post';
const HF = config.higgsfield;
const P = (f) => fs.readFileSync(path.join(store.ROOT, 'prompts', f), 'utf8');
const fill = (t, v) => t.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in v ? v[k] : m));
const age63 = (s) => String(s || '').replace(/\b(I'?m|I am|at|age)\s+(\d{2})\b/gi, (m, w, n) => (n === '63' ? m : `${w} 63`));

function examples() {
  const f = path.join(store.ROOT, 'prompts', 'hf_examples.md');
  const t = fs.readFileSync(f, 'utf8');
  const i = t.indexOf('## Anexo C');
  return i >= 0 ? t.slice(i) : t;
}

async function write(job, errors) {
  const a = job.hf.analysis;
  const v = job.hf.video;
  const cur = v.tries.find((t) => t.n === v.chosen);
  const beats = cur && cur.qa && cur.qa.beats && cur.qa.beats.length ? cur.qa.beats.map((b) => `- ${b.from}-${b.to}s: ${b.seen_es || ''}`).join('\n') : (cur ? cur.prompt : '(?)');
  const ot = a.onscreen_text || {};
  const prompt = fill(P('hf_post.md'), {
    AVATAR_NAME: HF.avatar.name, ACCOUNT: HF.account, BEATS: beats,
    ANALYSIS: JSON.stringify({ ...a, overrides: job.hf.overrides, corrections: job.hf.corrections.map((c) => c.text) }, null, 2),
    REF_HOOK: ot.hook || '(none)', REF_TEXTS: JSON.stringify([...(ot.counters || []), ...(ot.other || [])]), REF_PANELS: JSON.stringify(a.overlays || []),
    REF_DESC: job.hf.description ? '"""\n' + job.hf.description.slice(0, 3000) + '\n"""' : '(not available: use the usual "I\'m 63. {N} things I do every single day to {benefit} 👇 (SAVE THIS)" format)',
    NOTE: (job.hf.post && job.hf.post.note) || '(none)', RULES: P('hf_post_rules.md'), EXAMPLES: examples(),
    ERRORS: errors ? `## YOUR PREVIOUS DESCRIPTION WAS REJECTED BY THE CHECKER — fix exactly this:\n- ${errors.join('\n- ')}` : '',
  });
  const out = await claude.run({ job, worker: W, prompt, tools: ['Read'], cwd: store.jobDir(job.id), workerModel: 'hf_writer' });
  return claude.extractJson(out);
}

function panelFix(p) {
  let s = String(p.prompt_en || '');
  s = s.replace(/skin removed|muscle fibers?/gi, 'stylized educational diagram, calm, clinical, non-graphic');
  if (!/21:9/.test(s)) s = 'Wide horizontal 21:9 image. ' + s;
  if (!/No text/i.test(s)) s += ' No text, captions, labels, logos or watermarks.';
  return { ...p, prompt_en: s };
}

function overlaysMd(job, r) {
  const L = [`# Overlays para CapCut · ${job.title}`, '', `## Hook (${r.hook.from ?? 0}-${r.hook.to ?? 3} s)`, ...r.hook.lines.map((l) => `- ${l}`), r.hook.es ? `\n${r.hook.es}` : ''];
  if ((r.counters || []).length) L.push('', '## Contadores', ...r.counters.map((c) => `- ${c.from}-${c.to} s: ${c.text}`));
  if ((r.panels || []).length) {
    L.push('', '## Paneles (21:9, sin texto, todos del mismo tamaño)', ...r.panels.map((p, i) => `- Panel ${i + 1} · ${p.from}-${p.to} s: ${p.what_es}`));
    L.push('', '### Prompts de los paneles (Nano Banana Pro)', ...r.panels.map((p, i) => `\nPanel ${i + 1}:\n${p.prompt_en}`));
  }
  L.push('', '## Plan', r.overlay_plan_es || '', '', '## Antes de publicar', '- Activa la etiqueta de contenido IA.', '- Programa a las 8:00 ET (5:00 en el iPhone, hora de Los Ángeles).');
  return L.join('\n');
}

async function run(job) {
  const dir = store.jobDir(job.id);
  const post = job.hf.post || (job.hf.post = {});
  const v = job.hf.video;
  const cur = v.tries.find((t) => t.n === v.chosen);
  if (!cur) throw new Error('Falta el vídeo aprobado');
  // 1) Vídeo limpio
  fs.copyFileSync(path.join(dir, cur.file), path.join(dir, 'post', 'final.mp4'));
  post.video = 'post/final.mp4';
  // 2) Textos (2 rondas con la revisión en código)
  store.setWorker(job, W, { action: 'Escribiendo el hook, los overlays y la descripción…' });
  let r = await write(job);
  let chk = checkDescription(r.description);
  if (chk.errors.length) {
    store.log(job, W, '✋ Descripción rechazada por la revisión: ' + chk.errors.join('; '));
    r = await write(job, chk.errors);
    chk = checkDescription(r.description);
  }
  if (chk.errors.length) { const e = new Error('La descripción no pasa la revisión: ' + chk.errors.join('; ')); e.noRetry = true; throw e; }
  for (const f of chk.fixes) store.log(job, W, '🔧 ' + f);
  for (const w of chk.warnings) store.log(job, W, '⚠️ ' + w);
  r.hook = r.hook || { lines: [] };
  r.hook.lines = (r.hook.lines || []).map(age63);
  r.panels = (r.panels || []).map(panelFix);
  Object.assign(post, { hook: r.hook, counters: r.counters || [], panels: r.panels, plan: r.overlay_plan_es || '', description: chk.text, warnings: chk.warnings, at: Date.now(), note: '' });
  fs.writeFileSync(path.join(dir, 'post', 'description.txt'), '﻿' + chk.text + '\n');
  fs.writeFileSync(path.join(dir, 'post', 'overlays.md'), overlaysMd(job, r));
  store.log(job, W, `✅ Hook: "${r.hook.lines.join(' / ')}" · ${post.counters.length} contadores · ${post.panels.length} paneles · descripción revisada`);
  store.save(job);
  // 3) Google Doc (no para el trabajo si falla: la descripción también queda en el botón de copiar)
  try {
    store.setWorker(job, W, { action: '📄 Creando el Google Doc con la descripción…' });
    const d = new Date();
    post.docUrl = await require('../lib/hf/gdoc').createDoc({ title: `Diane ${d.toISOString().slice(0, 10)} · ${job.title}`, text: chk.text, log: (m) => store.log(job, W, m) });
  } catch (e) {
    post.docUrl = null;
    store.log(job, W, '⚠️ No pude crear el Google Doc (' + e.message.slice(0, 120) + '): usa el botón 📋 Copiar o post/description.txt');
  }
  // 4) Copia a tu Google Drive (carpeta de Drive para ordenador de Ajustes)
  try {
    const s = require('../lib/settings').get();
    if (s.driveFolder && fs.existsSync(s.driveFolder)) {
      const d = new Date();
      const day = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
      const dest = path.join(s.driveFolder, HF.driveSubfolder || 'Diane Glows', day);
      fs.mkdirSync(dest, { recursive: true });
      const base = `${job.id}-${job.title.replace(/[^\w\- áéíóúñÁÉÍÓÚÑ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40)}`;
      fs.copyFileSync(path.join(dir, 'post', 'final.mp4'), path.join(dest, base + '.mp4'));
      fs.copyFileSync(path.join(dir, 'post', 'overlays.md'), path.join(dest, base + '-overlays.txt'));
      fs.copyFileSync(path.join(dir, 'post', 'description.txt'), path.join(dest, base + '-descripcion.txt'));
      post.driveDir = dest;
      store.log(job, W, '☁️ Copiado a tu Google Drive: ' + dest);
    } else store.log(job, W, '☁️ Sin carpeta de Google Drive en ⚙️ Ajustes: lo dejo en la carpeta del trabajo');
  } catch (e) { store.log(job, W, '⚠️ No pude copiarlo a Drive: ' + e.message.slice(0, 120)); }
  store.save(job);
  return 'ok';
}

module.exports = { run, checkDescription };
