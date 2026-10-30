// 🖼️ FRAMES y 🎥 CLIPS: trabajadores que manejan Google Flow en tu Chrome
const fs = require('fs');
const path = require('path');
const store = require('../lib/store');
const claude = require('../lib/claude');
const config = require('../config.json');
const { fill } = require('./director');
const { ffmpeg, exec } = require('../lib/ff');

const pad = (n) => String(n).padStart(2, '0');
const abs = (job, rel) => path.join(store.jobDir(job.id), rel);
const avatarImgs = () => config.avatar.images.map((i) => path.join(store.ROOT, i));

function clipPromptFor(c, job) {
  const lang = config.languages[(job && job.language) || config.language];
  return c.clipPrompt.replace(/\{\{LINE\}\}/g, `"${c.line}"`)
    .replace(/Spoken in (English|Spanish) with an? [\w ]*?accent/i, lang.speech);
}

// Qué imágenes se suben para cada frame
function frameInputs(job, c) {
  const [front, table] = avatarImgs();
  const ref = abs(job, c.ref);
  // Libro: en la mano usa una foto de la señora con el libro; en la mesa, la portada
  const inHand = (config.product.bookInHand || []).map((f) => path.join(store.ROOT, f)).filter((f) => fs.existsSync(f));
  const cover = path.join(store.ROOT, config.product.cover);
  const bookImg = c.book === 'hand' && inHand.length ? inHand[c.n % inHand.length] : cover;
  const book = c.book && fs.existsSync(bookImg) ? [bookImg] : [];
  if (c.feedback && c.frame) return [abs(job, c.frame), front, ...book];
  // Flow rechaza las capturas con personas reales: por defecto la pose va descrita en el prompt
  const refs = config.uploadReference ? [ref] : [];
  if (c.frameMode === 1) return [...refs, front, table, ...book];
  const first = job.clips[0];
  return [...refs, first.frame ? abs(job, first.frame) : table, front, ...book];
}
const L = 'ABCDE';

function frameTask(job, c) {
  const dest = abs(job, `frames/frame_${pad(c.n)}.png`);
  const imgs = frameInputs(job, c);
  const look = c.ref ? `Reference shot to copy (do NOT upload it, Flow refuses real people; only look at it with the Read tool): ${abs(job, c.ref)}\n` +
    'Before pasting, compare the prompt with this reference: sizes, positions and distances of her, the props and the camera must match it. If the prompt does not describe the layout precisely, improve its numbers first. After generating, compare result and reference side by side: the main object must have the SAME size and position in the frame (within about 15%), and her distance to the camera must be the same. If not, regenerate once with corrected numbers (e.g. "the tube occupies only the left 35% of the width").\n' : '';
  if (c.feedback && c.frame) {
    return { dest, text: `### Frame ${c.n} — CORRECTION\n${look}Upload in this order: ${imgs.map((p, i) => `Image ${L[i]} = ${p}`).join(' ; ')}\n` +
      `The producer wants this change (translate it to a clear English instruction for the image model): "${c.feedback}".\n` +
      `Prompt: "Edit Image A: <the change in English>. Use Image B to keep the face and the sweater exactly as the avatar. Keep everything else the same."\n` +
      `Then download and save to: ${dest}` };
  }
  return { dest, text: `### Frame ${c.n}\n${look}Upload in this order: ${imgs.map((p, i) => `Image ${L[i]} = ${p}`).join(' ; ')}\n` +
    `Paste this prompt exactly:\n\`\`\`\n${c.framePrompt}\n\`\`\`\nThen download and save to: ${dest}` };
}

