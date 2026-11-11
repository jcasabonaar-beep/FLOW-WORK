// Proveedor "api": API oficial de Higgsfield (de pago por créditos; Unlimited NO aplica fuera de higgsfield.ai).
// Misma firma que web.js para poder cambiar sin tocar el resto del pipeline. Sin implementar todavía.
const { HfStop } = require('../locate');

const todo = () => { throw new HfStop('El proveedor "api" de Higgsfield todavía no está configurado. En config.json deja higgsfield.provider = "web".'); };

module.exports = { generateImage: todo, generateVideo: todo, check: todo };
