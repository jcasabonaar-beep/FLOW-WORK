// 🎥 HIGGSFIELD · VÍDEO: Claude escribe el prompt de Seedance (plantillas A4/A5), el código lo revisa,
// Seedance (Unlimited) lo genera con start + end frame, se arregla el bucle si hace falta y el QA lo revisa tramo a tramo.
// Hasta 2 regeneraciones automáticas con correcciones; después, te espera.
const fs = require('fs');
const path = require('path');
const store = require('../lib/store');
const claude = require('../lib/claude');
const config = require('../config.json');
const { ffmpeg, duration } = require('../lib/ff');
const { lintSeedance } = require('../lib/hf/prompts');
const provider = require('../lib/hf/provider');
const { withHeal, ensureMap } = require('../lib/hf/heal');
const { metric } = require('../lib/hf/py');
const { loadMap } = require('../lib/hf/selectors');
const kfw = require('./hf_keyframes');

const W = 'hf_video';
const HF = config.higgsfield;
const P = (f) => fs.readFileSync(path.join(store.ROOT, 'prompts', f), 'utf8');
const fill = (t, v) => t.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in v ? v[k] : m));
const tname = (t) => t.toFixed(1).padStart(4, '0');

function frames(job) {
  const dir = store.jobDir(job.id);
  const items = job.hf.kf.items;
  const s = kfw.current(items.find((x) => x.role === 'start'));
  const loop = job.hf.analysis.keyframes.strategy === 'loop';
  const e = loop ? s : kfw.current(items.find((x) => x.role === 'end'));
  if (!s || !e) throw new Error('Faltan los keyframes aprobados');
  return { loop, start: path.join(dir, s.file), end: path.join(dir, e.file) };
}

async function writePrompt(job, v, fr, seconds, lintErrors) {
  const hist = v.tries.map((t) => `- Attempt ${t.n}: ${t.verdict || (t.qa ? (t.qa.pass ? 'QA ok' : 'QA: ' + (t.qa.fix_en || '')) : 'not reviewed')}${t.qa && t.qa.worked_en ? ` · came out well: ${t.qa.worked_en}` : ''}\n  Prompt: ${t.prompt}`).join('\n') || '(none)';
  const prompt = fill(P('hf_video_writer.md'), {
    VIDEO_MODEL: HF.videoModel, AVATAR_NAME: HF.avatar.name, ACCOUNT: HF.account, SECONDS: seconds,
    KIND: fr.loop ? 'loop' : 'narrative', KIND_DESC: fr.loop ? 'the same image is start and end frame: it must loop seamlessly' : 'start and end frames are different: one continuous real-time take from one to the other',
    TEMPLATE_NAME: fr.loop ? 'A4' : 'A5', START: fr.start, END: fr.end,
    ANALYSIS: JSON.stringify({ ...job.hf.analysis, overrides: job.hf.overrides, corrections: job.hf.corrections.map((c) => c.text) }, null, 2),
    NOTE: (v.note || '(none)') + (lintErrors ? `\n\nYOUR PREVIOUS PROMPT WAS REJECTED BY THE CHECKER: ${lintErrors.join('; ')}. Fix it.` : ''),
    HISTORY: hist, RULES: P('hf_rules.md'), TEMPLATES: P('hf_templates.md'), EXAMPLES: P('hf_examples.md'),
  });
  const out = await claude.run({ job, worker: W, prompt, tools: ['Read'], cwd: store.jobDir(job.id), workerModel: 'hf_writer' });
  const j = claude.extractJson(out);
  return { text: String(j.prompt || ''), notes: String(j.notes_es || '') };
}

