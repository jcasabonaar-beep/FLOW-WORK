// ✂️ EDITOR: une los clips, recorta silencios, normaliza la voz y pone hook, subtítulos y CTA
const fs = require('fs');
const path = require('path');
const store = require('../lib/store');
const config = require('../config.json');
const { exec, ffmpeg, speechBounds, hasAudio } = require('../lib/ff');

const C = config.captions;

function assTime(t) {
  t = Math.max(0, t);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}
const esc = (s) => s.replace(/[{}]/g, '').replace(/\n/g, ' ');

// Reparte las palabras de cada clip entre el inicio y el final de su voz
function estimateWords(segments) {
  const words = [];
  for (const seg of segments) {
    const ws = seg.line.split(/\s+/).filter(Boolean);
    const weights = ws.map((w) => w.replace(/[^\w']/g, '').length + 2.2 + (/[.,!?;:]$/.test(w) ? 2 : 0));
    const total = weights.reduce((a, b) => a + b, 0);
    const span = Math.max(0.5, seg.speechEnd - seg.speechStart);
    let acc = seg.speechStart;
    ws.forEach((w, i) => {
      const d = (weights[i] / total) * span;
      words.push({ w, s: acc, e: acc + d, clip: seg.n });
      acc += d;
    });
  }
  return words;
}

// Si está instalado faster-whisper, usa los tiempos reales de cada palabra
async function whisperWords(job, audio, segments, est) {
  try {
    const out = path.join(store.jobDir(job.id), 'edit', 'words.json');
    await exec('python', [path.join(store.ROOT, 'tools', 'transcribe.py'), audio, out]);
    const real = JSON.parse(fs.readFileSync(out, 'utf8'));
    const res = [];
    for (const seg of segments) {
      const mine = est.filter((w) => w.clip === seg.n);
      const heard = real.filter((w) => w.s >= seg.start - 0.05 && w.s < seg.start + seg.len);
      if (!heard.length || Math.abs(heard.length - mine.length) > Math.max(2, mine.length * 0.2)) { res.push(...mine); continue; }
      mine.forEach((w, i) => {
        const h = heard[Math.min(heard.length - 1, Math.round(i * (heard.length - 1) / Math.max(1, mine.length - 1)))];
        res.push({ ...w, s: h.s, e: h.e });
      });
    }
    for (let i = 0; i < res.length - 1; i++) if (res[i].e > res[i + 1].s) res[i].e = res[i + 1].s;
    store.log(job, 'editor', '🎧 Subtítulos sincronizados con la voz real (whisper)');
    return res;
  } catch {
    store.log(job, 'editor', 'Subtítulos por estimación (instala faster-whisper para sincronía exacta)');
    return est;
  }
}

function hookText(hook) {
  return esc(hook).replace(/\*([^*]+)\*/g, `{\\fn${C.accentFont}\\i1\\fs${Math.round(C.size * 1.45)}}$1{\\fn${C.font}\\i0\\fs${Math.round(C.size * 1.05)}}`);
}

function buildAss(job, words, total) {
  const y = Math.round(1920 * C.yPercent / 100);
  const lines = [
    '[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 1080', 'PlayResY: 1920', 'WrapStyle: 0', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Cap,${C.font},${C.size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2.5,3,5,80,80,0,1`,
    `Style: Hook,${C.font},${Math.round(C.size * 1.05)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2.5,4,5,70,70,0,1`,
    `Style: Cta,${C.font},${Math.round(C.size * 0.8)},&H00111111,&H00111111,&H0033D7FF,&H0033D7FF,0,0,0,0,100,100,0,0,3,18,0,8,80,80,260,1`,
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const hookEnd = job.plan && job.plan.hook ? C.hookSeconds : 0;
  if (hookEnd) lines.push(`Dialogue: 1,${assTime(0)},${assTime(hookEnd)},Hook,,0,0,0,,{\\pos(540,${Math.round(1920 * 0.47)})\\fad(80,120)}${hookText(job.plan.hook)}`);

  // Subtítulos palabra por palabra, en grupos de N palabras
  const visible = words.filter((w) => w.e > hookEnd);
  for (let i = 0; i < visible.length; i += C.wordsPerChunk) {
    const chunk = visible.slice(i, i + C.wordsPerChunk);
    chunk.forEach((w, k) => {
      const start = Math.max(w.s, hookEnd);
      const end = k < chunk.length - 1 ? chunk[k + 1].s : (visible[i + C.wordsPerChunk] ? visible[i + C.wordsPerChunk].s : w.e + 0.35);
      if (end <= start) return;
      const txt = chunk.slice(0, k + 1).map((x) => esc(x.w)).join(' ');
      const pop = k === 0 ? '\\fscx88\\fscy88\\t(0,90,\\fscx100\\fscy100)' : '';
      lines.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Cap,,0,0,0,,{\\pos(540,${y})${pop}}${txt}`);
    });
  }
  const word = (job.plan && job.plan.ctaWord) || job.ctaWord;
  lines.push(`Dialogue: 2,${assTime(Math.max(0, total - 3.6))},${assTime(total)},Cta,,0,0,0,,{\\fad(150,0)}${esc(config.cta.replace('{{WORD}}', word.toUpperCase()))}`);
  return lines.join('\n') + '\n';
}

async function run(job) {
  const dir = store.jobDir(job.id);
  const edit = path.join(dir, 'edit');
  fs.mkdirSync(path.join(edit, 'fonts'), { recursive: true });
  for (const f of fs.readdirSync(path.join(store.ROOT, 'fonts'))) fs.copyFileSync(path.join(store.ROOT, 'fonts', f), path.join(edit, 'fonts', f));

  // 1) Medir la voz de cada clip
  const segments = [];
  let t = 0;
  for (const c of job.clips) {
    const file = path.join(dir, c.clip);
    const [s, e, dur] = await speechBounds(file);
    const start = Math.max(0, s - 0.12);
    const end = Math.min(dur, e + 0.22);
    const len = Math.max(0.8, end - start);
    segments.push({ n: c.n, file, line: c.line, start: t, len, cut: [start, end], speechStart: t + (s - start), speechEnd: t + (e - start), audio: await hasAudio(file) });
    store.log(job, 'editor', `Clip ${c.n}: voz ${s.toFixed(2)}–${e.toFixed(2)} s de ${dur.toFixed(1)} s`);
    t += len;
  }
  const total = t;

  // 2) Unir: recorte, 1080x1920, 30 fps
  const args = [];
  const parts = [];
  segments.forEach((sg, i) => {
    args.push('-i', sg.file);
    const [a, b] = sg.cut;
    parts.push(`[${i}:v]trim=${a.toFixed(3)}:${b.toFixed(3)},setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1[v${i}]`);
    parts.push(sg.audio
      ? `[${i}:a]atrim=${a.toFixed(3)}:${b.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:d=0.03,afade=t=out:st=${Math.max(0, b - a - 0.05).toFixed(3)}:d=0.05[a${i}]`
      : `anullsrc=r=48000:cl=stereo,atrim=0:${(b - a).toFixed(3)}[a${i}]`);
  });
  const joined = segments.map((_, i) => `[v${i}][a${i}]`).join('');
  parts.push(`${joined}concat=n=${segments.length}:v=1:a=1[vc][ac]`);
  parts.push('[ac]highpass=f=80,acompressor=threshold=-18dB:ratio=3:attack=5:release=120,loudnorm=I=-14:TP=-1.5:LRA=9[aout]');
  store.setWorker(job, 'editor', { action: 'Uniendo clips y normalizando la voz…' });
  await ffmpeg([...args, '-filter_complex', parts.join(';'), '-map', '[vc]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-c:a', 'aac', '-b:a', '192k', path.join(edit, 'joined.mp4')]);

  // 3) Subtítulos
  const est = estimateWords(segments);
  const words = await whisperWords(job, path.join(edit, 'joined.mp4'), segments, est);
  fs.writeFileSync(path.join(edit, 'captions.ass'), buildAss(job, words, total));

  // 4) Quemar hook + subtítulos + CTA
  store.setWorker(job, 'editor', { action: 'Poniendo hook, subtítulos y CTA…' });
  await ffmpeg(['-i', 'joined.mp4', '-vf', 'ass=captions.ass:fontsdir=fonts', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', 'final.mp4'], { cwd: edit });
  job.output = 'edit/final.mp4';
  job.outputV = Date.now();
  store.log(job, 'editor', `✅ Video final listo: ${total.toFixed(1)} s`);
  store.save(job);
}

module.exports = { run, buildAss, estimateWords };
