// 📱 Avisos al móvil con la app gratuita ntfy (sin cuentas): el panel te da un "canal" y lo añades en la app
const https = require('https');
const settings = require('./settings');

const last = new Map();

// key: avisos repetidos con la misma clave no se mandan más de una vez cada `every` minutos
function send(title, message, { key, every = 0, priority = 3, tags = '' } = {}) {
  const topic = settings.get().ntfyTopic;
  if (!topic) return Promise.resolve(false);
  if (key && every && last.has(key) && Date.now() - last.get(key) < every * 60000) return Promise.resolve(false);
  if (key) last.set(key, Date.now());
  const body = Buffer.from(JSON.stringify({ topic, title, message, priority, tags: tags ? tags.split(',') : [] }));
  return new Promise((resolve) => {
    const req = https.request({ host: 'ntfy.sh', path: '/', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': body.length } },
      (res) => { res.resume(); resolve(res.statusCode < 300); });
    req.on('error', () => resolve(false));
    req.setTimeout(10000, () => { req.destroy(); resolve(false); });
    req.end(body);
  });
}

module.exports = { send };
