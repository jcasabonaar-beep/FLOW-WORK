// 🧠 HIGGSFIELD · ANÁLISIS: Claude (visión) mira la referencia y devuelve el plan en JSON.
// Tus correcciones mandan sobre el análisis: si las hay, rehace el plan aplicándolas.
const fs = require('fs');
const path = require('path');
const store = require('../lib/store');
const claude = require('../lib/claude');
const config = require('../config.json');
const { extractKeyframeRefs } = require('./hf_capture');

const W = 'hf_analyst';
const HF = config.higgsfield;
const P = (f) => fs.readFileSync(path.join(store.ROOT, 'prompts', f), 'utf8');
const fill = (t, v) => t.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in v ? v[k] : m));
const num = (x, d = 0) => (Number.isFinite(+x) ? +x : d);
const r1 = (x) => Math.round(x * 10) / 10;

// Comprueba y arregla el JSON del análisis. Devuelve { analysis, warnings }
function normalize(a, refDuration) {
  if (!a || typeof a !== 'object') throw new Error('El análisis no es un objeto JSON');
  const warnings = [];
  const out = { ...a };
  out.format = ['loop', 'narrative', 'talking'].includes(a.format) ? a.format : 'narrative';
  if (out.format !== a.format) warnings.push(`Formato "${a.format}" desconocido: uso "narrative"`);
  let ts = Math.round(num(a.target_seconds, 10));
  const clamped = Math.max(HF.minSeconds || 4, Math.min(HF.maxSeconds || 15, ts));
  if (clamped !== ts) warnings.push(`Duración ${ts} s fuera de rango: la dejo en ${clamped} s`);
  out.target_seconds = ts = clamped;
  out.actions = (Array.isArray(a.actions) ? a.actions : []).map((x) => ({ from: r1(num(x.from)), to: r1(num(x.to)), en: String(x.en || ''), es: String(x.es || x.en || '') }))
    .filter((x) => x.en).sort((p, q) => p.from - q.from);
  if (!out.actions.length) warnings.push('El análisis no trae acciones');
  for (const x of out.actions) {
    if (x.to > ts) { x.to = ts; }
    if (x.to - x.from > 3.01) warnings.push(`El tramo ${x.from}-${x.to}s dura más de 3 s: mejor partirlo`);
  }
  const last = out.actions[out.actions.length - 1];
  if (last && Math.abs(last.to - ts) > 0.3) warnings.push(`Las acciones acaban en ${last.to}s pero el vídeo dura ${ts}s`);
  const ot = a.onscreen_text || {};
  out.onscreen_text = { hook: String(ot.hook || ''), hook_diane: String(ot.hook_diane || ''), counters: Array.isArray(ot.counters) ? ot.counters : [], other: Array.isArray(ot.other) ? ot.other : [] };
  // La edad de Diane siempre es 63
  out.onscreen_text.hook_diane = out.onscreen_text.hook_diane.replace(/\b(I'?m|I am|at|age)\s+(\d{2})\b/gi, (m, w, n) => (n === '63' ? m : `${w} 63`));
  out.overlays = Array.isArray(a.overlays) ? a.overlays : [];
  out.camera = a.camera && typeof a.camera === 'object' ? a.camera : {};
  if (!['tripod', 'handheld'].includes(out.camera.support)) out.camera.support = 'tripod';
  const kf = a.keyframes || {};
  const strategy = out.format === 'loop' ? 'loop' : kf.strategy === 'loop' ? 'loop' : 'narrative';
  if (kf.strategy && kf.strategy !== strategy) warnings.push(`Estrategia de keyframes "${kf.strategy}" no cuadra con el formato: uso "${strategy}"`);
  const items = (Array.isArray(kf.items) ? kf.items : []).filter((k) => ['start', 'end'].includes(k.role));
  const dur = refDuration || 9999;
  const maxT = Math.max(0, Math.floor((dur - 0.1) * 10) / 10); // el último frame que seguro existe
  const fix = (k) => ({ role: k.role, ref_time: Math.min(maxT, Math.max(0, r1(num(k.ref_time)))), pose_en: String(k.pose_en || ''), why_es: String(k.why_es || '') });
  const start = items.find((k) => k.role === 'start') || { role: 'start', ref_time: 0 };
  const end = items.find((k) => k.role === 'end');
  out.keyframes = { strategy, why_es: String(kf.why_es || ''), items: [fix(start)] };
  if (strategy === 'narrative') {
    if (end) out.keyframes.items.push(fix(end));
    else warnings.push('Narrativa sin end frame: falta elegir el frame final de la referencia');
  }
  out.risks_es = Array.isArray(a.risks_es) ? a.risks_es : [];
  out.questions_es = Array.isArray(a.questions_es) ? a.questions_es : [];
  for (const k of ['outfit', 'setting', 'hairstyle', 'light', 'summary_es']) out[k] = String(a[k] || '');
  return { analysis: out, warnings };
}

function overridesText(o) {
  const l = [];
  if (o.outfit) l.push(`- Outfit: ${o.outfit}`);
  if (o.place) l.push(`- Place: ${o.place}`);
  if (o.notes) l.push(`- Choreography / notes: ${o.notes}`);
  return l.join('\n') || '(none: take outfit, setting, pose and camera from the reference)';
}

async function run(job) {
  const dir = store.jobDir(job.id);
  const hf = job.hf;
  const abs = (p) => path.join(dir, p);
  const out = abs('analysis.raw.json');
  fs.rmSync(out, { force: true });
  const corrections = hf.corrections || [];
  const prompt = fill(P('hf_analysis.md'), {
    ACCOUNT: HF.account, AVATAR_NAME: HF.avatar.name,
    SHEETS: (hf.sheets || []).map(abs).join(', '),
    FRAMES: (hf.frames || []).map((f) => `  - ${f.t}s: ${abs(f.file)}`).join('\n'),
    SCENES: (hf.scenes || []).map((s) => `${s.t}s`).join(', ') || '(none: a single shot)',
    DURATION: hf.refDuration,
    DESCRIPTION: hf.description ? '\n"""\n' + hf.description.slice(0, 3000) + '\n"""' : '(not available)',
    TRANSCRIPT: hf.transcript ? `"${hf.transcript.slice(0, 2000)}"` : '(none)',
    AVATAR_MAIN: path.join(store.ROOT, HF.avatar.main), AVATAR_BODY: path.join(store.ROOT, HF.avatar.body),
    RULES: P('hf_rules.md'),
    OVERRIDES: overridesText(hf.overrides || {}),
    CORRECTIONS: corrections.length ? corrections.map((c, i) => `${i + 1}. ${c.text}`).join('\n') : '(none yet)',
    PREVIOUS: hf.analysis && corrections.length ? `## Your previous analysis (keep what the corrections do not change)\n\`\`\`json\n${JSON.stringify(hf.analysis, null, 2)}\n\`\`\`` : '',
    MIN_S: HF.minSeconds || 4, MAX_S: HF.maxSeconds || 15, OUT_FILE: out,
  });
  store.setWorker(job, W, { action: corrections.length && hf.analysis ? 'Aplicando tus correcciones al análisis…' : 'Mirando la referencia…' });
  const text = await claude.run({ job, worker: W, prompt, tools: ['Read', 'Write'], cwd: dir });
  let raw;
  try { raw = JSON.parse(fs.readFileSync(out, 'utf8')); } catch { raw = claude.extractJson(text); }
  const { analysis, warnings } = normalize(raw, hf.refDuration);
  save(job, analysis, warnings, 'claude');
  await extractKeyframeRefs(job);
  store.log(job, W, `✅ Análisis v${hf.analysisV}: ${analysis.format}, ${analysis.target_seconds} s, ${analysis.actions.length} tramos, keyframes ${analysis.keyframes.strategy}`);
  for (const w of warnings) store.log(job, W, '⚠️ ' + w);
  for (const q of analysis.questions_es) store.log(job, W, '❓ ' + q);
  return 'ok';
}

// Guarda una versión nueva (de Claude o editada por ti) y deja copia de la anterior
function save(job, analysis, warnings, by) {
  const dir = store.jobDir(job.id);
  const hf = job.hf;
  hf.analysisV = (hf.analysisV || 0) + 1;
  hf.analysis = analysis;
  hf.warnings = warnings;
  hf.analysisBy = by;
  fs.writeFileSync(path.join(dir, 'analysis.json'), JSON.stringify(analysis, null, 2));
  fs.writeFileSync(path.join(dir, `analysis_v${hf.analysisV}.json`), JSON.stringify({ by, at: Date.now(), analysis }, null, 2));
  store.save(job);
}

module.exports = { run, normalize, save };
