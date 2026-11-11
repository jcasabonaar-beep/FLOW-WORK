// 🖼️ HIGGSFIELD · KEYFRAMES: Claude escribe el prompt de Nano Banana Pro con las reglas, el código lo revisa
// y el proveedor (higgsfield.ai en el Chrome) genera. Tú apruebas, regeneras o editas con una nota.
// (El QA automático con reintentos llega en el paso 3; mientras, la parada de keyframes siempre te espera.)
const fs = require('fs');
const path = require('path');
const store = require('../lib/store');
const claude = require('../lib/claude');
const config = require('../config.json');
const { lintNano } = require('../lib/hf/prompts');
const provider = require('../lib/hf/provider');

const W = 'hf_keyframes';
const HF = config.higgsfield;
const P = (f) => fs.readFileSync(path.join(store.ROOT, 'prompts', f), 'utf8');
const fill = (t, v) => t.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in v ? v[k] : m));

// Estado de los keyframes según el análisis aprobado
function ensureState(job) {
  const a = job.hf.analysis;
  const kf = job.hf.kf || { items: [] };
  for (const it of a.keyframes.items) {
    if (!kf.items.find((x) => x.role === it.role)) kf.items.push({ role: it.role, status: 'pending', tries: [], note: '' });
  }
  kf.items = kf.items.filter((x) => a.keyframes.items.some((it) => it.role === x.role)).sort((p, q) => (p.role === 'start' ? -1 : 1) - (q.role === 'start' ? -1 : 1));
  job.hf.kf = kf;
  return kf;
}
const current = (item) => item.tries.find((t) => t.n === item.chosen) || item.tries[item.tries.length - 1];

// Qué imágenes se suben y en qué orden (Image 1, Image 2…)
function plan(job, item) {
  const dir = store.jobDir(job.id);
  const a = job.hf.analysis;
  const ref = a.keyframes.items.find((k) => k.role === item.role);
  const refFile = ref && ref.ref_file ? path.join(dir, ref.ref_file) : null;
  const diane = path.join(store.ROOT, HF.avatar.main);
  if (item.mode === 'edit') {
    const cur = current(item);
    const imgs = [{ file: path.join(dir, cur.file), what: 'the candidate to edit (keep everything except the requested change)' }];
    if (refFile) imgs.push({ file: refFile, what: 'frame of the reference video, ONLY as a visual reference for the change (another woman: do not copy her face or hair)', other: true });
    return { kind: 'edit', template: 'A3', images: imgs, desc: `edit of attempt ${cur.n}` };
  }
  if (item.role === 'end') {
    const start = job.hf.kf.items.find((x) => x.role === 'start');
    const s = start && current(start);
    if (!s) throw new Error('Falta el start frame para hacer el end frame');
    return { kind: 'end', template: 'A2', images: [{ file: path.join(dir, s.file), what: 'the START frame already made: her identity, face, silver-grey hair, outfit, jewelry, nails, room and lighting' }, { file: refFile, what: 'final frame of the reference: ONLY the final state, objects, her hand position and the framing (another woman: do not copy her face or hair)', other: true }], desc: 'END frame of a narrative video: same woman, room, light, framing and hairstyle as the start frame, in the final state' };
  }
  return { kind: 'base', template: 'A1', images: [{ file: diane, what: "Diane's main reference image: identity, face, facial features, skin, silver-grey hair color and body" }, { file: refFile, what: 'frame of the reference video: outfit, setting, pose and camera angle (another woman: do not copy her face or hair; ignore all text)', other: true }], desc: a.keyframes.strategy === 'loop' ? 'the single image used as START and END frame of a looping video' : 'START frame' };
}

