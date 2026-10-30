// Sube los videos terminados a Google Drive (a través de la carpeta de "Google Drive para ordenador")
// Nombre: <nº del día>-<DDMMYYYY>IA.mp4  →  1-30102026IA.mp4, 2-30102026IA.mp4…
const fs = require('fs');
const path = require('path');
const store = require('./store');

const FILE = path.join(store.ROOT, 'memory', 'settings.json');

function settings() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}
function saveSettings(patch) {
  const s = { ...settings(), ...patch };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(s, null, 2));
  return s;
}

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

function upload(job) {
  const dest = folder();
  if (!dest) return null;
  const root = settings().driveFolder;
  if (!fs.existsSync(root)) throw new Error(`No encuentro tu Google Drive en ${root} (¿está abierto Google Drive para ordenador?)`);
  fs.mkdirSync(dest, { recursive: true });
  const d = new Date();
  const day = `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`;
  const taken = fs.readdirSync(dest).map((f) => f.match(new RegExp(`^(\\d+)-${day}IA\\.mp4$`))).filter(Boolean).map((m) => +m[1]);
  const n = (taken.length ? Math.max(...taken) : 0) + 1;
  const base = `${n}-${day}IA`;
  fs.copyFileSync(path.join(store.jobDir(job.id), job.output), path.join(dest, base + '.mp4'));
  const k = job.kit || {};
  if (k.caption) fs.writeFileSync(path.join(dest, base + '-texto.txt'), [k.caption, '', k.hashtags || '', k.disclosure ? '\n' + k.disclosure : ''].join('\n'));
  if (k.cover && fs.existsSync(path.join(store.jobDir(job.id), k.cover))) fs.copyFileSync(path.join(store.jobDir(job.id), k.cover), path.join(dest, base + '-portada.jpg'));
  return base;
}

module.exports = { settings, saveSettings, detect, folder, upload };