function clipTask(job, c) {
  const dest = abs(job, `clips/clip_${pad(c.n)}.mp4`);
  return { dest, text: `### Clip ${c.n}\nMode: frames to video (start frame only). Start frame = ${abs(job, c.frame)}\n` +
    `Paste this prompt exactly:\n\`\`\`\n${clipPromptFor(c, job)}\n\`\`\`\nThen download the video (MP4, best quality, with audio) and save to: ${c.n === 1 ? `${dest.replace('.mp4', '_a.mp4')} and the second one to ${dest.replace('.mp4', '_b.mp4')}` : dest.replace('.mp4', '_a.mp4')}` };
}

// Lecciones que los trabajadores van aprendiendo (no se borran al actualizar)
function lessonsFile() {
  const f = path.join(store.ROOT, 'memory', 'lecciones.md');
  if (!fs.existsSync(f)) {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.copyFileSync(path.join(store.ROOT, 'prompts', 'lecciones_base.md'), f);
  }
  return f;
}

const PICK = {
  frames: () => `Frame 1 is the HOOK: set Flow to ${config.framesPerPrompt.hook} outputs, look at both and download ONLY the best (our avatar's face, same sweater, the composition of the reference, natural, no text, good hands). It must be the most striking image of the video; if neither is great, generate ${config.framesPerPrompt.hook} more with an improved prompt and pick from all.
Every other frame: set Flow to ${config.framesPerPrompt.rest} output. If it is good at the first try, keep it. If it fails the quality check, regenerate ONCE more with an improved prompt and keep the better one. Do not spend more time on it.
Speed: upload the avatar photos only once per session and then reuse them from Flow's Uploads/library instead of uploading them again for every frame.`,
  clips: () => `Clip 1 is the HOOK: set Flow to ${config.clipsPerPrompt.hook} outputs and download both (as <destination>_a.mp4 and _b.mp4). If both look bad (face changes, glitches, text on screen, she does not move or speak), generate ${config.clipsPerPrompt.hook} more with an improved prompt and download the best two.
Every other clip: set Flow to ${config.clipsPerPrompt.rest} output and download it as <destination>_a.mp4. If it is visually broken, regenerate ONCE with an improved prompt. The system then listens to every clip; if one does not say the whole line or the voice changes, it will send it back once.
If one candidate is visually broken, do not download it and write "bad": "a" or "b" for that item.`,
};

function operatorPrompt(job, role, model, tasks, statusFile, extra = '') {
  const lf = lessonsFile();
  const kind = role.startsWith('FRAMES') ? 'frames' : 'clips';
  return fill(fs.readFileSync(path.join(store.ROOT, 'prompts', 'flow_operator.md'), 'utf8'), {
    LESSONS: fs.readFileSync(lf, 'utf8'), LESSONS_FILE: lf, OUTPUTS: 'the number of', PICK_RULES: PICK[kind](),
    ROLE: role, FLOW_URL: config.flowUrl, STATUS_FILE: statusFile, PROJECT: job.title.slice(0, 40),
    MODEL: model, GRAB: path.join(store.ROOT, 'tools', 'grab-latest.js'), RETRIES: config.maxFrameRetries,
    TASKS: extra + tasks.map((t) => t.text).join('\n\n'),
  });
}

function readStatus(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { items: {}, blocked: null }; }
}

async function session(job, worker, role, model, list, makeTask, extra) {
  await require('../lib/chrome').ensure(job, worker);
  const statusFile = abs(job, `${worker === 'frames' ? 'frames' : 'clips'}/status.json`);
  const tasks = list.map((c) => makeTask(job, c));
  const prev = readStatus(statusFile);
  fs.writeFileSync(statusFile, JSON.stringify({ items: prev.items || {}, blocked: null }, null, 2));
  const prompt = operatorPrompt(job, role, model, tasks, statusFile, extra);
  await claude.run({
    job, worker, prompt, browser: true, cwd: store.ROOT,
    tools: ['Read', 'Write', 'Edit', 'Bash(node:*)'],
  });
  return readStatus(statusFile);
}

