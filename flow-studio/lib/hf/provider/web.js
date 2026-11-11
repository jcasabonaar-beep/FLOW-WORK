// Proveedor "web": maneja higgsfield.ai en el Chrome de Flow Studio (perfil propio, sesión iniciada a mano por ti).
// Usa el mapa de selectores aprendido (memory/higgsfield-selectors.json). Una sola generación a la vez (lib/lock).
// Nunca escribe contraseñas, nunca acepta avisos por ti y nunca pulsa Generar sin ver Unlimited activado.
const fs = require('fs');
const path = require('path');
const config = require('../../../config.json');
const { HfStop, build, one, dump, toText } = require('../locate');
const { loadMap } = require('../selectors');

const PORT = config.chromeDebugPort || 9222;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function pw() {
  try { return require('playwright-core'); } catch { return require('playwright'); }
}

async function connect() {
  await require('../../chrome').ensure();
  const browser = await pw().chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const ctx = browser.contexts()[0];
  if (!ctx) throw new HfStop('No encuentro el perfil del Chrome de Flow Studio');
  return { browser, ctx };
}

// La pestaña de Higgsfield (si no hay, abre una)
async function hfPage(ctx, url) {
  const origin = url ? new URL(url).origin : 'https://higgsfield.ai';
  let page = ctx.pages().find((p) => p.url().startsWith(origin)) || ctx.pages().find((p) => /higgsfield\.ai/.test(p.url()));
  if (!page) page = await ctx.newPage();
  await page.bringToFront();
  if (url && page.url().split('#')[0] !== url) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  return page;
}

// ¿Higgsfield pide algo? (login, verificación, captcha, límites, términos nuevos…) → parar y avisarte
async function blockers(page, map, debugDir) {
  if (/\/(login|signin|sign-in|auth)\b/i.test(page.url())) {
    throw new HfStop('Higgsfield pide iniciar sesión. Entra tú en el Chrome de Flow Studio y pulsa Continuar.', { debug: await dump(page, debugDir, 'login') });
  }
  if (page.frames().some((f) => /captcha|turnstile|challenges\.cloudflare|arkoselabs/i.test(f.url()))) {
    throw new HfStop('Higgsfield pide una verificación (captcha). Resuélvela tú en el Chrome de Flow Studio y pulsa Continuar.', { debug: await dump(page, debugDir, 'captcha') });
  }
  const ignore = map.ignoreDialogs ? toText(map.ignoreDialogs) : null;
  const dialogs = page.getByRole('dialog');
  const n = await dialogs.count();
  for (let i = 0; i < n; i++) {
    const d = dialogs.nth(i);
    if (!(await d.isVisible().catch(() => false))) continue;
    const text = ((await d.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    if (ignore && ignore.test(text)) continue;
    throw new HfStop(`Higgsfield muestra un aviso: "${text.slice(0, 220)}". Resuélvelo tú en el Chrome de Flow Studio (no lo acepto por ti) y pulsa Continuar.`, { debug: await dump(page, debugDir, 'aviso') });
  }
  const body = ((await page.locator('body').innerText().catch(() => '')) || '').slice(0, 20000);
  if (/too many requests|rate limit(ed)?|verify you are human|unusual activity/i.test(body)) {
    throw new HfStop('Higgsfield está limitando o pide verificación. Paro: míralo en el Chrome de Flow Studio y pulsa Continuar cuando esté resuelto.', { debug: await dump(page, debugDir, 'limite') });
  }
}

const fillVars = (s, vars) => (typeof s === 'string' ? s.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m)) : s);
const specVars = (spec, vars) => (spec ? JSON.parse(JSON.stringify(spec), (k, v) => fillVars(v, vars)) : spec);
const textOf = async (loc) => (((await loc.innerText().catch(() => '')) || (await loc.inputValue().catch(() => '')) || (await loc.getAttribute('aria-label').catch(() => '')) || '')).replace(/\s+/g, ' ').trim();

