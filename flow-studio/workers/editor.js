// ✂️ EDITOR: une los clips, recorta silencios, normaliza la voz y pone hook, subtítulos y CTA
const fs = require('fs');
const path = require('path');
const store = require('../lib/store');
const config = require('../config.json');
const { exec, ffmpeg, speechBounds, hasAudio, silences } = require('../lib/ff');

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

// Palabra que va en cursiva: la más "importante" (la más larga que no sea una palabra vacía)
const STOP = new Set('que de la el los las una uno unos unas para con por como pero porque cuando esto esta este eso esa todo toda tienes tengo the and with that this your have you for are'.split(' '));
function accentIndex(chunk) {
  let best = -1, len = 4;
  chunk.forEach((w, j) => { const t = norm(w.w); if (!STOP.has(t) && t.length > len) { best = j; len = t.length; } });
  return best;
}
// Dónde parte la frase en dos líneas (equilibrando letras)
function lineBreak(chunk) {
  if (chunk.length < 3) return -1;
  const total = chunk.reduce((a, w) => a + w.w.length, 0);
  let acc = 0;
  for (let j = 0; j < chunk.length - 1; j++) { acc += chunk[j].w.length; if (acc >= total / 2) return j + 1; }
  return chunk.length - 1;
}

// Gráfico "versus": línea en el centro, dos etiquetas y las pegatinas que van apareciendo a cada lado
function versusLayout(job, segments) {
  const ov = job.plan && job.plan.overlay;
  if (!ov || ov.type !== 'versus' || !ov.items || !ov.items.length) return null;
  const size = 160, top = 1110, gap = 215;
  const count = { left: 0, right: 0 };
  const items = ov.items.map((it) => {
    const seg = segments.find((sg) => sg.n === it.clip) || segments[0];
    const side = it.side === 'left' ? 'left' : 'right';
    const idx = count[side]++;
    const col = idx % 2, row = Math.floor(idx / 2);
    const x = side === 'left' ? [400, 215][col] : [680, 865][col];
    return { ...it, side, x, y: top + row * gap, t: seg.start + 0.3 };
  });
  const rows = Math.max(Math.ceil(count.left / 2), Math.ceil(count.right / 2), 1);
  return { ...ov, items, size, t0: Math.min(...items.map((i) => i.t)), lineTop: 990, lineH: 140 + rows * gap, captionY: Math.min(1840, top + rows * gap + 40) };
}

// Estilo de subtítulos: "bold" (MAYÚSCULAS gruesas con contorno y la palabra clave en color, como los reels que más funcionan)
// o "elegant" (palabra clave en cursiva elegante). Se elige en ⚙️ Ajustes → Edición.
const capStyle = () => require('../lib/settings').get().captionStyle || C.style || 'elegant';
const assColor = (hex) => { const h = String(hex || '#5EC8F0').replace('#', ''); return `&H00${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}&`.toUpperCase(); };
function hookText(hook) {
  if (capStyle() === 'bold') return esc(hook).toUpperCase().replace(/\*([^*]+)\*/g, `{\\c${assColor(C.accentColor)}}$1{\\c&H00FFFFFF&}`);
  return esc(hook).replace(/\*([^*]+)\*/g, `{\\fn${C.accentFont}\\i1\\fs${Math.round(C.size * 1.45)}}$1{\\fn${C.font}\\i0\\fs${Math.round(C.size * 1.05)}}`);
}

