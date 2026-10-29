// 🎬 DIRECTOR: traduce, revisa, reparte el guion en clips y escribe los prompts
const fs = require('fs');
const path = require('path');
const store = require('../lib/store');
const claude = require('../lib/claude');
const config = require('../config.json');

const P = (f) => fs.readFileSync(path.join(store.ROOT, 'prompts', f), 'utf8');

function fill(text, vars) {
  return text.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
}

function brolls() {
  const d = path.join(store.ROOT, config.product.brollDir);
  if (!fs.existsSync(d)) return [];
  let info = {};
  try { info = JSON.parse(fs.readFileSync(path.join(d, 'brolls.json'), 'utf8')); } catch {}
  return fs.readdirSync(d).filter((f) => /\.(mp4|mov|png|jpe?g|webp)$/i.test(f))
    .map((f) => info[f] ? `${f} (${info[f].duration} s: ${info[f].description} Best parts: ${info[f].best.map((b) => `${b.from}-${b.to} s ${b.what}`).join('; ')})` : f);
}

function typeRules(job) {
  if (job.videoType !== 'venta') {
    return `- Goal: maximum views, shares and comments. Do NOT mention or show any book or product.
- Hook: the strongest curiosity or shock line in the first 2 seconds. Fast pacing, short lines.
- Ending: ask to comment the CTA word to receive the full recipe (CTA word RECETA or SÍ) and to follow for more. book and broll are always null.`;
  }
  const b = brolls();
  return `- Goal: sell the book "${config.product.name}". The recipe part stays, then the last clips sell the book.
- The producer APPROVED this pitch, so do not soften it (only shorten it if time is very tight, keeping every fact): "${config.product.pitch}"
  Usually split it into 2 or 3 clips at the end, then the CTA with the word LIBRO ("Comenta LIBRO y te lo mando personalmente").
- The book must appear: in the pitch clips she holds it ("book": "hand"). In some videos (vary it: about half of them) also show it lying on the table in 1 or 2 earlier clips ("book": "table").
- Ready-made frames of her holding the real book: ${(config.product.bookInHand || []).map((f) => path.basename(f)).join(', ')}. For 1 pitch clip you may set "frameFrom": "<one of those file names>" to use it as the start frame as is (fast and the cover is perfect); vary which one.
- B-roll files available in ${path.join(store.ROOT, config.product.brollDir)}: ${b.length ? b.join(' | ') : '(none yet)'}. Use 1 to 3 cutaways during the pitch ("broll"), 1.5 to 3 seconds each, never covering the CTA words. Set "from" to the second of the b-roll file where the cutaway should start (pick from its best parts).`;
}

async function run(job) {
  const dir = store.jobDir(job.id);
  const setting = config.settings[job.setting] || job.setting;
  const lang = config.languages[job.language || config.language];
  const vars = {
    JOB_DIR: dir,
    SHEETS: (job.sheets || []).map((s) => path.join(dir, 'ref', s)).join(', '),
    AVATAR_IMAGES: config.avatar.images.map((i) => path.join(store.ROOT, i)).join(', '),
    SETTING: setting,
    CTA_WORD: job.ctaWord,
    SCRIPT: job.script,
    CLIP_SECONDS: config.clipSeconds,
    MAX_WORDS: config.maxWordsPerClip,
    ANCHORS: config.avatar.anchors,
    VOICE: config.avatar.voice,
    LANG_NAME: lang.name,
    AUDIENCE: lang.audience,
    SPEECH: lang.speech,
    CTA_EXAMPLES: lang.ctaExamples,
    CTA_WORDS: config.ctaWords.join(', '),
    VIDEO_TYPE: job.videoType === 'venta' ? 'VENTA (sell the book)' : 'CRECIMIENTO (maximum virality, no selling)',
    TYPE_RULES: typeRules(job),
    MAX_CLIPS: config.maxClips[job.videoType] || 7,
  };
  vars.NANO_RULES = fill(P('nano_rules.md'), vars);
  vars.OMNI_RULES = fill(P('omni_rules.md'), vars);
  const prompt = fill(P('director.md'), vars);

  store.log(job, 'director', 'Leyendo la referencia y escribiendo el plan…');
  const text = await claude.run({ job, worker: 'director', prompt, tools: ['Read', 'Write'] });
  const planFile = path.join(dir, 'plan.json');
  const plan = fs.existsSync(planFile) ? JSON.parse(fs.readFileSync(planFile, 'utf8')) : claude.extractJson(text);

  const j = store.load(job.id);
  j.plan = { hook: plan.hook, ctaWord: plan.ctaWord || job.ctaWord };
  j.notes = plan.notes || [];
  j.clips = plan.clips.map((c, i) => ({
    n: i + 1, line: c.line, refTime: c.refTime, frameMode: i === 0 ? 1 : 2,
    framePrompt: c.framePrompt, clipPrompt: c.clipPrompt, book: job.videoType === 'venta' ? (c.book || null) : null, broll: c.broll || null, frameFrom: job.videoType === 'venta' ? (c.frameFrom || null) : null,
    frame: null, frameStatus: 'pending', frameNote: '', feedback: '',
    clip: null, clipStatus: 'pending', clipNote: '',
  }));
  store.save(j);
  store.log(j, 'director', `✅ Plan listo: ${j.clips.length} clips. Hook: "${j.plan.hook}"`);
  for (const n of j.notes) store.log(j, 'director', '📝 ' + n);
  return j;
}

module.exports = { run, fill };