// Un ajuste (modelo, 9:16, batch 1, duración…): lee el botón; si no muestra lo que toca, lo cambia y lo vuelve a comprobar
async function ensureSetting(page, s, vars, opts) {
  const want = toText(fillVars(s.want, vars));
  const m = { button: specVars(s.button, vars), option: specVars(s.option, vars), minus: specVars(s.minus, vars), plus: specVars(s.plus, vars) };
  const btn = await one(page, m, 'button', opts);
  let txt = await textOf(btn);
  if (want.test(txt)) return txt;
  if (m.option) {
    await btn.click();
    await page.waitForTimeout(800);
    const opt = await one(page, m, 'option', opts);
    await opt.click();
    await page.waitForTimeout(1000);
  } else if (m.minus || m.plus) {
    for (let i = 0; i < 12 && !want.test(txt); i++) {
      const target = s.direction === 'up' ? 'plus' : 'minus';
      await (await one(page, m, target, opts)).click();
      await page.waitForTimeout(400);
      txt = await textOf(await one(page, m, 'button', opts));
    }
  }
  txt = await textOf(await one(page, m, 'button', opts));
  if (!want.test(txt)) throw new HfStop(`No consigo poner "${s.name}" en ${want} (se ve "${txt.slice(0, 60)}"). Paro antes de generar.`, { debug: await dump(page, opts.debugDir, 'ajuste-' + s.name) });
  return txt;
}

async function isOn(loc) {
  try { return await loc.isChecked(); } catch {}
  for (const a of ['aria-checked', 'aria-pressed', 'data-state']) {
    const v = await loc.getAttribute(a).catch(() => null);
    if (v != null) return /^(true|checked|on|active)$/i.test(v);
  }
  return null;
}

// Unlimited activado y comprobado. Si no se puede comprobar, NO se genera.
async function ensureUnlimited(page, u, opts, wantOn = true) {
  if (!u || !u.switch) throw new HfStop('El mapa no sabe dónde está el interruptor Unlimited: no genero sin comprobarlo. Pulsa 🎓 Aprender Higgsfield.');
  const sw = await one(page, u, 'switch', opts);
  let on = await isOn(sw);
  if (on === null) throw new HfStop('No sé leer si Unlimited está activado: paro para no gastar créditos.', { debug: await dump(page, opts.debugDir, 'unlimited') });
  if (on !== wantOn) { await sw.click(); await page.waitForTimeout(800); on = await isOn(await one(page, u, 'switch', opts)); }
  if (on !== wantOn) throw new HfStop('No consigo activar Unlimited: paro para no gastar créditos.', { debug: await dump(page, opts.debugDir, 'unlimited') });
}

async function ensureOff(page, spec, name, opts) {
  if (!spec) return;
  const sw = await one(page, { s: spec }, 's', opts);
  let on = await isOn(sw);
  if (on) { await sw.click(); await page.waitForTimeout(600); on = await isOn(await one(page, { s: spec }, 's', opts)); }
  if (on) throw new HfStop(`No consigo desactivar ${name}`, { debug: await dump(page, opts.debugDir, name) });
}

// El coste que muestra junto a Generar: si dice créditos y no Unlimited, no se genera
async function checkCost(page, cost, opts) {
  if (!cost || !cost.spec) return;
  const loc = await one(page, cost, 'spec', { ...opts, timeout: 5000 }).catch(() => null);
  if (!loc) return;
  const t = await textOf(loc);
  if (cost.unlimitedPattern && toText(cost.unlimitedPattern).test(t)) return;
  if (/\d+(\.\d+)?\s*(credits?|créditos|cr\b)/i.test(t) && !/unlimited|free|\b0\b/i.test(t)) {
    throw new HfStop(`Higgsfield dice que esta generación cuesta "${t.slice(0, 60)}": paro para no gastar créditos.`, { debug: await dump(page, opts.debugDir, 'coste') });
  }
}

async function countLoc(page, spec) { return spec ? build(page, spec).count() : 0; }

// Sube las imágenes en el orden exacto (Image 1, Image 2…). Primero quita las que hubiera de antes.
async function uploadInOrder(page, up, files, opts) {
  if (!up || (!up.input && !up.button) || !up.thumb) throw new HfStop('El mapa no sabe subir imágenes o contarlas. Pulsa 🎓 Aprender Higgsfield.');
  if (up.input) await one(page, up, 'input', { ...opts, visible: false }); // abre el panel si está cerrado
  for (let i = 0; i < 12 && (await countLoc(page, up.thumb)) > 0; i++) {
    if (!up.remove) throw new HfStop('Hay imágenes subidas de antes y el mapa no sabe quitarlas.', { debug: await dump(page, opts.debugDir, 'quitar') });
    await build(page, up.remove).first().click();
    await page.waitForTimeout(600);
  }
  if ((await countLoc(page, up.thumb)) > 0) throw new HfStop('No consigo quitar las imágenes de antes', { debug: await dump(page, opts.debugDir, 'quitar') });
  // Abre el panel de subir (si hace falta) antes de contar
  if (up.input) await one(page, up, 'input', { ...opts, visible: false });
  for (let i = 0; i < files.length; i++) {
    if (up.input) {
      await (await one(page, up, 'input', { ...opts, visible: false })).setInputFiles(files[i]);
    } else {
      const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15000 }), (await one(page, up, 'button', opts)).click()]);
      await chooser.setFiles(files[i]);
    }
    const t0 = Date.now();
    while ((await countLoc(page, up.thumb)) < i + 1) {
      if (Date.now() - t0 > 90000) throw new HfStop(`La imagen ${i + 1} no termina de subir`, { debug: await dump(page, opts.debugDir, 'subida') });
      await page.waitForTimeout(1000);
    }
    opts.log && opts.log(`📤 Image ${i + 1} subida: ${path.basename(files[i])}`);
  }
  if ((await countLoc(page, up.thumb)) !== files.length) throw new HfStop('El número de imágenes subidas no cuadra con el prompt', { debug: await dump(page, opts.debugDir, 'subida') });
}