// Clips que siguen el mismo plano: copian el frame del primero en vez de generar otro
function shareFrames(job) {
  for (const c of job.clips) {
    if (!c.sameFrameAs || c.frameStatus !== 'pending') continue;
    const src = job.clips.find((x) => x.n === c.sameFrameAs);
    if (src && src.frame && fs.existsSync(abs(job, src.frame))) {
      const dest = `frames/frame_${pad(c.n)}.png`;
      fs.copyFileSync(abs(job, src.frame), abs(job, dest));
      Object.assign(c, { frame: dest, frameStatus: 'done', frameNote: `Mismo frame que el clip ${src.n}`, v: Date.now() });
    }
  }
}

// Pegatinas para los gráficos de edición (p. ej. la comida de "Engorda / Adelgaza")
async function runStickers(job) {
  const ov = job.plan && job.plan.overlay;
  if (!ov || !ov.items) return;
  fs.mkdirSync(abs(job, 'stickers'), { recursive: true });
  const todo = ov.items.map((it, k) => ({ it, k, dest: abs(job, `stickers/item_${pad(k + 1)}.png`) })).filter((x) => !fs.existsSync(x.dest));
  if (!todo.length) return;
  store.setWorker(job, 'frames', { action: `Haciendo ${todo.length} pegatinas para los gráficos…` });
  const tasks = todo.map(({ it, dest }) => ({ dest, text: `### Sticker ${it.label}\nNo images to upload. Aspect ratio 1:1 (square), 1 output.\nPrompt: "Appetizing product photo of ${it.sticker}, centered, filling the frame, isolated on a plain pure white background, soft studio light, no text, no logos."\nThen download and save to: ${dest}` }));
  const statusFile = abs(job, 'stickers/status.json');
  const prompt = operatorPrompt(job, 'FRAMES worker', `${config.frameModel} (image generation)`, tasks, statusFile, 'Submit all stickers one after another, then download each from the grid. These are simple images: no quality retries needed.\n\n');
  try {
    await require('../lib/chrome').ensure(job, 'frames');
    await claude.run({ job, worker: 'frames', prompt, browser: true, cwd: store.ROOT, tools: ['Read', 'Write', 'Edit', 'Bash(node:*)'] });
  } catch (e) {
    store.log(job, 'frames', '⚠️ No pude hacer las pegatinas (pondré solo el texto): ' + e.message.slice(0, 100));
  }
  for (const k of ov.items.keys()) if (fs.existsSync(abs(job, `stickers/item_${pad(k + 1)}.png`))) ov.items[k].image = `stickers/item_${pad(k + 1)}.png`;
  store.save(job);
}

