// Ayudantes de ffmpeg / ffprobe
const { spawn } = require('child_process');

function exec(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true, ...opts });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => code === 0 ? resolve({ out, err }) : reject(new Error(`${cmd} falló (${code}): ${err.slice(-1500)}`)));
  });
}

const ffmpeg = (args, opts) => exec('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], opts);

async function duration(file) {
  const { out } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  return parseFloat(out.trim());
}

async function hasAudio(file) {
  const { out } = await exec('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file]);
  return out.trim().length > 0;
}

// Devuelve [inicioVoz, finVoz] en segundos usando silencedetect
// Tramos en silencio del audio: [{ s, e }]
async function silences(file, noise = '-34dB', minSil = 0.25) {
  const dur = await duration(file);
  const { err } = await exec('ffmpeg', ['-hide_banner', '-i', file, '-af', `silencedetect=noise=${noise}:d=${minSil}`, '-f', 'null', '-']);
  const sil = [];
  let cur = null;
  for (const line of err.split('\n')) {
    let m = line.match(/silence_start: ([\d.]+)/);
    if (m) cur = { s: parseFloat(m[1]) };
    m = line.match(/silence_end: ([\d.]+)/);
    if (m && cur) { cur.e = parseFloat(m[1]); sil.push(cur); cur = null; }
  }
  if (cur) sil.push({ s: cur.s, e: dur });
  return sil;
}

async function speechBounds(file, noise = '-34dB', minSil = 0.25) {
  const dur = await duration(file);
  if (!(await hasAudio(file))) return [0, dur, dur];
  const sil = await silences(file, noise, minSil);
  let start = 0, end = dur;
  if (sil.length && sil[0].s <= 0.05) start = sil[0].e;
  const last = sil[sil.length - 1];
  if (last && last.e >= dur - 0.05 && last.s > start) end = last.s;
  return [start, end, dur];
}

module.exports = { exec, ffmpeg, duration, hasAudio, speechBounds, silences };
