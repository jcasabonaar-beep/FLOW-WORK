// Un solo Chrome: los trabajadores que lo usan (Flow, Instagram) van de uno en uno
let busy = false;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function acquire() {
  while (busy) await wait(2000);
  busy = true;
}
function release() { busy = false; }
const isBusy = () => busy;

module.exports = { acquire, release, isBusy };