async function attempt(job, v, fr, seconds) {
  const dir = store.jobDir(job.id);
  store.setWorker(job, W, { action: 'Comprobando la pantalla de vídeo de Higgsfield…' });
  await withHeal(job, W, 'Comprobación', () => provider.get().preflightImage({ debugDir: path.join(dir, 'debug'), kind: 'video' }));
  const sig = JSON.stringify([fr.start, fr.end, seconds, v.note || '']);
  let lint;
  if (v.draft && v.draft.sig === sig) {
    lint = lintSeedance(v.draft.prompt, { seconds });
    store.log(job, W, '♻️ Reutilizo el prompt que ya estaba escrito');
  } else {
    store.setWorker(job, W, { action: 'Escribiendo el prompt de Seedance…' });
    let w = await writePrompt(job, v, fr, seconds);
    lint = lintSeedance(w.text, { seconds });
    if (lint.errors.length) {
      store.log(job, W, '✋ Prompt rechazado por la revisión: ' + lint.errors.join('; '));
      w = await writePrompt(job, v, fr, seconds, lint.errors);
      lint = lintSeedance(w.text, { seconds });
    }
    if (lint.errors.length) { const e = new Error('El prompt de Seedance no pasa la revisión: ' + lint.errors.join('; ')); e.noRetry = true; throw e; }
    for (const f of lint.fixes) store.log(job, W, '🔧 ' + f);
    if (w.notes) store.log(job, W, '💬 ' + w.notes);
    v.draft = { sig, prompt: lint.prompt, at: Date.now() };
    store.save(job);
  }
  const n = v.tries.reduce((m, t) => Math.max(m, t.n), 0) + 1;
  const raw = `video/raw_${n}.mp4`;
  fs.writeFileSync(path.join(dir, 'video', `prompt_${n}.txt`), `Start frame: ${fr.start}\nEnd frame: ${fr.end}\nDuración: ${seconds} s\n\n${lint.prompt}\n`);
  store.setWorker(job, W, { action: `Generando el vídeo en Seedance (intento ${n})… la cola de Unlimited puede tardar` });
  await withHeal(job, W, 'Generación', () => provider.get().generateVideo({
    prompt: lint.prompt, start: fr.start, end: fr.end, seconds, out: path.join(dir, raw), debugDir: path.join(dir, 'debug'),
    log: (m) => store.log(job, W, m), progress: (m) => store.setWorker(job, W, { action: m }),
    resume: v.pending && v.pending.n === n ? { before: v.pending.before } : null,
    onSubmitted: (before) => { v.pending = { n, before, at: Date.now() }; store.save(job); },
  }));
  const t = { n, prompt: lint.prompt, beats: lint.beats, seconds, raw, note: v.note || '', at: Date.now() };
  v.pending = null;
  v.draft = null;
  // Bucles: métrica y arreglo automático; el último frame (duplicado del primero) fuera
  t.file = raw;
  if (fr.loop) t.file = await fixLoop(job, t);
  v.tries.push(t);
  v.chosen = n;
  store.save(job);
  return t;
}

async function fixLoop(job, t) {
  const dir = store.jobDir(job.id);
  const limit = HF.loopRatio || 2;
  let file = t.raw;
  try {
    let m = await metric('loop', path.join(dir, file));
    t.loop = { before: m };
    store.log(job, W, `🔁 Métrica de bucle: último↔primero ${m.last_first} frente a ${m.median_consecutive_3s} entre frames (×${m.ratio})`);
    if (m.ratio > limit) {
      const fixed = `video/loopfix_${t.n}.mp4`;
      await metric('loopfix', path.join(dir, file), path.join(dir, fixed));
      const m2 = await metric('loop', path.join(dir, fixed));
      t.loop.after = m2;
      store.log(job, W, `🔁 Arreglo del bucle (corte en 1,0 s + fundido de 0,2 s): ×${m.ratio} → ×${m2.ratio}`);
      if (m2.ratio < m.ratio) { file = fixed; m = m2; }
    }
    if (m.last_is_duplicate) {
      const clean = `video/loop_${t.n}.mp4`;
      await metric('droplast', path.join(dir, file), path.join(dir, clean));
      file = clean;
      store.log(job, W, '🔁 Quitado el último frame (era un duplicado del primero)');
    }
  } catch (e) {
    store.log(job, W, '⚠️ Sin métrica de bucle: ' + e.message.split('\n').pop().slice(0, 120));
  }
  return file;
}

// Frames cada 0,4 s y hojas de contactos del vídeo generado (para el QA)
async function qaFrames(job, t) {
  const dir = store.jobDir(job.id);
  const sub = path.join(dir, 'video', `qa_${t.n}`);
  fs.rmSync(sub, { recursive: true, force: true });
  fs.mkdirSync(path.join(sub, 'tiles'), { recursive: true });
  fs.copyFileSync(path.join(store.ROOT, 'fonts', 'Montserrat-ExtraBold.ttf'), path.join(sub, 'font.ttf'));
  await ffmpeg(['-i', path.join(dir, t.file), '-vf', 'fps=2.5,scale=540:-2', '-q:v', '3', path.join(sub, 'raw_%04d.jpg')]);
  const list = fs.readdirSync(sub).filter((f) => /^raw_\d+\.jpg$/.test(f)).sort();
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const sec = i * 0.4;
    const dest = `f_${tname(sec)}.jpg`;
    fs.renameSync(path.join(sub, list[i]), path.join(sub, dest));
    out.push({ t: +sec.toFixed(1), file: path.join(sub, dest) });
    await ffmpeg(['-i', dest, '-vf', `scale=200:-2,drawtext=fontfile=font.ttf:text='${sec.toFixed(1)}s':x=5:y=5:fontsize=22:fontcolor=yellow:box=1:boxcolor=black@0.6`, '-q:v', '4', path.join('tiles', `${String(i + 1).padStart(4, '0')}.jpg`)], { cwd: sub });
  }
  await ffmpeg(['-framerate', '1', '-i', path.join('tiles', '%04d.jpg'), '-vf', 'tile=6x4:padding=4:color=black', '-q:v', '4', 'sheet_%02d.jpg'], { cwd: sub });
  fs.rmSync(path.join(sub, 'tiles'), { recursive: true, force: true });
  const sheets = fs.readdirSync(sub).filter((f) => /^sheet_\d+\.jpg$/.test(f)).sort().map((f) => path.join(sub, f));
  t.qaSheets = sheets.map((f) => path.relative(dir, f).replace(/\\/g, '/'));
  return { frames: out, sheets };
}

