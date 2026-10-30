// 📅 Fechas que mueven a nuestro público (EE. UU. + hispanas): se pasan a los prompts para aprovecharlas a tiempo. Sin gastar créditos.
const nth = (y, m, dow, n) => { const d = new Date(y, m, 1); d.setDate(1 + ((dow - d.getDay() + 7) % 7) + (n - 1) * 7); return d; };
const lastDow = (y, m, dow) => { const d = new Date(y, m + 1, 0); d.setDate(d.getDate() - ((d.getDay() - dow + 7) % 7)); return d; };

function events(y) {
  return [
    [new Date(y, 0, 1), 'Año Nuevo: propósitos de salud, "desinflamarse" después de las fiestas'],
    [new Date(y, 0, 6), 'Día de Reyes (rosca, chocolate caliente)'],
    [new Date(y, 1, 14), 'San Valentín (recetas para la familia, cariño)'],
    [nth(y, 4, 0, 2), 'Día de las Madres en EE. UU. (homenaje a mamás y abuelas)'],
    [new Date(y, 4, 10), 'Día de las Madres en México'],
    [nth(y, 5, 0, 3), 'Día del Padre'],
    [new Date(y, 6, 4), '4 de julio (calor, parrilladas, hidratación)'],
    [new Date(y, 7, 10), 'Vuelta al cole (los nietos, loncheras, defensas)'],
    [new Date(y, 8, 15), 'Mes de la Herencia Hispana (15 sep – 15 oct): orgullo de las recetas de nuestras abuelas'],
    [new Date(y, 9, 31), 'Halloween y Día de Muertos (pan de muerto, tradiciones)'],
    [nth(y, 10, 4, 4), 'Thanksgiving / Día de Acción de Gracias (digestión después del banquete, pavo)'],
    [lastDow(y, 10, 5), 'Black Friday (ofertas: buen momento para vender el libro)'],
    [new Date(y, 11, 16), 'Posadas (ponche, atole, tamales)'],
    [new Date(y, 11, 24), 'Nochebuena y Navidad (tamales, ponche, comer sin sentirse pesada)'],
  ];
}

function season(d) {
  const m = d.getMonth();
  if (m >= 9 || m <= 2) return 'temporada de gripe y resfriados (octubre–marzo): defensas, garganta, tos, té caliente';
  if (m >= 5 && m <= 7) return 'verano: calor, hidratación, piernas hinchadas, aguas frescas';
  return 'primavera: alergias, energía, "ponerse en forma" con calma';
}

// Lo que viene en el próximo mes, en una línea para los prompts
function upcoming(now = new Date()) {
  const soon = [...events(now.getFullYear()), ...events(now.getFullYear() + 1)]
    .filter(([d]) => d >= new Date(now.getFullYear(), now.getMonth(), now.getDate()) && d - now < 30 * 86400000)
    .map(([d, t]) => `${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}: ${t}`);
  return `Hoy es ${now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}. Época: ${season(now)}.` +
    (soon.length ? ` Próximas fechas: ${soon.join(' · ')}.` : '');
}

module.exports = { upcoming };