function buildAss(job, words, total, segs) {
  const bold = capStyle() === 'bold';
  const y = Math.round(1920 * C.yPercent / 100);
  const lines = [
    '[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 1080', 'PlayResY: 1920', 'WrapStyle: 0', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    bold ? `Style: Cap,${C.font},${Math.round(C.size * 0.92)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,5,2,5,60,60,0,1`
      : `Style: Cap,${C.font},${C.size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H8C000000,0,0,0,0,100,100,-1,0,1,0,3,5,60,60,0,1`,
    bold ? `Style: Hook,${C.font},${Math.round(C.size * 0.95)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,5,2,5,70,70,0,1`
      : `Style: Hook,${C.font},${Math.round(C.size * 1.05)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2.5,4,5,70,70,0,1`,
    `Style: Cta,${C.font},${Math.round(C.size * 0.8)},&H00111111,&H00111111,&H0033D7FF,&H0033D7FF,0,0,0,0,100,100,0,0,3,18,0,8,80,80,260,1`,
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const hookEnd = job.plan && job.plan.hook ? C.hookSeconds : 0;
  // Marca "Synthetic Performer": pequeña y discreta arriba a la izquierda, todo el video
  const W = config.watermark;
  if (W && W.text) {
    const a = Math.round(255 * (1 - (W.opacity ?? 0.85))).toString(16).padStart(2, '0').toUpperCase();
    lines.splice(lines.indexOf('[Events]'), 0, `Style: Mark,${C.font},${W.size || 30},&H${a}FFFFFF,&H${a}FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0.5,0,1,0,1.5,7,0,0,0,1`, '');
    lines.push(`Dialogue: 4,${assTime(0)},${assTime(total + 1)},Mark,,0,0,0,,{\\pos(${W.x ?? 46},${W.y ?? 70})}${esc(W.text)}`);
  }
  const ov = versusLayout(job, segs || []);
  if (ov) {
    lines.splice(lines.indexOf('[Events]'), 0,
      `Style: VsL,${C.font},62,&H00FFFFFF,&H00FFFFFF,&H003030E0,&H003030E0,0,0,0,0,100,100,0,0,3,14,0,5,0,0,0,1`,
      `Style: VsR,${C.font},62,&H00FFFFFF,&H00FFFFFF,&H0040B030,&H0040B030,0,0,0,0,100,100,0,0,3,14,0,5,0,0,0,1`,
      `Style: VsItem,${C.font},34,&H00FFFFFF,&H00FFFFFF,&H00000000,&H8C000000,0,0,0,0,100,100,0,0,1,2,2,5,0,0,0,1`, '');
    lines.push(`Dialogue: 3,${assTime(ov.t0)},${assTime(total)},VsL,,0,0,0,,{\\pos(330,1040)\\fad(150,0)}${esc(ov.left || '')}`);
    lines.push(`Dialogue: 3,${assTime(ov.t0)},${assTime(total)},VsR,,0,0,0,,{\\pos(750,1040)\\fad(150,0)}${esc(ov.right || '')}`);
    for (const it of ov.items) lines.push(`Dialogue: 3,${assTime(it.t)},${assTime(total)},VsItem,,0,0,0,,{\\pos(${it.x},${it.y + ov.size + 22})\\fad(120,0)}${esc(it.label || '')}`);
  }
  if (hookEnd) lines.push(`Dialogue: 1,${assTime(0)},${assTime(hookEnd)},Hook,,0,0,0,,{\\pos(540,${Math.round(1920 * 0.47)})\\fad(0,120)}${hookText(job.plan.hook)}`);

  // Subtítulos estilo "I have *healthy* alternatives": frase de 3-4 palabras en 2 líneas,
  // la palabra clave en cursiva elegante y más grande; las palabras aparecen según las dice
  const visible = words.filter((w) => w.e > hookEnd);
  const N = bold ? 3 : C.wordsPerChunk || 4;
  for (let i = 0; i < visible.length; i += N) {
    const chunk = visible.slice(i, i + N);
    const acc = accentIndex(chunk);
    const brk = lineBreak(chunk);
    const clip = job.clips.find((c) => c.n === chunk[0].clip) || {};
    // Si ella sostiene el libro en ese clip, los subtítulos suben para no tapar la portada
    const yy = ov && chunk[0].s >= ov.t0 - 0.5 ? ov.captionY : clip.book === 'hand' || clip.readyClip || clip.frameFrom ? Math.round(1920 * (C.yPercentBook || 49) / 100) : y;
    chunk.forEach((w, k) => {
      const start = Math.max(w.s, hookEnd);
      const end = k < chunk.length - 1 ? chunk[k + 1].s : (visible[i + N] ? visible[i + N].s : w.e + 0.35);
      if (end <= start) return;
      const txt = chunk.map((x, j) => {
        const hide = j > k ? '{\\alpha&HFF&}' : '{\\alpha&H00&}';
        const word = bold ? (j === acc ? `{\\c${assColor(C.accentColor)}}${esc(x.w).toUpperCase()}{\\c&H00FFFFFF&}` : esc(x.w).toUpperCase())
          : j === acc ? `{\\fn${C.accentFont}\\i1\\fs${Math.round(C.size * 1.5)}}${esc(x.w)}{\\fn${C.font}\\i0\\fs${C.size}}` : esc(x.w);
        return (j === brk ? '\\N' : j ? ' ' : '') + hide + word;
      }).join('');
      const pop = k === 0 ? '\\fscx90\\fscy90\\t(0,100,\\fscx100\\fscy100)' : '';
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
  const files = job.clips.filter((c) => !c.skip && c.clip).map((c) => path.join(dir, c.clip));
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
function cleanRanges(start, end, words, prevWords, pc = PACE.corto) {
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
  // Pausas entre palabras: se dejan muy cortas para que hable seguido pero natural
  for (let i = 0; i < ws.length - 1; i++) {
    const gap = ws[i + 1].s - ws[i].e;
    if (gap > pc.gap && !cuts.some(([a, b]) => a <= ws[i].e && b >= ws[i + 1].s)) {
      cuts.push([ws[i].e + pc.keep / 2, ws[i + 1].s - pc.keep / 2]);
      notes.push(`pausa de ${gap.toFixed(1)} s después de "${ws[i].w}": la acorto`);
    }
  }
  cuts.sort((a, b) => a[0] - b[0]);
  const ranges = [];
  let cur = start;
  for (const [a, b] of cuts) { if (a - cur > 0.08) ranges.push([cur, a]); cur = Math.max(cur, b); }
  if (end - cur > 0.08) ranges.push([cur, end]);
  return { ranges: ranges.length ? ranges : [[start, end]], notes };
}

// 🎬 Edición dinámica: dentro de cada trozo, cortes cada ~2,4 s alternando plano normal y más cerrado,
// y un golpe de zoom en la palabra clave del clip. Devuelve los trozos y dónde pegó el zoom.
const E = config.edit || {};
// Ritmo: cuánto silencio se deja entre frases y a qué velocidad va el video (⚙️ Ajustes → Edición)
const PACE = { normal: { gap: 0.45, keep: 0.22, pad: 0.12, tail: 0.22 }, corto: { gap: 0.28, keep: 0.12, pad: 0.06, tail: 0.12 }, muycorto: { gap: 0.2, keep: 0.07, pad: 0.04, tail: 0.08 } };
function pace() {
  const s = require('../lib/settings').get();
  return { ...(PACE[s.silences] || PACE.corto), speed: Number(s.speed || E.speed || 1) || 1 };
}
function zoomPieces(ranges, words, still, counter) {
  const every = E.every || 2.4;
  const keyWord = still || !words ? null : words.filter((w) => !STOP.has(norm(w.w)) && norm(w.w).length > 5 && ranges.some((r) => w.s >= r[0] && w.e <= r[1]))
    .sort((a, b) => norm(b.w).length - norm(a.w).length)[0];
  const out = [];
  const punches = [];
  for (const [a, b] of ranges) {
    const cuts = new Set([a, b]);
    if (!still && E.zoom !== false) {
      for (let x = a + every; x < b - 0.8; x += every) {
        // corta entre palabras, nunca en mitad de una
        const w = (words || []).find((w) => w.s >= x - 0.5 && w.s <= x + 0.5);
        cuts.add(w ? Math.max(a, w.s - 0.02) : x);
      }
      if (keyWord && keyWord.s >= a && keyWord.e <= b) { cuts.add(Math.max(a, keyWord.s - 0.05)); cuts.add(Math.min(b, keyWord.e + 0.3)); }
    }
    const pts = [...cuts].sort((x, y) => x - y).filter((x, i, arr) => i === 0 || x - arr[i - 1] > 0.3 || x === b);
    for (let i = 0; i < pts.length - 1; i++) {
      const pa = pts[i], pb = pts[i + 1];
      if (pb - pa < 0.05) continue;
      const punch = keyWord && pa >= keyWord.s - 0.06 && pa < keyWord.e;
      const z = still || E.zoom === false ? 1 : punch ? (E.punch || 1.2) : (counter.n++ % 2 ? (E.zoomLevel || 1.12) : 1);
      out.push([pa, pb, z]);
      if (punch) punches.push(pa);
    }
  }
  return { pieces: out.length ? out : ranges.map((r) => [r[0], r[1], 1]), punches };
}
const zoomFilter = (z) => {
  if (z <= 1.001) return '';
  const W = Math.round(1080 * z / 2) * 2, H = Math.round(1920 * z / 2) * 2;
  return `,scale=${W}:${H},crop=1080:1920:${(W - 1080) / 2}:${Math.round((H - 1920) * 0.35)},setsar=1`; // un poco hacia arriba: la cara no se corta
};
// Sonidos suaves generados al vuelo (sin descargar nada): "whoosh" en los cambios de clip y "pop" en el golpe de zoom
async function makeSfx(edit) {
  const w = path.join(edit, 'sfx_whoosh.wav'), p = path.join(edit, 'sfx_pop.wav');
  if (!fs.existsSync(w)) await ffmpeg(['-f', 'lavfi', '-i', 'anoisesrc=d=0.4:c=pink:a=0.6', '-af', 'bandpass=f=1400:width_type=o:w=2,afade=t=in:d=0.18,afade=t=out:st=0.18:d=0.22,aresample=48000,aformat=channel_layouts=stereo', w]);
  if (!fs.existsSync(p)) await ffmpeg(['-f', 'lavfi', '-i', 'sine=f=880:d=0.09', '-af', 'afade=t=out:st=0:d=0.09,aresample=48000,aformat=channel_layouts=stereo,volume=0.6', p]);
  return { whoosh: w, pop: p };
}

// Quita de los tramos que se quedan los trozos indicados
function subtract(ranges, cuts) {
  let out = ranges.map((r) => [...r]);
  for (const [a, b] of cuts) {
    out = out.flatMap(([x, y]) => (b <= x || a >= y ? [[x, y]] : [[x, Math.max(x, a)], [Math.min(y, b), y]]).filter(([p, q]) => q - p > 0.06));
  }
  return out.length ? out : ranges;
}

// Cada montaje se guarda con un nombre nuevo: en Windows no se puede sustituir un video que la página está reproduciendo
function cleanOld(edit, keep) {
  for (const f of fs.readdirSync(edit)) if (/^final.*\.mp4$/.test(f) && !keep.includes(f)) { try { fs.unlinkSync(path.join(edit, f)); } catch {} }
}

async function run(job) {
  const stamp = Date.now();
  const nameA = await render(job, { clips: job.clips, hook: job.plan && job.plan.hook, tag: '', stamp });
  job.output = `edit/${nameA}`;
  job.outputB = null;
  job.outputV = Date.now();
  store.save(job);
  // 🅰️🅱️ Versión B: el mismo video con el hook B en el clip 1
  const hb = job.hookB;
  if (hb && hb.clip && hb.clipStatus === 'done' && fs.existsSync(path.join(store.jobDir(job.id), hb.clip))) {
    try {
      const first = job.clips.find((c) => !c.skip && c.clip);
      const clips = job.clips.map((c) => (c === first ? { ...c, clip: hb.clip, line: hb.line } : c));
      const nameB = await render(job, { clips, hook: hb.text || (job.plan && job.plan.hook), tag: 'B', stamp });
      job.outputB = `edit/${nameB}`;
      store.log(job, 'editor', '🅰️🅱️ Versión B lista (mismo video con el otro hook)');
    } catch (e) {
      store.log(job, 'editor', '⚠️ No pude montar la versión B: ' + e.message.slice(0, 120));
    }
    store.save(job);
  }
  cleanOld(path.join(store.jobDir(job.id), 'edit'), [path.basename(job.output), job.outputB ? path.basename(job.outputB) : ''].filter(Boolean));
  await publishKit(job);
}

async function render(job, v) {
  // J = el video con los clips y el hook de esta versión (solo para leer; los registros van al video real)
  const J = { ...job, clips: v.clips, plan: { ...(job.plan || {}), hook: v.hook } };
  const T = v.tag;
  const dir = store.jobDir(job.id);
  const edit = path.join(dir, 'edit');
  fs.mkdirSync(path.join(edit, 'fonts'), { recursive: true });
  for (const f of fs.readdirSync(path.join(store.ROOT, 'fonts'))) fs.copyFileSync(path.join(store.ROOT, 'fonts', f), path.join(edit, 'fonts', f));

  // 1) Medir la voz de cada clip y buscar palabras repetidas
  const heard = await clipWords(J);
  const pc = pace();
  const segments = [];
  let t = 0;
  let prevWords = null;
  for (const c of J.clips) {
    if (c.skip || !c.clip) continue;
    const file = path.join(dir, c.clip);
    const [s0, e0, dur] = await speechBounds(file);
    const words = heard[file] || null;
    // Se corta por la primera y la última palabra que se entienden (el volumen confunde respiraciones y ruido con voz)
    const ws = words && words.length ? words : null;
    const s = ws ? Math.max(ws[0].s, s0 - 0.15) : s0;
    const e = ws ? Math.min(Math.max(ws[ws.length - 1].e, s), e0 + 0.1) : e0;
    // El hook arranca hablando desde el primer fotograma
    let start = Math.max(0, s - (c.n === J.clips[0].n ? 0.04 : pc.pad));
    const end = Math.min(dur, e + pc.tail);
    let { ranges, notes } = cleanRanges(start, end, words, prevWords, pc);
    // Además, cualquier silencio real dentro del clip ("mi abuela dormía… gracias a") se deja en casi nada,
    // aunque la transcripción no lo marque como pausa
    try {
      const gaps = (await silences(file, '-32dB', pc.gap)).filter((g) => g.s > start + 0.05 && g.e < end - 0.05)
        .map((g) => [g.s + pc.keep / 2, g.e - pc.keep / 2]).filter(([a, b]) => b - a > 0.05);
      if (gaps.length) {
        ranges = subtract(ranges, gaps);
        notes = [...notes, `${gaps.length} silencio(s) dentro de la frase: los acorto`];
      }
    } catch {}
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
    // Sin zoom en los clips del libro (la portada no se corta) ni en los clips ya hechos
    const still = !!(c.book === 'hand' || c.readyClip || c.frameFrom);
    segments.push({ n: c.n, file, line: c.line, start: t, len, cut: [start, end], ranges, words, still, tail: pc.tail, speechStart: t + Math.max(0, s - start), speechEnd: t + len - pc.tail, audio: await hasAudio(file), broll });
    store.log(job, 'editor', `Clip ${c.n}: voz ${s.toFixed(2)}–${e.toFixed(2)} s de ${dur.toFixed(1)} s`);
    t += len;
  }
  const total = t;

  // 2) Unir: recorte, 1080x1920, 30 fps
  const args = [];
  const parts = [];
  const sfx = []; // [segundo, 'whoosh'|'pop']
  const counter = { n: 0 };
  segments.forEach((sg) => args.push('-i', sg.file));
  let extra = segments.length;
  // 🎥 Acercamientos suaves: 1-2 por video (el hook y el clip más largo del medio), como alguien grabando que se acerca despacio
  const smooth = E.style !== 'cuts';
  const pushIn = new Set();
  if (smooth) {
    const ok = segments.map((sg, i) => ({ sg, i })).filter(({ sg }) => !sg.still && !sg.broll && sg.len > 1.2);
    if (ok[0] && ok[0].i === 0) pushIn.add(0);
    const mid = ok.filter(({ i }) => i > 0 && i < segments.length - 1).sort((a, b) => b.sg.len - a.sg.len)[0];
    if (mid && pushIn.size < (E.smoothZooms ?? 2)) pushIn.add(mid.i);
  }
  segments.forEach((sg, i) => {
    const fit = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1';
    // Trozos que se quedan del clip (sin las palabras repetidas), cada uno con su zoom
    const R = sg.ranges;
    const { pieces: P, punches } = smooth ? { pieces: R.map((r) => [r[0], r[1], 1]), punches: [] } : zoomPieces(R, sg.words, sg.still || !!sg.broll, counter);
    // Posición en el video final de cada golpe de zoom
    const toTimeline = (x) => { let acc = 0; for (const [a, b] of R) { if (x >= a && x <= b) return sg.start + acc + (x - a); acc += b - a; } return null; };
    punches.forEach((x) => { const tt = toTimeline(x); if (tt != null) sfx.push([tt, 'pop']); });
    if (i > 0) sfx.push([Math.max(0, sg.start - 0.15), 'whoosh']);
    const vFinal = sg.broll ? `vb${i}` : `v${i}`;
    const vOut = pushIn.has(i) ? `vz${i}` : vFinal;
    if (P.length === 1) {
      parts.push(`[${i}:v]trim=${P[0][0].toFixed(3)}:${P[0][1].toFixed(3)},setpts=PTS-STARTPTS,${fit}${zoomFilter(P[0][2])}[${vOut}]`);
    } else {
      parts.push(`[${i}:v]split=${P.length}${P.map((_, k) => `[s${i}_${k}]`).join('')}`);
      P.forEach((r, k) => parts.push(`[s${i}_${k}]trim=${r[0].toFixed(3)}:${r[1].toFixed(3)},setpts=PTS-STARTPTS,${fit}${zoomFilter(r[2])}[p${i}_${k}]`));
      parts.push(`${P.map((_, k) => `[p${i}_${k}]`).join('')}concat=n=${P.length}:v=1:a=0[${vOut}]`);
    }
    if (pushIn.has(i)) {
      // Se acerca despacio durante todo el clip (con un leve vaivén de mano), sin cortes
      const N = Math.max(1, Math.round(sg.len * 30));
      const A = E.smoothAmount || 0.09;
      counter.n++;
      parts.push(`[${vOut}]scale=2160:3840,zoompan=z='1+${A}*on/${N}':x='iw/2-iw/zoom/2+4*sin(on/23)':y='(ih-ih/zoom)*0.35+3*sin(on/31)':d=1:s=1080x1920:fps=30,setsar=1[${vFinal}]`);
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
  parts.push('[ac]highpass=f=80,acompressor=threshold=-18dB:ratio=3:attack=5:release=120,loudnorm=I=-14:TP=-1.5:LRA=9[aout0]');
  // Sonidos suaves por debajo de la voz (nunca dos seguidos en menos de 1,2 s)
  const events = [];
  if (E.sfx !== false) for (const ev of sfx.sort((a, b) => a[0] - b[0])) if (!events.length || ev[0] - events[events.length - 1][0] > 1.2) events.push(ev);
  if (events.length) {
    const fx = await makeSfx(edit);
    const ins = events.map(([tt, kind]) => { const k = extra++; args.push('-i', fx[kind]); const ms = Math.round(tt * 1000); return `[${k}:a]adelay=${ms}|${ms},volume=${E.sfxVolume || 0.35}[fx${k}]`; });
    parts.push(...ins);
    const labels = ins.map((x) => x.match(/\[(fx\d+)\]$/)[1]);
    parts.push(`[aout0]${labels.map((l) => `[${l}]`).join('')}amix=inputs=${labels.length + 1}:duration=first:dropout_transition=0,volume=${labels.length + 1}[aout]`);
  } else parts.push('[aout0]anull[aout]');
  store.setWorker(job, 'editor', { action: `Uniendo clips${T ? ' (versión ' + T + ')' : ''}, con zooms y sonidos…` });
  await ffmpeg([...args, '-filter_complex', parts.join(';'), '-map', '[vc]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-c:a', 'aac', '-b:a', '192k', path.join(edit, `joined${T}.mp4`)]);

  // 3) Subtítulos
  const est = estimateWords(segments);
  // Reutiliza la transcripción de los clips (no vuelve a transcribir el video entero)
  const words = await whisperWords(job, path.join(edit, `joined${T}.mp4`), segments, est, wordsOnTimeline(segments, heard));
  fs.writeFileSync(path.join(edit, `captions${T}.ass`), buildAss(J, words, total, segments));

  // 4) Quemar gráficos (si los hay) + hook + subtítulos
  store.setWorker(job, 'editor', { action: 'Poniendo gráficos, hook y subtítulos…' });
  const ov = versusLayout(J, segments);
  const inputs = ['-i', `joined${T}.mp4`];
  const fc = [];
  let last = '0:v';
  if (ov) {
    fc.push(`[0:v]drawbox=x=537:y=${ov.lineTop}:w=6:h=${ov.lineH}:color=white@0.95:t=fill:enable='gte(t,${ov.t0.toFixed(2)})'[g0]`);
    last = 'g0';
    ov.items.filter((it) => it.image).forEach((it, k) => {
      inputs.push('-i', path.join(dir, it.image));
      const r = ov.size / 2;
      fc.push(`[${k + 1}:v]scale=${ov.size}:${ov.size}:force_original_aspect_ratio=increase,crop=${ov.size}:${ov.size},format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(hypot(X-${r},Y-${r}),${r - 2}),255,0)'[st${k}]`);
      fc.push(`[${last}][st${k}]overlay=x=${it.x - r}:y=${it.y}:enable='gte(t,${it.t.toFixed(2)})'[g${k + 1}]`);
      last = `g${k + 1}`;
    });
  }
  fc.push(`[${last}]ass=captions${T}.ass:fontsdir=fonts[vout]`);
  await ffmpeg([...inputs, '-filter_complex', fc.join(';'), '-map', '[vout]', '-map', '0:a', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', `pre${T}.mp4`], { cwd: edit });
  const out = `final${T}_${v.stamp || Date.now()}.mp4`;
  if (pc.speed > 1.001 || pc.speed < 0.999) {
    store.setWorker(job, 'editor', { action: `⚡ Acelerando a x${pc.speed}…` });
    await ffmpeg(['-i', `pre${T}.mp4`, '-filter_complex', `[0:v]setpts=PTS/${pc.speed}[v];[0:a]atempo=${pc.speed}[a]`, '-map', '[v]', '-map', '[a]',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out], { cwd: edit });
  } else fs.copyFileSync(path.join(edit, `pre${T}.mp4`), path.join(edit, out));
  store.log(job, 'editor', `✅ Video final${T ? ' (versión ' + T + ')' : ''} listo: ${(total / pc.speed).toFixed(1)} s${pc.speed !== 1 ? ` (x${pc.speed})` : ''} · ${counter.n} cambios de plano · ${events.length} sonidos`);
  return out;
}

// Hashtags: Instagram deja 5. Los que elige el kit primero y, al final, los fijos del productor (⚙️ Ajustes)
const fixedTags = () => (require('../lib/settings').get().fixedTags || config.fixedTags || []).slice(0, 5);
function fiveTags(text) {
  const norm = (t) => '#' + t.replace(/^#+/, '').trim();
  const fixed = fixedTags().map(norm);
  const taken = new Set(fixed.map((t) => t.toLowerCase()));
  const free = [...new Map(String(text || '').split(/[\s,]+/).filter((t) => t.replace(/#/g, '')).map(norm)
    .filter((t) => !taken.has(t.toLowerCase())).map((t) => [t.toLowerCase(), t])).values()].slice(0, 5 - fixed.length);
  return [...free, ...fixed].join(' ');
}

// Kit para publicar: portada, descripción, hashtags y aviso de afiliado
async function publishKit(job) {
  const edit = path.join(store.jobDir(job.id), 'edit');
  store.setWorker(job, 'editor', { action: 'Preparando portada y texto para publicar…' });
  const cover = `cover_${Date.now()}.jpg`;
  for (const f of fs.readdirSync(edit)) if (/^cover.*\.jpg$/.test(f)) { try { fs.unlinkSync(path.join(edit, f)); } catch {} }
  try { await ffmpeg(['-ss', '0.6', '-i', path.basename(job.output), '-frames:v', '1', '-q:v', '2', cover], { cwd: edit }); } catch {}
  const out = path.join(edit, 'kit.json');
  try {
    const { fill } = require('./director');
    const claude = require('../lib/claude');
    const prompt = fill(fs.readFileSync(path.join(store.ROOT, 'prompts', 'kit.md'), 'utf8'), {
      FIXED_TAGS: fixedTags().join(' ') || '(none)', FREE_TAGS: String(5 - fixedTags().length),
      TYPE: job.videoType === 'venta' ? 'sales video for the book' : 'growth video (max virality)', HOOK: (job.plan && job.plan.hook || '').replace(/\*/g, ''),
      CTA: (job.plan && job.plan.ctaWord) || job.ctaWord, LINES: job.clips.filter((c) => !c.skip).map((c) => c.line).join('\n'), OUT: out,
    });
    if (!job.workers.kit) job.workers.kit = { state: 'idle', action: '', log: [], paused: false };
    const text = await claude.run({ job, worker: 'kit', prompt, tools: ['Write'] });
    const k = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : claude.extractJson(text);
    job.kit = { ...k, ubicacion: config.location || k.ubicacion || '', hashtags: fiveTags(k.hashtags), disclosure: job.videoType === 'venta' ? config.amazonDisclosure : '', cover: fs.existsSync(path.join(edit, cover)) ? `edit/${cover}` : null };
  } catch (e) {
    store.log(job, 'editor', '⚠️ No pude preparar el texto para publicar: ' + e.message.slice(0, 100));
    job.kit = { cover: fs.existsSync(path.join(edit, cover)) ? `edit/${cover}` : null };
  }
  store.save(job);
}

module.exports = { run, buildAss, estimateWords, cleanRanges };
