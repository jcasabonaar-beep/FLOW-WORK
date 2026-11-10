// 💬 ASISTENTE (chat de cambios) y 🧠 ANALISTA de marketing (por qué es viral + variaciones)
const fs = require('fs');
const path = require('path');
const store = require('../lib/store');
const claude = require('../lib/claude');
const { fill } = require('./director');
const config = require('../config.json');

const P = (f) => fs.readFileSync(path.join(store.ROOT, 'prompts', f), 'utf8');

function ensureWorker(job, w) {
  if (!job.workers[w]) job.workers[w] = { state: 'idle', action: '', log: [], paused: false };
}

// El productor escribe qué cambiar; devuelve la respuesta y aplica las acciones
async function chat(job, message) {
  ensureWorker(job, 'chat');
  job.chat = job.chat || [];
  job.chat.push({ role: 'user', text: message, t: Date.now() });
  store.save(job);
  const out = path.join(store.jobDir(job.id), 'chat_reply.json');
  if (fs.existsSync(out)) fs.unlinkSync(out);
  const prompt = fill(P('chat.md'), {
    TITLE: job.title, TYPE: job.videoType, SETTING: job.setting, HOOK: (job.plan && job.plan.hook) || '-', CTA: (job.plan && job.plan.ctaWord) || job.ctaWord,
    CLIPS: job.clips.map((c) => `${c.n} · "${c.line}" · frame ${c.frameStatus} / clip ${c.clipStatus}${c.skip ? ' (quitado)' : ''}`).join('\n'),
    HISTORY: job.chat.slice(-8, -1).map((m) => `${m.role === 'user' ? 'Producer' : 'You'}: ${m.text}`).join('\n') || '(none)',
    MESSAGE: message, OUT: out,
  });
  const text = await claude.run({ job, worker: 'chat', prompt, tools: ['Write'] });
  const res = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : claude.extractJson(text);
  const acts = res.actions || [];
  let stage = null;
  const want = (s) => { const order = ['director', 'frames', 'clips', 'editor']; if (!stage || order.indexOf(s) < order.indexOf(stage)) stage = s; };
  for (const a of acts) {
    const c = job.clips.find((x) => x.n === a.n);
    if (a.type === 'frame' && c) { Object.assign(c, { feedback: a.feedback, frameStatus: 'regen', clipStatus: 'regen', clipRetried: false }); want('frames'); }
    if (a.type === 'clip' && c) { Object.assign(c, { clipStatus: 'regen', clipNote: a.note || '', clipRetried: false }); want('clips'); }
    if (a.type === 'line' && c) { Object.assign(c, { line: a.text, clipStatus: 'regen', clipRetried: false }); want('clips'); }
    if (a.type === 'hook') { job.plan = { ...(job.plan || {}), hook: a.text }; want('editor'); }
    if (a.type === 'cta') { job.plan = { ...(job.plan || {}), ctaWord: a.word }; want('editor'); }
    if (a.type === 'reedit') want('editor');
    if (a.type === 'replan') want('director');
  }
  job.chat.push({ role: 'assistant', text: res.reply || 'Hecho.', t: Date.now() });
  store.save(job);
  return { reply: res.reply, stage };
}

// Por qué funciona un video y 6 variaciones con la misma fórmula
async function analyze(job, worker, src) {
  ensureWorker(job, worker);
  const out = path.join(store.jobDir(job.id), `analysis_${Date.now()}.json`);
  const prompt = fill(P('analyst.md'), { TITLE: src.title || '-', URL: src.url || '-', STATS: src.stats || '-', TEXT: (src.text || '').slice(0, 6000), OUT: out });
  store.log(job, worker, '🧠 Analizando por qué funciona y buscando variaciones…');
  const text = await claude.run({ job, worker, prompt, tools: ['Write'] });
  const res = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : claude.extractJson(text);
  store.log(job, worker, `✅ ${res.variaciones ? res.variaciones.length : 0} variaciones listas`);
  return res;
}

module.exports = { chat, analyze };
