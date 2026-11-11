// Google Doc con la descripción (para que los emojis lleguen intactos al iPhone), creado en el Chrome de Flow Studio
// con la cuenta de Google que ya tiene abierta. Sin contraseñas ni API: si Google pide algo, no se fuerza.
const { connect } = require('./provider/web');

async function createDoc({ title, text, log }) {
  const { browser, ctx } = await connect();
  const page = await ctx.newPage();
  try {
    await page.goto('https://docs.new', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForURL(/docs\.google\.com\/document\/d\/|accounts\.google\.com/, { timeout: 60000 });
    if (/accounts\.google\.com/.test(page.url())) throw new Error('Google pide iniciar sesión en el Chrome de Flow Studio');
    await page.waitForTimeout(4000);
    // Título
    const titleBox = page.getByRole('textbox', { name: /rename|cambiar nombre|nombre del documento|document name/i }).first();
    if (await titleBox.count()) {
      await titleBox.click();
      await titleBox.fill(title);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1200);
    }
    // Cuerpo: clic en la página del documento y escribir línea a línea (los emojis van tal cual)
    await page.locator('.kix-appview-editor').first().click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(800);
    const lines = String(text).split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]) await page.keyboard.insertText(lines[i]);
      if (i < lines.length - 1) await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(4000); // que Docs guarde
    const url = page.url().replace(/[?#].*$/, '');
    // Comprobación: copia todo el documento y mira que esté el texto (si no se puede leer el portapapeles, se avisa)
    let verified = null;
    try {
      await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://docs.google.com' });
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Control+C');
      await page.waitForTimeout(800);
      const got = await page.evaluate(() => navigator.clipboard.readText());
      const norm = (x) => x.replace(/\s+/g, ' ').trim();
      verified = norm(got).includes(norm(lines.slice(-1)[0] || '')) && norm(got).includes(norm(lines[0] || ''));
    } catch {}
    if (verified === false) throw new Error('el Doc se creó pero el texto no llegó entero (' + url + ')');
    log && log('📄 Google Doc creado' + (verified ? ' y comprobado' : '') + ': ' + url);
    return url;
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

module.exports = { createDoc };
