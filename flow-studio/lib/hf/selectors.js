// Mapa de selectores de Higgsfield (lo crea el modo aprendizaje). Vive en memory/ para no perderse al actualizar.
const fs = require('fs');
const path = require('path');
const store = require('../store');

const FILE = path.join(store.ROOT, 'memory', 'higgsfield-selectors.json');
const KINDS = ['role', 'text', 'label', 'placeholder', 'testid', 'file'];

function loadMap() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}

// Revisa que el mapa use solo roles y textos visibles (nada de clases CSS) y que tenga lo imprescindible
function validate(map) {
  const errors = [];
  const isSpec = (s, where) => {
    if (!s || typeof s !== 'object') return errors.push(`${where}: falta`);
    if (s.css || s.xpath || s.selector) errors.push(`${where}: usa CSS/XPath (no permitido)`);
    if (!KINDS.some((k) => s[k])) errors.push(`${where}: sin rol ni texto`);
    if (s.within) isSpec(s.within, where + '.within');
  };
  for (const kind of ['image', 'video']) {
    const m = map[kind];
    if (!m) { errors.push(`${kind}: sin aprender`); continue; }
    if (!/^https:\/\/([\w-]+\.)?higgsfield\.ai\//.test(m.url || '')) errors.push(`${kind}.url no es de higgsfield.ai`);
    for (const s of m.settings || []) { isSpec(s.button, `${kind}.${s.name}.button`); if (!s.want) errors.push(`${kind}.${s.name}: falta "want"`); if (s.option) isSpec(s.option, `${kind}.${s.name}.option`); }
    isSpec(m.unlimited && m.unlimited.switch, `${kind}.unlimited.switch`);
    isSpec(m.prompt, `${kind}.prompt`);
    isSpec(m.generate, `${kind}.generate`);
    isSpec(m.results && m.results.item, `${kind}.results.item`);
    if (kind === 'image') { isSpec(m.upload && (m.upload.input || m.upload.button), 'image.upload'); isSpec(m.upload && m.upload.thumb, 'image.upload.thumb'); }
    if (kind === 'video') { isSpec(m.upload && m.upload.startInput, 'video.upload.startInput'); isSpec(m.upload && m.upload.endInput, 'video.upload.endInput'); }
    const names = (m.settings || []).map((s) => s.name);
    for (const need of kind === 'image' ? ['model', 'aspect', 'batch'] : ['model', 'aspect', 'duration']) if (!names.includes(need)) errors.push(`${kind}: falta el ajuste "${need}"`);
  }
  return errors;
}

function saveMap(map) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(map, null, 2));
}

module.exports = { FILE, loadMap, saveMap, validate };
