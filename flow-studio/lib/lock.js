// Un solo Chrome: los trabajadores que lo usan (Flow, Instagram) van de uno en uno, por orden de llegada
let busy = false;
const queue = [];

function acquire() {
  if (!busy) { busy = true; return Promise.resolve(); }
  return new Promise((resolve) => queue.push(resolve));
}
function release() {
  const next = queue.shift();
  if (next) next(); else busy = false;
}
const isBusy = () => busy;
const waiting = () => queue.length;

module.exports = { acquire, release, isBusy, waiting };
