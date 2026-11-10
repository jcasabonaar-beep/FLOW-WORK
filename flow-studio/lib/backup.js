// 💾 Copia de seguridad de lo que el sistema ha aprendido (cada día, en tu Google Drive). Se guardan los últimos 7 días.
const fs = require('fs');
const path = require('path');
const store = require('./store');
const settings = require('./settings');

// Lo que no se puede volver a generar: lecciones, memoria de lo que funciona, ajustes, resultados, ideas, piloto, avatar ideal y fotos de la familia
const ITEMS = ['memory', 'avatar/family', 'avatar_lab', 'jobs/_resultados/job.json', 'jobs/_investigador/job.json', 'jobs/_piloto/job.json', 'jobs/_avatar/job.json'];

function copy(src, dest) {
  if (!fs.existsSync(src)) return 0;
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    return fs.readdirSync(src).reduce((n, f) => n + copy(path.join(src, f), path.join(dest, f)), 0);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return 1;
}

function folder() {
  const s = settings.get();
  return s.driveFolder ? path.join(s.driveFolder, s.driveSubfolder || 'Videos IA', '_memoria') : null;
}

function run() {
  const root = folder();
  if (!root) return { error: 'Activa primero Google Drive en Ajustes' };
  if (!fs.existsSync(settings.get().driveFolder)) return { error: 'No encuentro tu Google Drive (¿está abierto Google Drive para ordenador?)' };
  const day = new Date().toISOString().slice(0, 10);
  const dest = path.join(root, day);
  let n = 0;
  for (const it of ITEMS) n += copy(path.join(store.ROOT, it), path.join(dest, it));
  // Solo los últimos 7 días
  const old = fs.readdirSync(root).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse().slice(7);
  for (const d of old) fs.rmSync(path.join(root, d), { recursive: true, force: true });
  settings.save({ lastBackup: { at: Date.now(), files: n, folder: dest } });
  return { ok: true, files: n, folder: dest };
}

// Recupera la copia más reciente (por si se pierde la carpeta o cambias de PC)
function restore() {
  const root = folder();
  if (!root || !fs.existsSync(root)) return { error: 'No hay copias en tu Drive' };
  const last = fs.readdirSync(root).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().pop();
  if (!last) return { error: 'No hay copias en tu Drive' };
  let n = 0;
  for (const it of ITEMS) n += copy(path.join(root, last, it), path.join(store.ROOT, it));
  return { ok: true, files: n, from: last };
}

// Una vez al día, de madrugada (a partir de las 5:00), sin molestar
function daily() {
  const s = settings.get();
  const today = new Date().toDateString();
  if (new Date().getHours() < 5 || (s.lastBackup && new Date(s.lastBackup.at).toDateString() === today) || !s.driveFolder) return;
  const r = run();
  if (r.error) require('./notify').send('⚠️ Copia de seguridad', r.error, { key: 'backup', every: 720, tags: 'warning' });
}

module.exports = { run, restore, daily };