async function writePrompt(job, item, p, lintErrors) {
  const hist = item.tries.map((t) => `- Attempt ${t.n} (${t.kind}): ${t.verdict ? 'producer said: ' + t.verdict : 'not reviewed'}${t.note ? ` · note: ${t.note}` : ''}\n  Prompt: ${t.prompt}`).join('\n') || '(none)';
  const prompt = fill(P('hf_keyframe_writer.md'), {
    AVATAR_NAME: HF.avatar.name, ACCOUNT: HF.account, ROLE: item.role, ROLE_DESC: p.desc,
    IMAGES: p.images.map((im, i) => `- Image ${i + 1} = ${im.file} — ${im.what}`).join('\n'),
    ANALYSIS: JSON.stringify({ ...job.hf.analysis, overrides: job.hf.overrides, corrections: job.hf.corrections.map((c) => c.text) }, null, 2),
    NOTE: (item.note || '(none)') + (lintErrors ? `\n\nYOUR PREVIOUS PROMPT WAS REJECTED BY THE CHECKER: ${lintErrors.join('; ')}. Fix it.` : ''),
    HISTORY: hist, RULES: P('hf_rules.md'), TEMPLATES: P('hf_templates.md'), EXAMPLES: P('hf_examples.md'), IDENTITY: HF.identity, TEMPLATE_NAME: p.template,
  });
  const out = await claude.run({ job, worker: W, prompt, tools: ['Read'], cwd: store.jobDir(job.id), workerModel: 'hf_writer' });
  const j = claude.extractJson(out);
  return { text: String(j.prompt || ''), notes: String(j.notes_es || '') };
}

async function attempt(job, item) {
  const dir = store.jobDir(job.id);
  const p = plan(job, item);
  for (const im of p.images) if (!im.file || !fs.existsSync(im.file)) throw new Error('Falta una imagen para el prompt: ' + im.file);
  const refImages = p.images.map((im, i) => (im.other ? i + 1 : 0)).filter(Boolean);
  // El prompt: lo escribe Claude y el código lo revisa (2 rondas como mucho)
  store.setWorker(job, W, { action: `Escribiendo el prompt del ${item.role} frame…` });
  let w = await writePrompt(job, item, p);
  let lint = lintNano(w.text, { kind: p.kind, nImages: p.images.length, refImages });
  if (lint.errors.length) {
    store.log(job, W, '✋ Prompt rechazado por la revisión: ' + lint.errors.join('; '));
    w = await writePrompt(job, item, p, lint.errors);
    lint = lintNano(w.text, { kind: p.kind, nImages: p.images.length, refImages });
  }
  if (lint.errors.length) {
    const e = new Error(`El prompt del ${item.role} frame no pasa la revisión: ${lint.errors.join('; ')}`);
    e.noRetry = true;
    throw e;
  }
  for (const f of lint.fixes) store.log(job, W, '🔧 ' + f);
  if (w.notes) store.log(job, W, '💬 ' + w.notes);
  const n = (item.tries.reduce((m, t) => Math.max(m, t.n), 0)) + 1;
  const rel = `keyframes/kf_${item.role}_${n}.png`;
  const t = { n, kind: p.kind, prompt: lint.prompt, images: p.images.map((im) => path.relative(store.ROOT, im.file).replace(/\\/g, '/')), note: item.note || '', at: Date.now() };
  fs.writeFileSync(path.join(dir, 'keyframes', `kf_${item.role}_${n}.prompt.txt`), `${t.images.map((f, i) => `Image ${i + 1}: ${f}`).join('\n')}\n\n${t.prompt}\n`);
  // Generar (retoma la espera si ya se había mandado y se cortó)
  store.setWorker(job, W, { action: `Generando el ${item.role} frame en Higgsfield (intento ${n})…` });
  const pend = item.pending && item.pending.n === n ? item.pending : null;
  await provider.get().generateImage({
    prompt: t.prompt, images: p.images.map((im) => im.file), out: path.join(dir, rel), debugDir: path.join(dir, 'debug'),
    log: (m) => store.log(job, W, m), progress: (m) => store.setWorker(job, W, { action: m }),
    resume: pend ? { before: pend.before } : null,
    onSubmitted: (before) => { item.pending = { n, before, at: Date.now() }; store.save(job); },
  });
  t.file = rel;
  item.tries.push(t);
  item.chosen = n;
  item.pending = null;
  item.status = 'generated';
  item.mode = null;
  item.note = '';
  store.log(job, W, `✅ ${item.role} frame, intento ${n} listo`);
  store.save(job);
}

async function run(job) {
  const kf = ensureState(job);
  for (const item of kf.items) {
    if (['generated', 'approved'].includes(item.status)) continue;
    await attempt(job, item);
    // Si se rehace el start de una narrativa, el end se rehace con el nuevo start
    if (item.role === 'start') { const end = kf.items.find((x) => x.role === 'end'); if (end && end.status !== 'pending' && end.tries.length) { end.status = 'regen'; end.mode = null; store.log(job, W, '↻ Rehago el end frame con el start nuevo'); } }
  }
  store.save(job);
  return 'ok';
}

module.exports = { run, ensureState, current };
