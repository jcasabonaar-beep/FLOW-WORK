// Lanza un trabajador Claude (Claude Code en modo -p) y vuelca lo que hace en su oficina
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const store = require('./store');
const config = require('../config.json');

const running = new Map(); // `${jobId}:${worker}` -> child process

function q(arg) {
  // En Windows se lanza con shell, así que hay que entrecomillar
  if (process.platform !== 'win32') return arg;
  return /[\s"()*&|<>^]/.test(arg) ? '"' + arg.replace(/"/g, '\\"') + '"' : arg;
}

function summarizeTool(block) {
  const i = block.input || {};
  const name = (block.name || '').replace(/^mcp__playwright__browser_/, 'navegador: ');
  const detail = i.file_path || i.url || i.element || i.text || i.command || i.paths || '';
  return `${name} ${typeof detail === 'string' ? detail.slice(0, 120) : JSON.stringify(detail).slice(0, 120)}`;
}

/**
 * opts: { job, worker, prompt, tools: [...], browser: bool, cwd }
 * Devuelve el texto final del trabajador.
 */
function run({ job, worker, prompt, tools = ['Read', 'Write'], browser = false, cwd }) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits'];
    const allowed = [...tools];
    if (browser) {
      const mcp = path.join(store.ROOT, 'tools', 'mcp.json');
      args.push('--mcp-config', mcp, '--strict-mcp-config');
      allowed.push('mcp__playwright');
    }
    args.push('--allowedTools', allowed.join(','));
    args.push('--add-dir', store.ROOT);

    const promptFile = path.join(store.jobDir(job.id), 'logs', `${worker}-prompt-${Date.now()}.md`);
    fs.writeFileSync(promptFile, prompt);

    const child = spawn(process.env.FLOW_CLAUDE || config.claudeCmd, args.map(q), {
      cwd: cwd || store.jobDir(job.id), shell: process.platform === 'win32', windowsHide: true,
    });
    running.set(`${job.id}:${worker}`, child);
    child.stdin.write(prompt);
    child.stdin.end();

    let buf = '';
    let result = '';
    let errText = '';
    child.stdout.on('data', (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        const j = store.load(job.id);
        if (ev.type === 'assistant' && ev.message && ev.message.content) {
          for (const b of ev.message.content) {
            if (b.type === 'text' && b.text.trim()) store.log(j, worker, '💬 ' + b.text.trim().slice(0, 300));
            if (b.type === 'tool_use') {
              store.log(j, worker, '🔧 ' + summarizeTool(b));
              j.workers[worker].action = summarizeTool(b);
              store.save(j);
            }
          }
        }
        if (ev.type === 'result') {
          result = ev.result || '';
          if (ev.is_error) errText = result || 'error';
        }
      }
    });
    child.stderr.on('data', (d) => { errText += d.toString(); });
    child.on('error', (e) => { running.delete(`${job.id}:${worker}`); reject(e); });
    child.on('close', (code) => {
      running.delete(`${job.id}:${worker}`);
      if (child.killedByUser) return reject(new Error('Detenido por ti'));
      if (code !== 0 || errText && !result) return reject(new Error((errText || `claude salió con código ${code}`).slice(0, 800)));
      resolve(result);
    });
  });
}

function stop(jobId, worker) {
  const c = running.get(`${jobId}:${worker}`);
  if (!c) return false;
  c.killedByUser = true;
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(c.pid), '/T', '/F']);
  else c.kill('SIGTERM');
  return true;
}

function extractJson(text) {
  const m = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
  if (!m) throw new Error('El trabajador no devolvió JSON');
  return JSON.parse(m[1]);
}

module.exports = { run, stop, extractJson };
