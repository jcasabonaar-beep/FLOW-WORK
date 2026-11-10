// Texto para pegar en Instagram: descripción, varios puntos en líneas separadas (esconden los hashtags) y los hashtags al final
const DOTS = 7;

function postText(k) {
  return [k.caption || '', k.disclosure ? '\n' + k.disclosure : '', ...Array(DOTS).fill('.'), k.hashtags || ''].join('\n').replace(/\n{3,}\./, '\n\n.').trim();
}

// Lo que se guarda en Drive: el texto para pegar y, aparte, las notas para publicar
function driveText(k) {
  return [postText(k), '', '────────── (esto no se pega) ──────────',
    k.comentario ? '📌 Comentario para fijar: ' + k.comentario : '', k.ubicacion ? '📍 Ubicación: ' + k.ubicacion : '', '🤖 Al publicar: activa "Hecho con IA"'].filter((x, i) => i < 3 || x).join('\n');
}

module.exports = { postText, driveText, DOTS };