// Genera los frames pendientes. Devuelve 'ok' | 'wait'
async function runFrames(job) {
  // Clips ya hechos: se usan tal cual (frame = su primer fotograma)
  for (const c of job.clips) {
    const src = c.readyClip && path.join(store.ROOT, 'product', 'clips', path.basename(c.readyClip));
    if (src && fs.existsSync(src) && c.frameStatus === 'pending') {
      const frame = `frames/frame_${pad(c.n)}.png`;
      const clip = `clips/clip_${pad(c.n)}.mp4`;
      await ffmpeg(['-i', src, '-frames:v', '1', abs(job, frame)]);
      fs.copyFileSync(src, abs(job, clip));
      Object.assign(c, { frame, frameStatus: 'done', frameNote: 'Clip ya hecho, se usa tal cual', clip, clipStatus: 'done', v: Date.now() });
      store.log(job, 'frames', `🎬 Clip ${c.n}: uso ${path.basename(src)} tal cual`);
    }
  }
  // Frames "tal cual": el director puede usar directamente una foto del libro en mano
  for (const c of job.clips) {
    if (c.frameFrom && ['pending'].includes(c.frameStatus)) {
      const src = path.join(store.ROOT, 'product', path.basename(c.frameFrom));
      if (fs.existsSync(src)) {
        const dest = `frames/frame_${pad(c.n)}.png`;
        fs.copyFileSync(src, abs(job, dest));
        Object.assign(c, { frame: dest, frameStatus: 'done', frameNote: 'Foto del libro usada tal cual', v: Date.now() });
        store.log(job, 'frames', `📗 Frame ${c.n}: uso ${path.basename(src)} tal cual`);
      }
    }
  }
  shareFrames(job);
  store.save(job);
  const todo = job.clips.filter((c) => ['pending', 'regen'].includes(c.frameStatus) && !(c.sameFrameAs && c.frameStatus === 'pending'));
  if (!todo.length) return job.clips.some((c) => c.frameStatus === 'manual') ? 'wait' : 'ok';
  if (config.flowMode !== 'auto') return manual(job, 'frames', todo);

  const first = todo.find((c) => c.n === 1);
  const rest = todo.filter((c) => c.n !== 1);
  const batches = first ? [[first], rest] : [rest]; // el frame 1 va antes: los demás lo usan como referencia
  for (const batch of batches) {
    if (!batch.length) continue;
    store.setWorker(job, 'frames', { action: `Generando frames ${batch.map((c) => c.n).join(', ')} en Flow…` });
    const speed = batch.length > 1 ? 'SPEED: submit ALL the frames of this list one after another without waiting (Flow generates them in parallel), then review and download each one as it finishes. Do not take a screenshot after every click: use snapshots, and screenshots only to judge results.\n\n' : '';
    const st = await session(job, 'frames', 'FRAMES worker', `${config.frameModel} (image generation)`, batch, frameTask, speed);
    if (st.blocked) return blocked(job, 'frames', st.blocked);
    for (const c of batch) {
      const dest = `frames/frame_${pad(c.n)}.png`;
      const it = (st.items || {})[c.n] || {};
      if (fs.existsSync(abs(job, dest))) {
        if (it.prompt && !c.feedback) c.framePrompt = it.prompt;
        Object.assign(c, { frame: dest, frameStatus: it.ok === false ? 'doubt' : 'done', frameNote: it.note || '', feedback: '', v: Date.now() });
      } else {
        Object.assign(c, { frameStatus: 'manual', frameNote: it.refused
          ? `Flow lo rechazó 4 veces (también con el prompt simple). ${it.note || ''} Corrige el prompt y pulsa Reintentar, o sube tu frame.`
          : (it.note || 'No se pudo generar automáticamente') + ' — corrige el prompt y pulsa Reintentar, o sube tu frame.' });
        if (it.prompt) c.framePrompt = it.prompt;
      }
    }
    shareFrames(job);
    store.save(job);
  }
  shareFrames(job);
  await runStickers(job);
  return job.clips.some((c) => c.frameStatus === 'manual') ? 'wait' : 'ok';
}

