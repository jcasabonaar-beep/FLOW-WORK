// Mueve el último archivo descargado desde Chrome/Flow al destino indicado.
// Uso: node grab-latest.js "<destino>"
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const dest = process.argv[2];
if (!dest) { console.log('USO: node grab-latest.js <destino>'); process.exit(1); }

const dirs = [path.join(ROOT, 'downloads'), path.join(ROOT, 'tools', 'pw-output')];
const exts = /\.(png|jpe?g|webp|mp4|mov|webm)$/i;
const since = Date.now() - 15 * 60 * 1000;

let best = null;
for (const d of dirs) {
  if (!fs.existsSync(d)) continue;
  const walk = (dir, depth) => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      let st; try { st = fs.statSync(p); } catch { continue; }
      if (st.isDirectory() && depth < 2) walk(p, depth + 1);
      else if (st.isFile() && exts.test(f) && st.mtimeMs > since && (!best || st.mtimeMs > best.t)) best = { p, t: st.mtimeMs };
    }
  };
  walk(d, 0);
}
if (!best) { console.log('NOFILE: no hay descargas recientes'); process.exit(0); }

fs.mkdirSync(path.dirname(dest), { recursive: true });
const srcExt = path.extname(best.p).toLowerCase();
const dstExt = path.extname(dest).toLowerCase();
if (srcExt === dstExt || (srcExt === '.jpeg' && dstExt === '.jpg')) {
  fs.copyFileSync(best.p, dest);
} else {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', best.p, dest]);
}
fs.unlinkSync(best.p);
console.log('OK ' + path.basename(best.p) + ' -> ' + dest);
