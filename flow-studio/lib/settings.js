// Ajustes que cambias desde el panel (Drive, piloto automático, avisos). No se pisan al actualizar.
const fs = require('fs');
const path = require('path');
const store = require('./store');

const FILE = path.join(store.ROOT, 'memory', 'settings.json');

function get() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}
function save(patch) {
  const s = { ...get(), ...patch };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(s, null, 2));
  return s;
}

// Recordatorios que me pediste apuntar: cada uno se añade una sola vez (si lo marcas como hecho, no vuelve)
const SEED = [
  { id: 1, text: 'Obsidian: conectar Flow Studio (biblioteca de lo que funciona + tu banco de ideas y hooks + lecciones a la vista). Cero créditos.', due: new Date(2026, 10, 18, 11, 0).getTime() },
  { id: 2, text: '¿Lanzar la segunda cuenta? Revisa: 1) Emma hace sus 4 videos diarios sin atascos una semana seguida, 2) 2-3 videos con los formatos nuevos superan 2× tu media (📈 Resultados), 3) te llega el límite de Claude y Flow para el doble o subes de plan. Si se cumplen, dime "vamos con la segunda cuenta".', due: new Date(2026, 10, 16, 11, 0).getTime() },
];
const seeded = new Set(get().remindersSeededIds || (get().remindersSeeded ? [1] : []));
const add = SEED.filter((r) => !seeded.has(r.id));
if (add.length) save({ reminders: [...(get().reminders || []), ...add], remindersSeededIds: [...seeded, ...add.map((r) => r.id)] });

module.exports = { get, save };
