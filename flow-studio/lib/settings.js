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

// Recordatorios que me pediste apuntar (se añaden una sola vez)
const SEED = [{ id: 1, text: 'Obsidian: conectar Flow Studio (biblioteca de lo que funciona + tu banco de ideas y hooks + lecciones a la vista). Cero créditos.', due: new Date(2026, 10, 18, 11, 0).getTime() }];
if (!get().remindersSeeded) save({ reminders: [...(get().reminders || []), ...SEED], remindersSeeded: true });

module.exports = { get, save };
