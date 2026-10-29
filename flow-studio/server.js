// Flow Studio: panel de oficinas en http://localhost:4000
const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./lib/store');
const pipeline = require('./lib/pipeline');
const claude = require('./lib/claude');
const config = require('./config.json');
const { ffmpeg } = require('./lib/ff');
const flow = require('./workers/flow');
const research = require('./workers/research');

const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.json': 'application/json', '.log': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };
const pad = (n) => String(n).padStart(2, '0');

function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function serveFile(req, res, file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('no existe'); }
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const size = fs.statSync(file).size;
  const range = req.headers.range;
  if (range && type === 'video/mp4') {
    const [a, b] = range.replace('bytes=', '').split('-');
    const start = parseInt(a, 10), end = b ? parseInt(b, 10) : size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

function safeJoin(base, rel) {
  const p = path.normalize(path.join(base, rel));
  return p.startsWith(base) ? p : null;
}

function promptsFor(job) {
  // Para el modo manual y para "ver lo que hace": prompts listos para copiar
  return job.clips.map((c) => ({
    n: c.n,
    frameInputs: c.ref ? flow.frameInputs(job, c).map((p) => path.relative(store.ROOT, p).replace(/\\/g, '/')) : [],
    clipPrompt: c.clipPrompt ? flow.clipPromptFor(c, job) : '',
  }));
}

async function handleUpload(job, kind, n, name, buf) {
  const dir = store.jobDir(job.id);
  const ext = (path.extname(name || '') || '.bin').toLowerCase();
  if (kind === 'ref') {
    for (const f of fs.readdirSync(path.join(dir, 'ref'))) if (/^(upload\.|video\.mp4|sheet_)/.test(f)) fs.unlinkSync(path.join(dir, 'ref', f));
    fs.writeFileSync(path.join(dir, 'ref', 'upload' + ext), buf);
    store.log(job, 'capture', '📥 Recibido tu video de referencia');
    return;
  }
  const c = job.clips.find((x) => x.n === n);
  if (!c) throw new Error('Ese clip no existe');
  const tmp = path.join(dir, `upload_tmp${ext}`);
  fs.writeFileSync(tmp, buf);
  if (kind === 'frame') {
    const out = `frames/frame_${pad(n)}.png`;
    await ffmpeg(['-i', tmp, path.join(dir, out)]);
    Object.assign(c, { frame: out, frameStatus: 'done', frameNote: 'Subido por ti', feedback: '', v: Date.now() });
    store.log(job, 'frames', `📥 Frame ${n} subido por ti`);
  } else if (kind === 'clip') {
    const out = `clips/clip_${pad(n)}.mp4`;
    await ffmpeg(['-i', tmp, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-c:a', 'aac', path.join(dir, out)]);
    Object.assign(c, { clip: out, clipStatus: 'done', clipNote: 'Subido por ti', v: Date.now() });
    store.log(job, 'clips', `📥 Clip ${n} subido por ti`);
  }
  fs.unlinkSync(tmp);
  store.save(job);
}

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // api, jobs, id, action, n
  const method = req.method;
  if (parts[1] === 'config') return send(res, 200, { settings: Object.keys(config.settings), avatar: config.avatar, flowMode: config.flowMode });
  if (parts[1] === 'research') {
    const r = research.rjob();
    if (method === 'GET') return send(res, 200, { ...r, running: research.isRunning() });
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    if (parts[2] === 'accounts') {
      r.accounts = (body.accounts || []).map((a) => a.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '')).filter(Boolean);
      store.save(r);
      return send(res, 200, { accounts: r.accounts });
    }
    if (parts[2] === 'run') { research.run(); return send(res, 200, { ok: true }); }
    if (parts[2] === 'stop') return send(res, 200, { ok: claude.stop(research.RID, 'research') });
    return send(res, 404, { error: 'ruta' });
  }
  if (parts[1] !== 'jobs') return send(res, 404, { error: 'ruta' });

  if (parts.length === 2 && method === 'GET') {
    return send(res, 200, store.list().map((j) => ({ id: j.id, title: j.title, stage: j.stage, status: j.status, createdAt: j.createdAt, clips: j.clips.length, auto: !!j.auto })));
  }
  if (parts.length === 2 && method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    if (!body.script) return send(res, 400, { error: 'Falta el guion' });
    const job = store.create(body);
    pipeline.drive(job.id);
    return send(res, 200, job);
  }

  const job = store.load(parts[2]);
  if (!job) return send(res, 404, { error: 'No existe ese video' });
  const action = parts[3];
  if (!action && method === 'GET') return send(res, 200, { ...job, prompts: promptsFor(job), running: pipeline.active.has(job.id) });

  const body = method === 'POST' && action !== 'upload' ? JSON.parse((await readBody(req)).toString() || '{}') : {};
  switch (action) {
    case 'continue':
      if (job.stage === 'review_frames' || job.stage === 'review_final') return send(res, 400, { error: 'Usa los botones de aprobar' });
      pipeline.drive(job.id);
      return send(res, 200, { ok: true });
    case 'pause':
      if (body.worker) job.workers[body.worker].paused = true; else job.paused = true;
      store.save(job);
      return send(res, 200, { ok: true });
    case 'resume':
      if (body.worker) job.workers[body.worker].paused = false; else job.paused = false;
      for (const w of store.WORKERS) if (job.workers[w].state === 'paused' && !job.workers[w].paused && !job.paused) job.workers[w].state = 'idle';
      store.save(job);
      if (!pipeline.active.has(job.id) && !['review_frames', 'review_final', 'done'].includes(job.stage)) pipeline.drive(job.id);
      return send(res, 200, { ok: true });
    case 'stop-all':
      // Parar ya: pausa el video y corta al trabajador que esté en marcha
      job.paused = true;
      store.save(job);
      for (const w of store.WORKERS) claude.stop(job.id, w);
      return send(res, 200, { ok: true });
    case 'stop-worker':
      return send(res, 200, { ok: claude.stop(job.id, body.worker) });
    case 'upload': {
      const buf = await readBody(req);
      await handleUpload(job, url.searchParams.get('kind'), parseInt(url.searchParams.get('n') || '0', 10), decodeURIComponent(req.headers['x-filename'] || ''), buf);
      return send(res, 200, { ok: true });
    }
    case 'clip': {
      const c = job.clips.find((x) => x.n === parseInt(parts[4], 10));
      if (!c) return send(res, 404, { error: 'clip' });
      for (const k of ['line', 'framePrompt', 'clipPrompt', 'feedback']) if (k in body) c[k] = body[k];
      if (body.regenFrame) c.frameStatus = 'regen';
      if (body.keepFrame) { c.frameStatus = 'done'; c.feedback = ''; }
      if (body.copyFrameFrom) {
        const src = job.clips.find((x) => x.n === parseInt(body.copyFrameFrom, 10));
        if (!src || !src.frame) return send(res, 400, { error: 'Ese clip todavía no tiene frame' });
        const dest = `frames/frame_${pad(c.n)}.png`;
        fs.copyFileSync(path.join(store.jobDir(job.id), src.frame), path.join(store.jobDir(job.id), dest));
        Object.assign(c, { frame: dest, frameStatus: 'done', feedback: '', frameNote: `Mismo frame que el clip ${src.n}`, v: Date.now() });
      }
      if (body.freshFrame) Object.assign(c, { frameStatus: 'regen', feedback: '', frame: null, frameNote: 'Se rehace desde cero' });
      if ('regenClip' in body) c.clipStatus = body.regenClip ? 'regen' : (c.clip ? 'done' : c.clipStatus);
      store.save(job);
      return send(res, 200, c);
    }
    case 'plan':
      job.plan = { ...(job.plan || {}), ...(body.hook !== undefined ? { hook: body.hook } : {}), ...(body.ctaWord ? { ctaWord: body.ctaWord.trim().toUpperCase() } : {}) };
      store.save(job);
      return send(res, 200, job.plan);
    case 'approve-frames': {
      if (job.clips.some((c) => !c.frame && c.frameStatus !== 'regen')) return send(res, 400, { error: 'Faltan frames por generar o subir' });
      const regen = job.clips.some((c) => c.frameStatus === 'regen');
      job.stage = regen ? 'frames' : 'clips';
      job.status = 'running';
      store.save(job);
      store.log(job, regen ? 'frames' : 'clips', regen ? '🔁 Rehaciendo los frames que marcaste' : '👍 Frames aprobados por ti');
      pipeline.drive(job.id);
      return send(res, 200, { ok: true });
    }
    case 'final': {
      if (body.action === 'approve') {
        pipeline.finalize(job);
      } else if (body.action === 'regen-clips') {
        job.stage = 'clips';
        job.status = 'running';
      } else {
        if (body.hook !== undefined) job.plan.hook = body.hook;
        job.stage = 'editor';
        job.status = 'running';
      }
      store.save(job);
      if (job.status === 'running') pipeline.drive(job.id);
      return send(res, 200, { ok: true });
    }
  }
  return send(res, 404, { error: 'acción' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/events')) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write('retry: 2000\n\n');
      const on = (id) => res.write(`data: ${id}\n\n`);
      store.bus.on('job', on);
      const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => { store.bus.off('job', on); clearInterval(ping); });
      return;
    }
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname.startsWith('/files/')) {
      const [, , id, ...rest] = url.pathname.split('/');
      const f = safeJoin(store.jobDir(id), decodeURIComponent(rest.join('/')));
      return f ? serveFile(req, res, f) : (res.writeHead(403), res.end());
    }
    if (url.pathname.startsWith('/root/')) {
      const f = safeJoin(store.ROOT, decodeURIComponent(url.pathname.slice(6)));
      const okDirs = ['avatar', 'output', config.outputDir || 'output'];
      if (!f || !okDirs.some((d) => path.relative(store.ROOT, f).startsWith(d + path.sep))) { res.writeHead(403); return res.end(); }
      return serveFile(req, res, f);
    }
    const f = safeJoin(PUB, url.pathname === '/' ? 'index.html' : url.pathname);
    return f ? serveFile(req, res, f) : (res.writeHead(403), res.end());
  } catch (e) {
    console.error(e);
    send(res, 500, { error: e.message });
  }
});

fs.mkdirSync(store.JOBS, { recursive: true });
pipeline.resumeAll();
server.listen(config.port, '127.0.0.1', () => {
  console.log(`\n  Flow Studio abierto en  http://localhost:${config.port}\n  (deja esta ventana abierta mientras trabajas)\n`);
});
