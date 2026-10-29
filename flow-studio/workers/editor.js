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
// Pasa las palabras oídas en cada clip a la línea de tiempo del video montado
function wordsOnTimeline(segments, heard) {
  const real = [];
  for (const sg of segments) {
    const ws = heard[sg.file];
    if (!ws) return null;
    let off = sg.start;
    for (const [a, b] of sg.ranges) {
      for (const w of ws) if (w.s >= a - 0.02 && w.e <= b + 0.05) real.push({ w: w.w, s: off + Math.max(0, w.s - a), e: off + Math.min(b, w.e) - a });
      off += b - a;
    }
  }
  return real;
}

async function whisperWords(job, audio, segments, est, pre) {
  try {
    let real = pre;
    if (!real) {
      const out = path.join(store.jobDir(job.id), 'edit', 'words.json');
      await exec('python', [path.join(store.ROOT, 'tools', 'transcribe.py'), audio, out, config.languages[job.language || config.language].whisper]);
      real = JSON.parse(fs.readFileSync(out, 'utf8'));
    }
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
    for (let i = 1; i < res.length; i++) if (res[i].s < res[i - 1].s) res[i].s = res[i - 1].s + 0.01; // siempre hacia delante
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
      // Si ella sostiene el libro en ese clip, los subtítulos suben para no tapar la portada
      const clip = job.clips.find((c) => c.n === w.clip) || {};
      const yy = clip.book === 'hand' || clip.readyClip || clip.frameFrom ? Math.round(1920 * (C.yPercentBook || 49) / 100) : y;
      lines.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Cap,,0,0,0,,{\\pos(540,${yy})${pop}}${txt}`);
    });
  }
  // Nunca dos subtítulos a la vez: cada uno termina cuando empieza el siguiente
  const caps = lines.filter((l) => l.startsWith('Dialogue: 0,'));
  const t2s = (t) => { const [h, m, x] = t.split(':'); return +h * 3600 + +m * 60 + +x; };
  const parsed = caps.map((l) => { const p = l.split(','); return { l, s: t2s(p[1]), e: t2s(p[2]) }; }).sort((a, b) => a.s - b.s);
  parsed.forEach((c, i) => { if (parsed[i + 1] && c.e > parsed[i + 1].s) c.e = parsed[i + 1].s; });
  const others = lines.filter((l) => !l.startsWith('Dialogue: 0,'));
  lines.length = 0;
  lines.push(...others, ...parsed.filter((c) => c.e - c.s > 0.04).map((c) => { const p = c.l.split(','); p[2] = assTime(c.e); return p.join(','); }));
  const word = (job.plan && job.plan.ctaWord) || job.ctaWord;
  if (C.ctaBox) lines.push(`Dialogue: 2,${assTime(Math.max(0, total - 3.6))},${assTime(total)},Cta,,0,0,0,,{\\fad(150,0)}${esc(config.languages[job.language || config.language].cta.replace('{{WORD}}', word.toUpperCase()))}`);
  return lines.join('\n') + '\n';
}

// Palabras que dice cada clip (si está instalada la transcripción)
async function clipWords(job) {
  const dir = store.jobDir(job.id);
  const out = path.join(dir, 'edit', 'clip_words.json');
  const files = job.clips.map((c) => path.join(dir, c.clip));
  // Si el trabajador de Clips ya los escuchó, no se vuelven a transcribir
  const cached = {};
  for (const f of files) {
    const w = f.replace(/\.mp4$/, '.words.json');
    if (fs.existsSync(w) && fs.statSync(w).mtimeMs >= fs.statSync(f).mtimeMs - 1000) cached[f] = JSON.parse(fs.readFileSync(w, 'utf8'));
  }
  const missing = files.filter((f) => !cached[f]);
  if (!missing.length) return cached;
  try {
    await exec('python', [path.join(store.ROOT, 'tools', 'words_clips.py'), out, config.languages[job.language || config.language].whisper, config.scoreModel || 'base', ...missing]);
    return { ...cached, ...JSON.parse(fs.readFileSync(out, 'utf8')) };
  } catch {
    store.log(job, 'editor', 'No pude transcribir los clips: no quito repeticiones');
    return {};
  }
}

const norm = (w) => w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9ñ]/g, '');
const same = (a, b) => a.length === b.length && a.every((w, i) => norm(w.w) === norm(b[i].w));

// Qué trozos del clip se quedan: quita lo que repite el final del clip anterior y las palabras dichas dos veces seguidas
function cleanRanges(start, end, words, prevWords) {
  const notes = [];
  if (!words || !words.length) return { ranges: [[start, end]], notes };
  const ws = words.filter((w) => w.e > start && w.s < end);
  if (prevWords && prevWords.length) {
    for (let k = Math.min(5, ws.length, prevWords.length); k >= 1; k--) {
      const tail = prevWords.slice(-k);
      const head = ws.slice(0, k);
      if (same(tail, head) && (k > 1 || norm(head[0].w).length > 3)) {
        start = Math.max(start, head[k - 1].e + 0.03);
        notes.push(`repetía "${head.map((w) => w.w).join(' ')}" del clip anterior: lo corto`);
        ws.splice(0, k);
        break;
      }
    }
  }
  const cuts = [];
  for (let i = 0; i < ws.length; i++) {
    for (let n = 4; n >= 1; n--) {
      const a = ws.slice(i, i + n), b = ws.slice(i + n, i + 2 * n);
      if (b.length === n && same(a, b) && (n > 1 || norm(a[0].w).length > 2)) {
        cuts.push([Math.max(start, a[0].s - 0.02), b[0].s - 0.02]);
        notes.push(`decía dos veces "${a.map((w) => w.w).join(' ')}": quito la primera`);
        i += n - 1;
        break;
      }
    }
  }
  const ranges = [];
  let cur = start;
  for (const [a, b] of cuts) { if (a - cur > 0.15) ranges.push([cur, a]); cur = Math.max(cur, b); }
  if (end - cur > 0.15) ranges.push([cur, end]);
  return { ranges: ranges.length ? ranges : [[start, end]], notes };
}

async function run(job) {
  const dir = store.jobDir(job.id);
  const edit = path.join(dir, 'edit');
  fs.mkdirSync(path.join(edit, 'fonts'), { recursive: true });
  for (const f of fs.readdirSync(path.join(store.ROOT, 'fonts'))) fs.copyFileSync(path.join(store.ROOT, 'fonts', f), path.join(edit, 'fonts', f));

  // 1) Medir la voz de cada clip y buscar palabras repetidas
  const heard = await clipWords(job);
  const segments = [];
  let t = 0;
  let prevWords = null;
  for (const c of job.clips) {
    const file = path.join(dir, c.clip);
    const [s, e, dur] = await speechBounds(file);
    // El hook arranca hablando desde el primer fotograma
    let start = Math.max(0, s - (c.n === job.clips[0].n ? 0.04 : 0.12));
    const end = Math.min(dur, e + 0.22);
    const words = heard[file] || null;
    const { ranges, notes } = cleanRanges(start, end, words, prevWords);
    for (const n of notes) store.log(job, 'editor', `✂️ Clip ${c.n}: ${n}`);
    prevWords = words;
    start = ranges[0][0];
    const len = Math.max(0.8, ranges.reduce((a, r) => a + r[1] - r[0], 0));
    let broll = null;
    if (c.broll && c.broll.file) {
      const bf = path.join(store.ROOT, config.product.brollDir, c.broll.file);
      const bs = Math.max(0, Math.min(len - 0.8, Number(c.broll.start) || 0));
      const bd = Math.max(0.8, Math.min(len - bs, Number(c.broll.duration) || 2));
      if (fs.existsSync(bf)) broll = { file: bf, from: Math.max(0, Number(c.broll.from) || 0), start: bs, dur: bd, image: /\.(png|jpe?g|webp)$/i.test(bf) };
    }
    segments.push({ n: c.n, file, line: c.line, start: t, len, cut: [start, end], ranges, speechStart: t + Math.max(0, s - start), speechEnd: t + len - 0.22, audio: await hasAudio(file), broll });
    store.log(job, 'editor', `Clip ${c.n}: voz ${s.toFixed(2)}–${e.toFixed(2)} s de ${dur.toFixed(1)} s`);
    t += len;
  }
  const total = t;

  // 2) Unir: recorte, 1080x1920, 30 fps
  const args = [];
  const parts = [];
  segments.forEach((sg) => args.push('-i', sg.file));
  let extra = segments.length;
  segments.forEach((sg, i) => {
    const fit = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1';
    // Trozos que se quedan del clip (sin las palabras repetidas)
    const R = sg.ranges;
    const vOut = sg.broll ? `vb${i}` : `v${i}`;
    if (R.length === 1) {
      parts.push(`[${i}:v]trim=${R[0][0].toFixed(3)}:${R[0][1].toFixed(3)},setpts=PTS-STARTPTS,${fit}[${vOut}]`);
    } else {
      parts.push(`[${i}:v]split=${R.length}${R.map((_, k) => `[s${i}_${k}]`).join('')}`);
      R.forEach((r, k) => parts.push(`[s${i}_${k}]trim=${r[0].toFixed(3)}:${r[1].toFixed(3)},setpts=PTS-STARTPTS,${fit}[p${i}_${k}]`));
      parts.push(`${R.map((_, k) => `[p${i}_${k}]`).join('')}concat=n=${R.length}:v=1:a=0[${vOut}]`);
    }
    if (sg.broll) {
      // Recorte del b-roll encima del clip, la voz sigue sonando
      const k = extra++;
      if (sg.broll.image) args.push('-loop', '1', '-t', sg.broll.dur.toFixed(3), '-i', sg.broll.file);
      else args.push('-i', sg.broll.file);
      const st = sg.broll.start.toFixed(3), en = (sg.broll.start + sg.broll.dur).toFixed(3);
      parts.push(`[${k}:v]trim=${sg.broll.image ? 0 : sg.broll.from.toFixed(3)}:${((sg.broll.image ? 0 : sg.broll.from) + sg.broll.dur).toFixed(3)},setpts=PTS-STARTPTS+${st}/TB,${fit}${sg.broll.image ? ",zoompan=z='min(zoom+0.0012,1.08)':d=1:s=1080x1920:fps=30" : ''}[br${i}]`);
      parts.push(`[vb${i}][br${i}]overlay=enable='between(t,${st},${en})':eof_action=pass[v${i}]`);
    }
    const afmt = (r) => `atrim=${r[0].toFixed(3)}:${r[1].toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:d=0.03,afade=t=out:st=${Math.max(0, r[1] - r[0] - 0.05).toFixed(3)}:d=0.05`;
    if (!sg.audio) parts.push(`anullsrc=r=48000:cl=stereo,atrim=0:${sg.len.toFixed(3)}[a${i}]`);
    else if (R.length === 1) parts.push(`[${i}:a]${afmt(R[0])}[a${i}]`);
    else {
      parts.push(`[${i}:a]asplit=${R.length}${R.map((_, k) => `[as${i}_${k}]`).join('')}`);
      R.forEach((r, k) => parts.push(`[as${i}_${k}]${afmt(r)}[ap${i}_${k}]`));
      parts.push(`${R.map((_, k) => `[ap${i}_${k}]`).join('')}concat=n=${R.length}:v=0:a=1[a${i}]`);
    }
  });
  const joined = segments.map((_, i) => `[v${i}][a${i}]`).join('');
  parts.push(`${joined}concat=n=${segments.length}:v=1:a=1[vc][ac]`);
  parts.push('[ac]highpass=f=80,acompressor=threshold=-18dB:ratio=3:attack=5:release=120,loudnorm=I=-14:TP=-1.5:LRA=9[aout]');
  store.setWorker(job, 'editor', { action: 'Uniendo clips y normalizando la voz…' });
  await ffmpeg([...args, '-filter_complex', parts.join(';'), '-map', '[vc]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-c:a', 'aac', '-b:a', '192k', path.join(edit, 'joined.mp4')]);

  // 3) Subtítulos
  const est = estimateWords(segments);
  // Reutiliza la transcripción de los clips (no vuelve a transcribir el video entero)
  const words = await whisperWords(job, path.join(edit, 'joined.mp4'), segments, est, wordsOnTimeline(segments, heard));
  fs.writeFileSync(path.join(edit, 'captions.ass'), buildAss(job, words, total));

  // 4) Quemar hook + subtítulos + CTA
  store.setWorker(job, 'editor', { action: 'Poniendo hook, subtítulos y CTA…' });
  await ffmpeg(['-i', 'joined.mp4', '-vf', 'ass=captions.ass:fontsdir=fonts', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', 'final.mp4'], { cwd: edit });
  job.output = 'edit/final.mp4';
  job.outputV = Date.now();
  store.log(job, 'editor', `✅ Video final listo: ${total.toFixed(1)} s`);
  store.save(job);
}

module.exports = { run, buildAss, estimateWords, cleanRanges };