async function setPrompt(page, map, text, opts) {
  const box = await one(page, map, 'prompt', opts);
  await box.click();
  await box.fill('').catch(() => {});
  await box.fill(text).catch(async () => { await page.keyboard.press('Control+A'); await page.keyboard.insertText(text); });
  const got = await textOf(box);
  if (!got.replace(/\s+/g, ' ').includes(text.replace(/\s+/g, ' ').slice(0, 60))) throw new HfStop('El prompt no se ha pegado bien', { debug: await dump(page, opts.debugDir, 'prompt') });
}

// Lo que identifica cada resultado (la dirección de su imagen o vídeo)
async function resultIds(page, res) {
  if (!res || !res.item) throw new HfStop('El mapa no sabe dónde salen los resultados. Pulsa 🎓 Aprender Higgsfield.');
  return build(page, res.item).evaluateAll((els) => els.map((e) => {
    const m = e.matches('img,video') ? e : e.querySelector('video,img');
    return m ? (m.currentSrc || m.src || m.getAttribute('src') || '') : '';
  }));
}

// Espera a que aparezca un resultado nuevo (que no estaba antes de pulsar Generar) y esté cargado
async function waitNew(page, map, before, { timeoutMs, kind, opts }) {
  const t0 = Date.now();
  const seen = new Set(before);
  let candidate = null, stable = 0, lastReload = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    await blockers(page, map, opts.debugDir);
    const ids = await resultIds(page, map.results);
    const fresh = ids.map((id, i) => ({ id, i })).filter((x) => x.id && /^https?:/.test(x.id) && !seen.has(x.id) && (kind === 'video' ? /\.(mp4|webm|mov)(\?|$)|video/i.test(x.id) : true));
    if (fresh.length) {
      if (candidate && candidate.id === fresh[0].id) stable++; else { candidate = fresh[0]; stable = 0; }
      if (stable >= 1) return candidate;
    }
    const mins = Math.round((Date.now() - t0) / 60000);
    if (opts.progress) opts.progress(`Esperando el resultado de Higgsfield (${mins} min)…`);
    await page.waitForTimeout(kind === 'video' ? 15000 : 5000);
    // Cada 5 minutos recarga por si la página se queda congelada (la generación sigue en Higgsfield)
    if (Date.now() - lastReload > 300000) {
      lastReload = Date.now();
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(4000);
    }
  }
  throw new HfStop(`Higgsfield no ha terminado en ${Math.round(timeoutMs / 60000)} min. Sigue en su cola: pulsa Continuar más tarde y lo recojo sin generar otra vez.`, { pending: true, debug: await dump(page, opts.debugDir, 'tarda') });
}

// Descarga a resolución completa: con su botón de descarga si el mapa lo tiene; si no, el archivo original de su dirección
async function download(page, map, item, out, opts) {
  const res = map.results;
  if (res.download) {
    const itemLoc = build(page, res.item).nth(item.i);
    await itemLoc.scrollIntoViewIfNeeded().catch(() => {});
    await itemLoc.hover().catch(() => {});
    if (res.open) { await itemLoc.click(); await page.waitForTimeout(1500); }
    const scope = res.open ? page : itemLoc;
    const dl = build(scope, res.download);
    const n = await dl.count();
    if (n >= 1) {
      const [d] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), dl.first().click()]);
      await d.saveAs(out);
      if (res.close) await build(page, res.close).first().click().catch(() => {});
      else if (res.open) await page.keyboard.press('Escape').catch(() => {});
      return { via: 'botón de descarga' };
    }
    if (res.open) await page.keyboard.press('Escape').catch(() => {});
  }
  const r = await page.context().request.get(item.id, { timeout: 300000 });
  if (!r.ok()) throw new HfStop(`No pude descargar el resultado (${r.status()})`);
  fs.writeFileSync(out, await r.body());
  return { via: 'dirección del archivo' };
}

