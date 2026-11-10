// Prueba suelta de cada etapa del pipeline Higgsfield (sin abrir el panel)
// Uso:
//   node tools/hf-test.js capture <link del reel | ruta a un .mp4>   → crea un trabajo y descarga + saca frames y hojas
//   node tools/hf-test.js analysis <id del trabajo>                 → análisis con Claude
//   node tools/hf-test.js correct <id del trabajo> "<corrección>"    → rehace el análisis aplicando tu corrección
// Los trabajos creados así salen también en el panel.
const fs = require('fs');
const path = require('path');
const store = require('../lib/store');

const [cmd, arg, extra] = process.argv.slice(2);

async function main() {
  if (cmd === 'capture') {
    if (!arg) throw new Error('Falta el link o el archivo');
    const isFile = fs.existsSync(arg);
    const job = store.create({ kind: 'higgsfield', title: 'Prueba ' + (isFile ? path.basename(arg) : arg.slice(-20)), url: isFile ? '' : arg });
    if (isFile) fs.copyFileSync(arg, path.join(store.jobDir(job.id), 'ref', 'upload' + path.extname(arg)));
    const r = await require('../workers/hf_capture').run(job);
    if (r === 'wait') throw new Error(job.workers.hf_capture.action);
    job.workers.hf_capture.state = 'done'; job.workers.hf_capture.action = '';
    job.stage = 'analysis'; job.status = 'stopped'; job.error = 'Prueba de la etapa 1: pulsa Continuar para el análisis'; store.save(job);
    console.log(`\nTrabajo ${job.id}: ${job.hf.refDuration} s, ${job.hf.frames.length} frames, ${job.hf.scenes.length} cortes`);
    console.log('Hojas de contactos:\n' + job.hf.sheets.map((s) => '  ' + path.join(store.jobDir(job.id), s)).join('\n'));
    console.log(job.hf.description ? `Descripción: ${job.hf.description.slice(0, 200)}…` : 'Sin descripción original');
    console.log(`\nSiguiente: node tools/hf-test.js analysis ${job.id}`);
    return;
  }
  if (cmd === 'analysis' || cmd === 'correct') {
    const job = store.load(arg);
    if (!job || job.kind !== 'higgsfield') throw new Error('No encuentro ese trabajo Higgsfield');
    if (cmd === 'correct') { if (!extra) throw new Error('Falta la corrección'); job.hf.corrections.push({ at: Date.now(), text: extra }); }
    await require('../workers/hf_analyst').run(job);
    job.workers.hf_analyst.state = 'done'; job.workers.hf_analyst.action = '';
    job.stage = 'review_analysis'; job.status = 'waiting_you'; job.error = null; store.save(job);
    console.log(JSON.stringify(job.hf.analysis, null, 2));
    if (job.hf.warnings.length) console.log('\nAvisos:\n- ' + job.hf.warnings.join('\n- '));
    console.log('\nFrames base de los keyframes:\n' + job.hf.analysis.keyframes.items.map((k) => `  ${k.role}: ${path.join(store.jobDir(job.id), k.ref_file)}`).join('\n'));
    return;
  }
  console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 7).join('\n'));
}

main().catch((e) => { console.error('❌ ' + e.message); process.exit(1); });
