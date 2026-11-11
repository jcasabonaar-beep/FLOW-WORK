// Revisión en código de los prompts de Nano Banana Pro (las reglas de la sección 4 que se pueden comprobar sin mirar)
const BANNED = ['photorealistic', 'ultra-detailed', 'ultra detailed', '8k', 'hyperrealistic', 'hyper-realistic', 'masterpiece'];
const NO_TEXT = 'No text, captions, emojis, logos or watermarks.';

/**
 * kind: 'base' | 'end' | 'edit'. nImages: imágenes subidas. refImages: números de imagen que muestran a otra mujer.
 * Devuelve { prompt (arreglado), fixes: [lo que se corrigió solo], errors: [lo que obliga a reescribirlo] }
 */
function lintNano(text, { kind, nImages, refImages = [] }) {
  let p = String(text || '').replace(/\r/g, '').trim();
  const fixes = [], errors = [];
  for (const w of BANNED) {
    const re = new RegExp(`\\b${w.replace('-', '[- ]?')}\\b,?\\s*`, 'gi');
    if (re.test(p)) { p = p.replace(re, ''); fixes.push(`quitada la palabra prohibida "${w}"`); }
  }
  // Tiempos y secuencias: con ellos Nano Banana hace un storyboard con viñetas y texto
  if (/\b\d+(\.\d+)?\s*[-–]\s*\d+(\.\d+)?\s*s\b|\b\d+(\.\d+)?\s*(s|sec|secs|seconds?)\b(?!\w)/i.test(p)) errors.push('tiene tiempos (segundos): una imagen es UNA pose, sin tiempos');
  if (/\b(then|after that|afterwards|next,|finally,|step \d|frame \d|panel \d|sequence)\b/i.test(p)) errors.push('describe una secuencia de acciones ("then", "after that"…): una sola pose');
  // Imágenes: Image 1 siempre, ninguna que no se suba, todas las subidas mencionadas
  const used = [...new Set([...p.matchAll(/\bImage\s+(\d+)\b/g)].map((m) => +m[1]))];
  if (!used.includes(1)) errors.push('no menciona Image 1');
  for (const n of used) if (n > nImages) errors.push(`menciona Image ${n} pero solo se suben ${nImages}`);
  for (let n = 1; n <= nImages; n++) if (!used.includes(n)) errors.push(`no dice para qué sirve Image ${n}`);
  if (kind === 'edit' && !/^Edit Image 1\b/i.test(p)) errors.push('una edición tiene que empezar por "Edit Image 1."');
  for (const n of refImages) {
    if (!new RegExp(`do not copy the face[^.]*Image ${n}`, 'i').test(p)) {
      p = p.replace(/\s*$/, ` Do not copy the face or the hair of the woman in Image ${n}.`);
      fixes.push(`añadido "do not copy the face or the hair of the woman in Image ${n}"`);
    }
  }
  if (kind !== 'edit' && !/9:16/.test(p)) errors.push('no dice el encuadre vertical 9:16');
  if (!/No text, captions/i.test(p)) { p = `${p} ${NO_TEXT}`; fixes.push('añadido "No text, captions…"'); }
  else if (!new RegExp(NO_TEXT.replace(/[.,]/g, '.?'), 'i').test(p.slice(-200))) {
    // La frase de "sin texto" tiene que ir al final
    p = p.replace(/\s*No text, captions[^.]*\./i, '').trim() + ' ' + NO_TEXT;
    fixes.push('"No text, captions…" movido al final');
  }
  return { prompt: p.replace(/[ \t]{2,}/g, ' ').trim(), fixes, errors };
}

module.exports = { lintNano, BANNED, NO_TEXT };
