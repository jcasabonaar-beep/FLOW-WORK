// Prepara el perfil de Chrome de Flow Studio: las descargas van a flow-studio/downloads sin preguntar
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const prof = path.join(ROOT, 'chrome-profile', 'Default');
const downloads = path.join(ROOT, 'downloads');
fs.mkdirSync(prof, { recursive: true });
fs.mkdirSync(downloads, { recursive: true });
const file = path.join(prof, 'Preferences');
let prefs = {};
try { prefs = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
prefs.download = { ...(prefs.download || {}), default_directory: downloads, prompt_for_download: false, directory_upgrade: true };
prefs.savefile = { default_directory: downloads };
prefs.profile = { ...(prefs.profile || {}), name: 'Flow Studio' };
fs.writeFileSync(file, JSON.stringify(prefs));
console.log('Perfil de Chrome listo. Descargas en: ' + downloads);
