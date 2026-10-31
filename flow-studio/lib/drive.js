// Sube los videos terminados a Google Drive (a través de la carpeta de "Google Drive para ordenador")
// Nombre: <nº del día>-<DDMMYYYY>IA.mp4  →  1-30102026IA.mp4, 2-30102026IA.mp4…
const fs = require('fs');
const path = require('path');
const store = require('./store');

const { get: settings, save: saveSettings } = require('./settings');

// Busca dónde ha montado Windows tu Google Drive
function detect() {
  const out = [];
  for (const d of 'DEFGHIJKLMNOPQRSTUVWXYZ') {
    for (const sub of ['Mi unidad', 'My Drive']) {
      const p = `${d}:\\${sub}`;
      try { if (fs.existsSync(p)) out.push(p); } catch {}
    }
  }
  return out;
}

function folder() {
  const s = settings();
  return s.driveFolder ? path.join(s.driveFolder, s.driveSubfolder || 'Videos IA') : null;
}

const dayFolder = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`; };
const today = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`; };
const clean = (n) => String(n || '').replace(/\.mp4$/i, '').replace(/[\\/:*?"<>|]/g, '').trim();

function target() {
  const dest = folder();
  if (!dest) return null;
  const root = settings().driveFolder;
  if (!fs.existsSync(root)) throw new Error(`No encuentro tu Google Drive en ${root} (¿está abierto Google Drive para ordenador?)`);
  const day = path.join(dest, dayFolder()); // Videos IA/30-10-2026/
  fs.mkdirSync(day, { recursive: true });
  return day;
}

// Dentro de cada día, los videos van solos en "Videos" (para cogerlos directamente); texto y portada se quedan en la carpeta del día
const VIDEOS = 'Videos';
const where = (dest, f) => (f.endsWith('.mp4') ? path.join(dest, VIDEOS, f) : path.join(dest, f));
// Los subidos antes de este cambio tienen el video suelto en la carpeta del día
const find = (dest, f) => [where(dest, f), path.join(dest, f)].find((x) => fs.existsSync(x));

// Siguiente nombre libre del día: automáticos con "IA" (1-30102026IA), manuales sin ella (3-30102026). Comparten el contador.
function nextName(auto = true) {
  const dest = folder() && path.join(folder(), dayFolder());
  const day = today();
  const files = dest ? [dest, path.join(dest, VIDEOS)].filter((d) => fs.existsSync(d)).flatMap((d) => fs.readdirSync(d)) : [];
  const taken = files.map((f) => f.match(new RegExp(`^(\\d+)-${day}(IA)?\\.mp4$`))).filter(Boolean).map((m) => +m[1]);
  return `${(taken.length ? Math.max(...taken) : 0) + 1}-${day}${auto ? 'IA' : ''}`;
}

const parts = (base) => [base + '.mp4', base + '-B.mp4', base + '-texto.txt', base + '-portada.jpg'];

function upload(job, name, into) {
  const dest = into || target();
  if (!dest) return null;
  fs.mkdirSync(path.join(dest, VIDEOS), { recursive: true });
  const base = clean(name) || nextName(!name);
  if (find(dest, base + '.mp4')) throw new Error(`Ya hay un video llamado ${base} en tu Drive`);
  fs.copyFileSync(path.join(store.jobDir(job.id), job.output), where(dest, base + '.mp4'));
  job.driveDir = dest;
  if (job.outputB && fs.existsSync(path.join(store.jobDir(job.id), job.outputB))) fs.copyFileSync(path.join(store.jobDir(job.id), job.outputB), where(dest, base + '-B.mp4'));
  const k = job.kit || {};
  if (k.caption) fs.writeFileSync(where(dest, base + '-texto.txt'), require('./kit').driveText(k));
  if (k.cover && fs.existsSync(path.join(store.jobDir(job.id), k.cover))) fs.copyFileSync(path.join(store.jobDir(job.id), k.cover), where(dest, base + '-portada.jpg'));
  return base;
}

// Video rehecho: sustituye los archivos en Drive con el mismo nombre y en la misma carpeta (no gasta un número nuevo)
function replace(job) {
  const dest = job.driveDir && fs.existsSync(job.driveDir) ? job.driveDir : null;
  if (!dest || !job.driveName) return upload(job);
  for (const f of parts(job.driveName)) { const old = find(dest, f); if (old) fs.rmSync(old, { force: true }); }
  return upload(job, job.driveName, dest);
}

// Cambia el nombre de un video ya subido (y de su versión B, texto y portada)
function rename(job, name) {
  // En la carpeta donde se subió (puede ser de otro día)
  const dest = job.driveDir && fs.existsSync(job.driveDir) ? job.driveDir : target();
  const base = clean(name);
  if (!dest || !base || !job.driveName) return null;
  if (base === job.driveName) return base;
  if (!find(dest, job.driveName + '.mp4')) return upload(job, base);
  if (find(dest, base + '.mp4')) throw new Error(`Ya hay un video llamado ${base} en tu Drive`);
  fs.mkdirSync(path.join(dest, VIDEOS), { recursive: true });
  const from = parts(job.driveName), to = parts(base);
  from.forEach((f, i) => { const src = find(dest, f); if (src) fs.renameSync(src, where(dest, to[i])); });
  return base;
}

module.exports = { settings, saveSettings, detect, folder, nextName, upload, rename, replace };
