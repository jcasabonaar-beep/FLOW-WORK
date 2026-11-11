// Revisión en código de la descripción de Instagram de Diane (sección 5 del encargo)
const KEYCAP = (d) => `${d}️⃣`;
const CTA1 = /^💬 Comment "GLOW" and I'll send you .+💌$/u;
const CTA2 = "👉 Follow me first so it doesn't end up in your hidden requests!";
const BANNED = /\b(weight[- ]loss|lose weight|losing weight|belly fat|burn(s|ing)? fat|fat[- ]burn\w*|slim(mer|ming)?|cures?|cured|heals?|healed|reverses? aging|guarantee[ds]?|clinically proven|I noticed|my skin (changed|transformed)|in (just )?\d+ (days|weeks))\b/i;

function checkDescription(text) {
  let d = String(text || '').replace(/\r/g, '').trim();
  const fixes = [], errors = [], warnings = [];
  // 1️⃣ sin el U+FE0F → se añade
  const before = d;
  d = d.replace(/([0-9])(?!️)⃣/g, '$1️⃣');
  if (d !== before) fixes.push('añadido el U+FE0F que faltaba en algún emoji keycap');
  if (/🔟/.test(d)) errors.push('usa 🔟: con 10 puntos o más la lista es demasiado larga');
  const lines = d.split('\n');
  if (!/^I'm 63\./.test(lines[0] || '')) errors.push('la primera línea no empieza por "I\'m 63."');
  for (const m of d.matchAll(/\bI'?m (\d{2})\b/g)) if (m[1] !== '63') errors.push(`dice "I'm ${m[1]}": la edad siempre es 63`);
  // Lista numerada con keycaps: 1️⃣ 2️⃣… seguidos
  const items = lines.map((l, i) => ({ l, i, m: l.match(/^([0-9])️⃣\s/) })).filter((x) => x.m);
  if (!items.length) errors.push('no hay lista numerada con emojis keycap (1️⃣ 2️⃣…)');
  items.forEach((x, k) => { if (+x.m[1] !== k + 1) errors.push(`la lista salta del ${k} al ${x.m[1]}`); });
  if (lines.some((l) => /^\s*\d+[.)]\s/.test(l))) errors.push('hay puntos numerados con "1." en vez de emojis keycap');
  for (const x of items) {
    const head = x.l.replace(/^[0-9]️⃣\s*/, '');
    if (!/^\p{Extended_Pictographic}/u.test(head)) errors.push(`el punto ${x.m[1]} no lleva emoji temático tras el número`);
    const body = (lines[x.i + 1] || '').trim();
    if (!body) errors.push(`el punto ${x.m[1]} no lleva su frase debajo`);
  }
  const header = (lines[0] || '').match(/I'm 63\.\s*(\d+)\s/);
  if (header && items.length && +header[1] !== items.length) errors.push(`el titular dice ${header[1]} y la lista tiene ${items.length} puntos`);
  // NAD: siempre, normalmente el 1, con el enlace de la bio
  const nad = items.find((x) => /\bNAD\b/.test(x.l + ' ' + (lines[x.i + 1] || '')));
  if (!nad) errors.push('falta el NAD en la lista');
  else if (nad.m[1] !== '1') warnings.push(`el NAD es el punto ${nad.m[1]} (normalmente va el 1)`);
  if (!d.includes('(The one I use is linked in my bio 🔗)')) errors.push('falta "(The one I use is linked in my bio 🔗)"');
  // CTA, "Educational content only." y 5 hashtags al final
  if (!lines.some((l) => CTA1.test(l.trim()))) errors.push('falta la línea "💬 Comment "GLOW" and I\'ll send you … 💌"');
  if (!lines.some((l) => l.trim() === CTA2)) errors.push(`falta "${CTA2}"`);
  const nonEmpty = lines.map((l) => l.trim()).filter(Boolean);
  const last = nonEmpty[nonEmpty.length - 1] || '';
  const tags = last.split(/\s+/);
  if (!tags.every((t) => /^#\w+$/.test(t)) || tags.length !== 5) errors.push('la última línea tiene que ser exactamente 5 hashtags');
  if (nonEmpty[nonEmpty.length - 2] !== 'Educational content only.') errors.push('"Educational content only." tiene que ir justo antes de los hashtags');
  const bad = d.match(BANNED);
  if (bad) errors.push(`frase prohibida (promesa de salud, resultados o pérdida de peso): "${bad[0]}"`);
  return { text: d, fixes, errors, warnings };
}

module.exports = { checkDescription, KEYCAP, CTA2 };
