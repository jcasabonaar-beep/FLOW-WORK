// 🩺 Estado del sistema: comprueba que todo lo que usan los trabajadores está instalado y conectado (sin gastar créditos)
const fs = require('fs');
const { exec } = require('./ff');
const chrome = require('./chrome');
const settings = require('./settings');
const config = require('../config.json');

const win = process.platform === 'win32';
const tryRun = (cmd, args) => exec(cmd, args, { shell: win }).then((r) => (r.out || r.err).trim().split('\n')[0]).catch(() => null);

async function check() {
  const s = settings.get();
  const [ff, py, whisper, ytdlp, claude, live] = await Promise.all([
    tryRun('ffmpeg', ['-version']), tryRun('python', ['--version']), tryRun('python', ['-c', 'import faster_whisper; print("ok")']),
    tryRun('yt-dlp', ['--version']), tryRun(config.claudeCmd || 'claude', ['--version']), chrome.alive(),
  ]);
  const drive = s.driveFolder ? fs.existsSync(s.driveFolder) : null;
  return [
    { name: 'Claude Code', ok: !!claude, info: claude, fix: 'Instala Claude Code y entra con tu cuenta (claude en una terminal).' },
    { name: 'ffmpeg (montaje)', ok: !!ff, info: ff && ff.split(' ').slice(0, 3).join(' '), fix: 'winget install ffmpeg y reinicia el PC.' },
    { name: 'Python', ok: !!py, info: py, fix: 'Instala Python desde python.org (marca "Add to PATH").' },
    { name: 'Transcripción (faster-whisper)', ok: !!whisper, info: whisper ? 'instalada' : null, fix: 'En una terminal: python -m pip install faster-whisper' },
    { name: 'yt-dlp (descargar reels)', ok: !!ytdlp, info: ytdlp, fix: 'En una terminal: python -m pip install -U yt-dlp' },
    { name: 'Chrome de Flow Studio', ok: live, info: live ? 'abierto y conectado' : 'cerrado (se abre solo cuando hace falta)', fix: null, soft: true },
    { name: 'Google Drive', ok: drive === true, info: drive === null ? 'sin configurar' : drive ? s.driveFolder : `no encuentro ${s.driveFolder}`, fix: drive === null ? 'Configúralo abajo en ☁️ Google Drive.' : 'Abre Google Drive para ordenador.', soft: drive === null },
    { name: 'Avisos al móvil', ok: !!s.ntfyTopic, info: s.ntfyTopic ? 'activados' : 'desactivados', fix: 'Configúralos abajo en 📱 Avisos.', soft: true },
  ];
}

// Instagram cambia a menudo y yt-dlp deja de descargar: se actualiza solo una vez por semana
async function updateYtdlp() {
  return exec('python', ['-m', 'pip', 'install', '-U', '--quiet', 'yt-dlp'], { shell: win }).then(() => true).catch(() => false);
}

module.exports = { check, updateYtdlp };