async function qa(job, t, fr) {
  const dir = store.jobDir(job.id);
  store.setWorker(job, W, { action: `🔎 Revisando el vídeo tramo a tramo (intento ${t.n})…` });
  const { frames: fl, sheets } = await qaFrames(job, t);
  const dur = await duration(path.join(dir, t.file));
  const lp = t.loop ? `Loop metric (grayscale 180x320): last↔first ${t.loop.before.last_first} vs median between consecutive frames ${t.loop.before.median_consecutive_3s} (×${t.loop.before.ratio})${t.loop.after ? `; after the automatic fix ×${t.loop.after.ratio}` : ''}.` : '';
  const prompt = fill(P('hf_video_qa.md'), {
    AVATAR_NAME: HF.avatar.name, SHEETS: sheets.join(', '), FRAMES: fl.map((f) => `  - ${f.t}s: ${f.file}`).join('\n'),
    START: fr.start, END: fr.end, DURATION: dur.toFixed(1), KIND: fr.loop ? 'loop' : 'narrative', LOOP: lp, PROMPT: t.prompt,
    BEATS: (t.beats || []).map(([a, b]) => `- ${a}-${b}s`).join('\n') || '(see the prompt)',
  });
  const out = await claude.run({ job, worker: W, prompt, tools: ['Read'], cwd: dir, workerModel: 'hf_qa' });
  const r = claude.extractJson(out);
  t.qa = { pass: !!r.pass, beats: r.beats || [], deformations_es: r.deformations_es || [], fix_en: r.fix_en || '', worked_en: r.worked_en || '', at: Date.now() };
  const bad = t.qa.beats.filter((b) => !b.ok);
  store.log(job, W, t.qa.pass ? `🔎 QA del vídeo ${t.n}: ✅ todos los tramos bien` : `🔎 QA del vídeo ${t.n}: ❌ ${[...bad.map((b) => `${b.from}-${b.to}s: ${b.problem_es}`), ...t.qa.deformations_es].join(' · ').slice(0, 400)}`);
  store.save(job);
  return t.qa;
}

async function run(job) {
  await ensureMap(job, W, 'video');
  const v = job.hf.video || (job.hf.video = { tries: [], status: 'pending', note: '' });
  if (['generated', 'approved'].includes(v.status)) return 'ok';
  const fr = frames(job);
  const seconds = provider.get().pickSeconds(loadMap().video || {}, job.hf.analysis.target_seconds);
  if (seconds !== job.hf.analysis.target_seconds) store.log(job, W, `⏱ Seedance ofrece ${seconds} s (el plan pedía ${job.hf.analysis.target_seconds} s): uso ${seconds} s`);
  const max = 1 + (HF.videoRegens ?? 2);
  for (let k = 1; ; k++) {
    const t = await attempt(job, v, fr, seconds);
    const r = await qa(job, t, fr);
    if (r.pass) break;
    if (k >= max) { store.log(job, W, `✋ El vídeo no pasa el QA tras ${max - 1} regeneraciones: te lo dejo con el informe`); v.qaFailed = true; break; }
    t.verdict = 'QA: ' + (r.fix_en || 'falló');
    v.note = `[QA] ${r.fix_en}${r.worked_en ? ` Keep what worked: ${r.worked_en}` : ''}`;
    store.log(job, W, `↻ Regenero (${k}/${max - 1}) corrigiendo: ${r.fix_en.slice(0, 200)}`);
    store.save(job);
  }
  v.status = 'generated';
  v.note = '';
  const gate = require('../lib/hf/pipeline').gates(job).video;
  const cur = v.tries.find((t) => t.n === v.chosen);
  if (!gate && cur.qa && cur.qa.pass) v.status = 'approved';
  if (!gate && !(cur.qa && cur.qa.pass)) {
    store.save(job);
    store.setWorker(job, W, { state: 'waiting_you', action: 'El vídeo no pasa el QA: revísalo (Aprobar / Regenerar con nota)' });
    job.stage = 'review_video';
    return 'wait';
  }
  store.save(job);
  return 'ok';
}

module.exports = { run };