/**
 * Genera una imagen con Nano Banana Pro (Unlimited, 9:16, batch 1).
 * o: { prompt, images: [rutas en el orden del prompt], out, debugDir, log, progress, onSubmitted(before), resume: { before } }
 */
async function generateImage(o) {
  const map = loadMap().image;
  if (!map) throw new HfStop('Todavía no he aprendido la pantalla de imagen de Higgsfield. Pulsa 🎓 Aprender Higgsfield.');
  const { browser, ctx } = await connect();
  const opts = { debugDir: o.debugDir, log: o.log, progress: o.progress };
  try {
    const page = await hfPage(ctx, map.url);
    await blockers(page, map, o.debugDir);
    let before;
    if (o.resume && o.resume.before) {
      before = o.resume.before;
      o.log && o.log('↪️ Retomo una generación que ya había mandado: busco su resultado sin generar otra vez');
    } else {
      for (const s of map.settings || []) o.log && o.log(`⚙️ ${s.name}: ${await ensureSetting(page, s, {}, opts)}`);
      await ensureUnlimited(page, map.unlimited, opts);
      o.log && o.log('♾️ Unlimited activado');
      await uploadInOrder(page, map.upload, o.images, opts);
      await setPrompt(page, map, o.prompt, opts);
      await checkCost(page, map.cost, opts);
      await ensureUnlimited(page, map.unlimited, opts); // otra vez, justo antes de generar
      await blockers(page, map, o.debugDir);
      before = await resultIds(page, map.results);
      await (await one(page, map, 'generate', opts)).click();
      if (o.onSubmitted) await o.onSubmitted(before); // apuntado: si algo se corta, se retoma sin generar otra vez
      o.log && o.log('🚀 Generando en Higgsfield…');
    }
    const item = await waitNew(page, map, before, { timeoutMs: (config.higgsfield.imageTimeoutMin || 20) * 60000, kind: 'image', opts });
    const how = await download(page, map, item, o.out, opts);
    o.log && o.log(`⬇️ Descargada (${how.via})`);
    return { out: o.out, source: item.id };
  } finally {
    await browser.close().catch(() => {}); // solo se desconecta: el Chrome sigue abierto
  }
}

// Comprueba el mapa sin generar nada: abre cada pantalla y busca cada control
async function check() {
  const full = loadMap();
  const { browser, ctx } = await connect();
  const report = [];
  try {
    for (const kind of ['image', 'video']) {
      const map = full[kind];
      if (!map) { report.push({ kind, key: '(pantalla)', ok: false, msg: 'sin aprender' }); continue; }
      const page = await hfPage(ctx, map.url);
      try { await blockers(page, map); } catch (e) { report.push({ kind, key: 'avisos', ok: false, msg: e.message }); continue; }
      const specs = [];
      for (const s of map.settings || []) specs.push([`ajuste ${s.name}`, s.button]);
      if (map.unlimited) specs.push(['unlimited', map.unlimited.switch]);
      if (map.audio) specs.push(['audio', map.audio]);
      if (map.upload) specs.push(['subir', map.upload.input || map.upload.button]);
      for (const k of ['startInput', 'endInput']) if (map.upload && map.upload[k]) specs.push([k, map.upload[k]]);
      specs.push(['prompt', map.prompt], ['generar', map.generate]);
      for (const [key, spec] of specs) {
        try {
          let n = await build(page, spec).count();
          if (!n && spec && spec.reveal) { try { await (await one(page, { r: spec.reveal }, 'r', { timeout: 8000 })).click(); await page.waitForTimeout(1200); n = await build(page, spec).count(); } catch {} }
          report.push({ kind, key, ok: n >= 1, msg: n >= 1 ? (n > 1 ? `${n} coincidencias` : 'ok') : 'no aparece' });
        } catch (e) { report.push({ kind, key, ok: false, msg: e.message }); }
      }
      try { const ids = await resultIds(page, map.results); report.push({ kind, key: 'resultados', ok: true, msg: `${ids.length} en pantalla` }); } catch (e) { report.push({ kind, key: 'resultados', ok: false, msg: e.message }); }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return report;
}

module.exports = { generateImage, check, blockers, connect, hfPage, ensureSetting, ensureUnlimited, ensureOff, uploadInOrder, setPrompt, checkCost, resultIds, waitNew, download };
