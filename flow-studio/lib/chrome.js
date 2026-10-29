// Se asegura de que el Chrome de Flow Studio está abierto (con el puerto de control) antes de usarlo
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const store = require('./store');
const config = require('../config.json');

const port = config.chromeDebugPort || 9222;

function alive() {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/json/version', timeout: 2000 }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function chromePath() {
  const c = [
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  return c.find((p) => fs.existsSync(p));
}

async function ensure(job, worker) {
  if (await alive()) return;
  const exe = chromePath();
  if (!exe) throw new Error('No encuentro Chrome instalado');
  if (job && worker) store.log(job, worker, '🌐 El Chrome de Flow Studio estaba cerrado: lo abro yo');
  require('../tools/prep-chrome.js');
  spawn(exe, [`--remote-debugging-port=${port}`, `--user-data-dir=${path.join(store.ROOT, 'chrome-profile')}`, '--no-first-run', config.flowUrl],
    { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await alive()) return;
  }
  throw new Error('Abrí el Chrome de Flow Studio pero no responde; ciérralo y pulsa Continuar');
}

module.exports = { ensure, alive };