async function runClips(job) {
  // Si se detuvo a medias, aprovecha los clips que ya estaban descargados
  for (const c of job.clips.filter((x) => x.clipStatus === 'pending')) {
    const dest = `clips/clip_${pad(c.n)}.mp4`;
    if (fs.existsSync(abs(job, dest.replace('.mp4', '_a.mp4')))) {
      await pickClip(job, c, dest);
      Object.assign(c, { clip: dest, clipStatus: 'done', clipNote: 'Recuperado de la sesión anterior', v: Date.now() });
      store.log(job, 'clips', `♻️ Clip ${c.n}: ya estaba descargado, no lo repito`);
    }
  }
  store.save(job);
  for (let round = 0; round < 3; round++) {
    const todo = job.clips.filter((c) => ['pending', 'regen'].includes(c.clipStatus));
    if (!todo.length) break;
    if (config.flowMode !== 'auto') return manual(job, 'clips', todo);
    store.setWorker(job, 'clips', { action: round ? `Repitiendo ${todo.length} clips que no salieron bien…` : `Animando ${todo.length} clips en Flow…` });
    const extra = 'Submit ALL clips first (Flow can generate several at once), then download each one as soon as it is ready. Quality check for clips: the voice must speak the whole line, the face stays the avatar, no text on screen. Clip 1 is the HOOK: it matters most.\n\n' +
      todo.filter((c) => c.clipNote && c.clipStatus === 'regen').map((c) => `Clip ${c.n} came back: ${c.clipNote}. Fix that in the prompt (e.g. shorter line, slower and clearer, "same voice as the previous clips").\n`).join('');
    const st = await session(job, 'clips', 'CLIPS worker', `${config.clipModel} (video)`, todo, clipTask, extra);
    if (st.blocked) return blocked(job, 'clips', st.blocked);
    for (const c of todo) {
      const dest = `clips/clip_${pad(c.n)}.mp4`;
      const it = (st.items || {})[c.n] || {};
      const q = await pickClip(job, c, dest);
      if (it.line && it.prompt) { c.line = it.line; }
      if (it.prompt) c.clipPrompt = it.prompt.includes(c.line) ? it.prompt.replace(`"${c.line}"`, '{{LINE}}') : c.clipPrompt;
      if (!fs.existsSync(abs(job, dest))) { Object.assign(c, { clipStatus: 'manual', clipNote: 'No se pudo generar automáticamente: súbelo tú' }); continue; }
      Object.assign(c, { clip: dest, clipStatus: 'done', clipNote: it.note || '', v: Date.now() });
      // ¿Dice la frase entera y con la misma voz? Si no, se repite UNA vez y se apunta la lección
      const bad = q && (q.text != null && q.text < 0.7 ? `solo dijo el ${Math.round(q.text * 100)} % de la frase` : q.voiceDiff > 0.35 ? 'la voz sonaba distinta a la de los clips anteriores' : '');
      if (bad && !c.clipRetried) {
        Object.assign(c, { clipStatus: 'regen', clipRetried: true, clipNote: bad });
        store.log(job, 'clips', `🔁 Clip ${c.n}: ${bad}. Lo repito una vez.`);
        learn(`Clip de ${c.line.split(/\s+/).length} palabras: ${bad}. ${q.text != null && q.text < 0.7 ? 'Acortar la frase o pedir ritmo más claro.' : 'Insistir en "same voice, tone and energy as the previous clips".'}`);
      }
    }
    // Subtítulos puestos por Flow: se repite (hasta 2 veces) para que no salgan nunca
    for (const c of await checkText(job, todo.filter((x) => x.clipStatus === 'done'))) {
      if ((c.textRetries || 0) >= 2) { store.log(job, 'clips', `⚠️ Clip ${c.n}: Flow insiste en poner texto; lo dejo así`); continue; }
      c.textRetries = (c.textRetries || 0) + 1;
      Object.assign(c, { clipStatus: 'regen', clipNote: 'Flow puso subtítulos o texto en pantalla: repite SIN ningún texto' });
      store.log(job, 'clips', `🔁 Clip ${c.n}: tenía subtítulos de Flow. Lo repito sin texto.`);
    }
    store.save(job);
  }
  return job.clips.some((c) => c.clipStatus === 'manual') ? 'wait' : 'ok';
}

