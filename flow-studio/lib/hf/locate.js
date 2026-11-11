// Encuentra los controles de Higgsfield con el mapa de selectores aprendido (roles y textos visibles, nunca clases CSS).
// Si un control no aparece, o aparece más de uno, NO se clica: se guarda captura + HTML y se para.
const fs = require('fs');
const path = require('path');

class HfStop extends Error {
  constructor(msg, extra = {}) { super(msg); this.noRetry = true; Object.assign(this, extra); }
}

// spec: { role, name, exact } | { text, exact } | { label } | { placeholder } | { testid } | { file: true } (input de subir archivos)
// Opcional: within (otro spec que lo contiene), nth (si hay varios iguales y el mapa dice cuál), why (para qué sirve)
function build(root, spec) {
  if (!spec || typeof spec !== 'object') throw new HfStop('Selector vacío en el mapa');
  let base = root;
  if (spec.within) base = build(root, spec.within).first();
  const opt = (x) => ({ exact: !!spec.exact, ...x });
  let loc;
  if (spec.role) loc = base.getByRole(spec.role, spec.name ? opt({ name: toText(spec.name) }) : {});
  else if (spec.text) loc = base.getByText(toText(spec.text), { exact: !!spec.exact });
  else if (spec.label) loc = base.getByLabel(toText(spec.label), { exact: !!spec.exact });
  else if (spec.placeholder) loc = base.getByPlaceholder(toText(spec.placeholder), { exact: !!spec.exact });
  else if (spec.testid) loc = base.getByTestId(spec.testid);
  else if (spec.file) loc = base.locator('input[type=file]');
  else throw new HfStop('Selector sin rol ni texto en el mapa: ' + JSON.stringify(spec));
  if (Number.isInteger(spec.nth)) loc = loc.nth(spec.nth);
  return loc;
}
// "/regex/i" en el mapa → RegExp
function toText(s) {
  const m = typeof s === 'string' && s.match(/^\/(.+)\/([a-z]*)$/);
  return m ? new RegExp(m[1], m[2]) : s;
}

async function dump(page, debugDir, tag) {
  if (!debugDir) return null;
  fs.mkdirSync(debugDir, { recursive: true });
  const base = path.join(debugDir, `${Date.now()}-${tag.replace(/[^\w-]+/g, '_').slice(0, 40)}`);
  try { await page.screenshot({ path: base + '.png', fullPage: false }); } catch {}
  try { fs.writeFileSync(base + '.html', await page.content()); } catch {}
  return base;
}

// Devuelve el único elemento visible que cumple el spec (espera hasta timeout)
async function one(page, map, key, { debugDir, timeout = 15000, visible = true } = {}) {
  const spec = map[key];
  if (!spec) throw new HfStop(`El mapa de Higgsfield no tiene "${key}". Pulsa 🎓 Aprender Higgsfield.`);
  const loc = build(page, spec);
  const t0 = Date.now();
  let n = 0, revealed = false;
  while (Date.now() - t0 < timeout) {
    n = await loc.count();
    // Controles que solo aparecen al abrir un panel o pestaña: se pulsa "reveal" una vez, y solo si no están
    if (!n && spec.reveal && !revealed && Date.now() - t0 > 1500) {
      revealed = true;
      const r = await one(page, { reveal: spec.reveal }, 'reveal', { debugDir, timeout: 10000 });
      await r.click();
      await page.waitForTimeout(1200);
      continue;
    }
    if (n >= 1) {
      if (!visible || spec.file) return n === 1 || Number.isInteger(spec.nth) ? loc : loc.first();
      const vis = [];
      for (let i = 0; i < n; i++) if (await loc.nth(i).isVisible()) vis.push(i);
      if (vis.length === 1) return loc.nth(vis[0]);
      if (vis.length > 1) {
        const d = await dump(page, debugDir, 'varios-' + key);
        throw new HfStop(`Hay ${vis.length} controles que encajan con "${key}" (${spec.why || ''}): no clico a ciegas.`, { debug: d });
      }
    }
    await page.waitForTimeout(500);
  }
  const d = await dump(page, debugDir, 'falta-' + key);
  throw new HfStop(`No encuentro "${key}" (${spec.why || JSON.stringify(spec)}) en Higgsfield. Quizá cambió la web: pulsa 🎓 Aprender Higgsfield otra vez.`, { debug: d });
}

module.exports = { HfStop, build, one, dump, toText };
