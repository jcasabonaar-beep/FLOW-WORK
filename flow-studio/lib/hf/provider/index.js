// Interfaz de proveedor: el pipeline solo llama a generateImage / generateVideo.
// "web" = higgsfield.ai en el Chrome de Flow Studio (Unlimited). "api" = API oficial de pago por créditos (pendiente).
const config = require('../../../config.json');

function get() {
  const name = config.higgsfield.provider || 'web';
  if (name === 'web') return require('./web');
  if (name === 'api') return require('./api');
  throw new Error(`Proveedor de Higgsfield desconocido: ${name}`);
}

module.exports = { get };