// ¿Flow ha metido subtítulos o texto en el clip? Se mira con 3 fotogramas de cada uno y se repite si los hay
async function checkText(job, list) {
  const items = [];
  for (const c of list) {
    if (!c.clip || c.readyClip) continue;
    const strip = abs(job, `clips/check_${pad(c.n)}.jpg`);
    try {
      await ffmpeg(['-i', abs(job, c.clip), '-vf', 'fps=1/2.4,scale=240:-2,tile=3x1', '-frames:v', '1', strip]);
      items.push({ c, strip });
    } catch {}
  }
  if (!items.length) return [];
  const out = abs(job, 'clips/textcheck.json');
  if (fs.existsSync(out)) fs.unlinkSync(out);
  const prompt = `Each image below shows 3 moments of one video clip. For each one decide if there are burned-in SUBTITLES, CAPTIONS or any words written on screen. Ignore text that belongs to real objects: product labels (e.g. a ketchup bottle), a store sign and a book cover. Only subtitles/captions/overlay text count. Read each image with the Read tool, then write ${out} as JSON {"<n>": true|false} (true = it has subtitles/text). Only Read and Write.\n` +
    items.map((x) => `Clip ${x.c.n}: ${x.strip}`).join('\n');
  try {
    await claude.run({ job, worker: 'clips', prompt, tools: ['Read', 'Write'] });
    const res = JSON.parse(fs.readFileSync(out, 'utf8'));
    return items.filter((x) => res[x.c.n] === true).map((x) => x.c);
  } catch (e) {
    store.log(job, 'clips', 'No pude revisar si hay subtítulos: ' + e.message.slice(0, 80));
    return [];
  }
}

// Apunta una lección para los próximos videos
function learn(line) {
  try { fs.appendFileSync(lessonsFile(), `\n- ${line}`); } catch {}
}

// Elige entre los candidatos _a/_b: frase completa y voz igual a la del clip anterior
async function pickClip(job, c, dest) {
  const cands = ['a', 'b'].map((k) => abs(job, dest.replace('.mp4', `_${k}.mp4`))).filter((f) => fs.existsSync(f));
  if (!cands.length) return null;
  let best = cands[0];
  let q = null;
  const prev = job.clips.filter((x) => x.n < c.n && x.clip && fs.existsSync(abs(job, x.clip))).pop();
  const out = abs(job, `clips/score_${pad(c.n)}.json`);
  const lang = config.languages[job.language || config.language].whisper;
  try {
    await exec('python', [path.join(store.ROOT, 'tools', 'score_clip.py'), out, lang, c.line, prev ? abs(job, prev.clip) : '-', ...cands],
      { env: { ...process.env, SCORE_MODEL: config.scoreModel || '' } });
    const res = JSON.parse(fs.readFileSync(out, 'utf8')).sort((x, y) => y.score - x.score);
    best = res[0].file;
    q = res[0];
    store.log(job, 'clips', `🎧 Clip ${c.n}: ${cands.length > 1 ? `elijo ${path.basename(best)}, ` : ''}frase ${q.text != null ? Math.round(q.text * 100) + ' %' : '?'}, voz ${q.voiceDiff < 0.15 ? 'igual' : q.voiceDiff < 0.35 ? 'parecida' : 'distinta'} que el anterior`);
  } catch (e) {
    store.log(job, 'clips', `Clip ${c.n}: no pude escuchar el clip (${e.message.slice(0, 80)}), lo doy por bueno`);
  }
  fs.copyFileSync(best, abs(job, dest));
  if (q && q.words) fs.writeFileSync(abs(job, dest.replace('.mp4', '.words.json')), JSON.stringify(q.words)); // el editor la reutiliza
  for (const f of cands) fs.unlinkSync(f); // fuera los candidatos descartados
  return q;
}

function manual(job, worker, todo) {
  const key = worker === 'frames' ? 'frameStatus' : 'clipStatus';
  for (const c of todo) c[key] = 'manual';
  store.setWorker(job, worker, { state: 'waiting_you', action: 'Modo manual: copia cada prompt, genera en Flow y arrastra el resultado a su casilla.' });
  return 'wait';
}

function blocked(job, worker, why) {
  store.log(job, worker, '⛔ Flow pide algo que no puedo hacer: ' + why);
  store.setWorker(job, worker, { state: 'waiting_you', action: '⛔ ' + why + ' — resuélvelo en Chrome y pulsa "Reanudar".' });
  return 'wait';
}

module.exports = { shareFrames, runFrames, runClips, clipPromptFor, frameInputs, lessonsFile };
