// Lanza Python (en Windows suele ser "python"; en Mac/Linux "python3") y las métricas del pipeline Higgsfield
const path = require('path');
const { exec } = require('../ff');
const config = require('../../config.json');
const store = require('../store');

async function python(args) {
  try { return await exec(config.python || 'python', args); } catch (e) {
    if (!/ENOENT/.test(e.message) || config.python) throw e;
    return exec('python3', args);
  }
}

async function metric(...args) {
  const { out } = await python([path.join(store.ROOT, 'tools', 'hf_metrics.py'), ...args]);
  return JSON.parse(out.trim().split('\n').pop());
}

module.exports = { python, metric };
