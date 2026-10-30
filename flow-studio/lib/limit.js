// ¿Es el límite de uso de Claude? (entonces se espera y se sigue solo cuando se renueve)
const isLimit = (msg) => /usage limit|limit reached|rate limit|hit your limit|out of extra usage|resets? (at|in)/i.test(String(msg || ''));
module.exports = { isLimit, EVERY: 10 * 60 * 1000 };
