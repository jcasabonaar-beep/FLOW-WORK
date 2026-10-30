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

const today = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`; };
const clean = (n) => String(n || '').replace(/\.mp4$/i, '').replace(/[\\/:*?"<>|]/g, '').trim();

function target() {
  const dest = folder();
  if (!dest) return null;
  const root = settings().driveFolder;
  if (!fs.existsSync(root)) throw new Error(`No encuentro tu Google Drive en ${root} (¿está abierto Google Drive para ordenador?)`);
  fs.mkdirSync(dest, { recursive: true });
  return dest;
}

// Siguiente nombre libre del día: automáticos con "IA" (1-30102026IA), manuales sin ella (3-30102026). Comparten el contador.
function nextName(auto = true) {
  const dest = folder();
  const day = today();
  const taken = dest && fs.existsSync(dest) ? fs.readdirSync(dest).map((f) => f.match(new RegExp(`^(\\d+)-${day}(IA)?\\.mp4$`))).filter(Boolean).map((m) => +m[1]) : [];
  return `${(taken.length ? Math.max(...taken) : 0) + 1}-${day}${auto ? 'IA' : ''}`;
}

const parts = (base) => [[base + '.mp4'], [base + '-texto.txt'], [base + '-portada.jpg']].map((x) => x[0]);

function upload(job, name) {
  const dest = target();
  if (!dest) return null;
  const base = clean(name) || nextName(!name);
  if (fs.existsSync(path.join(dest, base + '.mp4'))) throw new Error(`Ya hay un video llamado ${base} en tu Drive`);
  fs.copyFileSync(path.join(store.jobDir(job.id), job.output), path.join(dest, base + '.mp4'));
  const k = job.kit || {};
  if (k.caption) fs.writeFileSync(path.join(dest, base + '-texto.txt'), [k.caption, '', k.hashtags || '', k.disclosure ? '\n' + k.disclosure : ''].join('\n'));
  if (k.cover && fs.existsSync(path.join(store.jobDir(job.id), k.cover))) fs.copyFileSync(path.join(store.jobDir(job.id), k.cover), path.join(dest, base + '-portada.jpg'));
  return base;
}

// Cambia el nombre de un video ya subido (y de su texto y portada)
function rename(job, name) {
  const dest = target();
  const base = clean(name);
  if (!dest || !base || !job.driveName) return null;
  if (base === job.driveName) return base;
  if (!fs.existsSync(path.join(dest, job.driveName + '.mp4'))) return upload(job, base);
  if (fs.existsSync(path.join(dest, base + '.mp4'))) throw new Error(`Ya hay un video llamado ${base} en tu Drive`);
  const from = parts(job.driveName), to = parts(base);
  from.forEach((f, i) => { if (fs.existsSync(path.join(dest, f))) fs.renameSync(path.join(dest, f), path.join(dest, to[i])); });
  return base;
}

module.exports = { settings, saveSettings, detect, folder, nextName, upload, rename };
