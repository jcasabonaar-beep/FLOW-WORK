// Comprueba el mapa de Higgsfield sin generar nada (y, con --test-image, hace UNA imagen de prueba en Unlimited)
// Uso: node tools/hf-check.js [--test-image]
const fs = require('fs');
const path = require('path');
const store = require('../lib/store');
const config = require('../config.json');
const { loadMap, validate, FILE } = require('../lib/hf/selectors');
const web = require('../lib/hf/provider/web');

async function main() {
  const map = loadMap();
  if (!Object.keys(map).length) throw new Error(`No hay mapa todavía (${FILE})`);
  if (map.blocked) throw new Error('El aprendizaje se paró: ' + map.blocked);
  const errs = validate(map);
  for (const e of errs) console.log('✗ formato: ' + e);
  const report = await web.check();
  for (const r of report) console.log(`${r.ok ? '✓' : '✗'} ${r.kind} · ${r.key}: ${r.msg}`);
  const bad = errs.length + report.filter((r) => !r.ok).length;
  console.log(bad ? `\n${bad} problema(s)` : '\nMapa correcto');
  if (!process.argv.includes('--test-image')) return process.exit(bad ? 2 : 0);
  if (bad) throw new Error('Arregla primero los problemas del mapa');
  const dir = path.join(store.ROOT, 'memory', 'higgsfield-learn');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, 'test.png');
  const prompt = `Use Image 1 for the woman's identity: face, facial features, skin, silver-grey hair color and body. ${config.higgsfield.identity} She stands in a bright, calm living room, relaxed, smiling softly at the camera, hands resting at her sides. Framing, vertical 9:16: waist-up, centered, her eyes at about one third from the top. Shot on iPhone 15 main camera, 24mm f/1.9, on a tripod at chest height. Soft natural daylight, natural sensor grain, real skin texture with visible pores. No text, captions, emojis, logos or watermarks.`;
  await web.generateImage({ prompt, images: [path.join(store.ROOT, config.higgsfield.avatar.main)], out, debugDir: dir, log: (m) => console.log(m), progress: () => {} });
  const { out: probe } = await require('../lib/ff').exec('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', out]);
  console.log(`✓ Imagen de prueba descargada: ${out} (${probe.trim()} px)`);
}

main().catch((e) => { console.log('✗ ' + e.message + (e.debug ? `\n  captura: ${e.debug}.png` : '')); process.exit(1); });
