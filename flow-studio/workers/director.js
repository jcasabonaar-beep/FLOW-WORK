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
    PRODUCT_NAME: config.product.name,
    PRODUCT_PITCH: config.product.pitch,
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
    framePrompt: c.framePrompt, clipPrompt: c.clipPrompt,
    frame: null, frameStatus: 'pending', frameNote: '', feedback: '',
    clip: null, clipStatus: 'pending', clipNote: '',
  }));
  store.save(j);
  store.log(j, 'director', `✅ Plan listo: ${j.clips.length} clips. Hook: "${j.plan.hook}"`);
  for (const n of j.notes) store.log(j, 'director', '📝 ' + n);
  return j;
}

module.exports = { run, fill };
