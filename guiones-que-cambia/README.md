# «¿QUÉ CAMBIA PARA TI?» — finanzas, 30 vídeos

30 Shorts/Reels/TikToks verticales (1080×1920, 23–36 s) en formato de cartel: fondo amarillo, texto condensado negro en recuadros blancos, una etiqueta arriba y una mascota «€». Los vídeos salen **sin audio**: tú pones la voz con ElevenLabs.

| Carpeta / archivo | Qué es |
|---|---|
| `videos/` | Los 30 MP4 listos (mudos) |
| `miniaturas/` | Primer fotograma de cada vídeo = portada |
| `voz/` | Texto exacto de la locución de cada vídeo, para pegar en ElevenLabs |
| `GUIONES.md` | Los 30 hooks + guion con tiempos (pantalla y voz) |
| `guiones.json` | Fuente de todo: editas aquí y vuelves a renderizar |
| `render.py` | Genera vídeos, miniaturas, `voz/` y `GUIONES.md` |

## Qué funciona en EE. UU. y cómo lo he adaptado

No hay datos públicos fiables de views por formato: casi todo lo que se publica son blogs de herramientas. Así que he cruzado lo que se repite en esas fuentes con los casos documentados: Salary Transparent Street suma más de mil millones de views entre plataformas preguntando «¿cuánto cobras?» a desconocidos, y Humphrey Yang se hizo viral visualizando la escala del dinero con granos de arroz.

| Formato en EE. UU. | Por qué engancha | Vídeos |
|---|---|---|
| **Sueldos al descubierto / sueldo por edad** | Comparación social: «¿estoy por encima o por debajo?». Genera muchísimos comentarios | 1 |
| **Desglose de nómina** («cobro X, me llega Y») | Cifra reconocible en el primer segundo y te afecta a ti | 2, 18 |
| **El mito de los tramos** («cobrar más no te hace cobrar menos») | Corrige algo que mucha gente cree; los que lo sabían lo comparten | 3, 23 |
| **Visualizar la escala** (arroz, horas de trabajo) | Una cifra abstracta se convierte en algo que se entiende | 4, 5 |
| **Reto de ahorro** («Save $X with me») | Es el hook que más views da en los análisis de TikTok; invita a apuntarse | 6 |
| **Interés compuesto** («empieza a los 25 vs 35») | El contraste entre las dos cifras se guarda y se reenvía | 7, 8 |
| **Comprobación de realidad** (gastos hormiga, alquiler) | El shock de la cifra anual | 9, 10 |
| **«Conoce tus derechos» / «esto es ilegal»** | Dinero que te deben y no sabías; es lo que más se guarda | 11–17, 19, 20, 29, 30 |
| **Errores fiscales / truco de impuestos** | Utilidad + calendario (abril–junio) | 21, 22, 24 |
| **Hook generacional** («si naciste en los 90…») | Identidad: la gente se etiqueta entre amigos | 25, 26 |
| **Truco de facturas** | Ahorro concreto e inmediato | 27, 28 |

Lo que he aplicado a todos los vídeos:

- **El hook se lee en el fotograma 0 sin sonido.** Es la miniatura y lo que ve quien hace scroll con el móvil en silencio.
- **Una cifra grande cada 3–5 segundos**, con números que cuentan hacia arriba y barras que crecen al ritmo de la voz.
- **Barra de progreso arriba** y mini-hook fijo, para que no se pierda el hilo (retención).
- **El cierre pide un comentario concreto** («¿estás por encima o por debajo?», «dime tu ciudad»), no un «sígueme» genérico.
- **Nada importante en la zona que tapan los botones y el texto** de TikTok/Reels (abajo y a la derecha).
- **Sin política.** Es el nicho de «dinero en tu bolsillo», que es el más amplio.

## Cómo poner la voz con ElevenLabs

1. Abre `voz/NN-slug.txt` y pega el texto tal cual en ElevenLabs. Cada párrafo es una escena; los saltos de línea dan una pausa natural.
2. Descarga el MP3 y guárdalo como `audio/NN-slug.mp3` (o simplemente `audio/NN.mp3`).
3. Ejecuta `python3 render.py NN`. El vídeo se vuelve a generar ajustando cada escena a la duración real de tu audio, y se mezcla el sonido.
   - Puedes dejar los 30 audios en `audio/` y ejecutar `python3 render.py` una sola vez.
   - O me los subes y lo hago yo.

Consejos de voz: velocidad 1.0–1.1, estabilidad media (~40 %). La primera frase es el hook: que suene con energía y sin pausa al principio.

Si prefieres montar en CapCut, los MP4 mudos valen igual: arrastra el audio encima y recorta.

## Cambiar la cuenta o el estilo

- **Nombre de la cuenta y aviso:** en la cabecera de `guiones.json` (`cuenta`, `aviso`).
- **Colores, tipografía y mascota:** al principio de `render.py`.
- La tipografía es Inter Black estrechada. Si instalas Anton u Oswald, cambia `FUENTE` y pon `CONDENSADO = 1.0`.

He usado una mascota propia (una «€») en vez del «?» de @que.cambia: el formato se puede copiar, pero una identidad visual idéntica te puede traer reclamaciones y confunde a la audiencia.

## ⚠️ Cifras que tienes que verificar antes de publicar

Todas las cifras son aproximadas y están en `guiones.json`. Las marcadas con ❗ dependen de datos oficiales que pueden haber cambiado o que no he podido comprobar:

| Vídeo | Dato | Cómo comprobarlo |
|---|---|---|
| 1 ❗ | Sueldo medio por tramo de edad (15k / 23k / 28k / 31k / 32k) | INE, Encuesta de Estructura Salarial más reciente |
| 2, 10 | Neto de 1.500 / 2.000 / 3.000 € brutos (≈1.260 / 1.560 / 2.200) | Simulador de retenciones de la AEAT. Calculado para alguien soltero, sin hijos, con la escala general |
| 3 | Escala del IRPF 19-24-30-37-45 % | Escala general estatal + autonómica; varía por comunidad |
| 4, 5 | SMI ≈ 16.576 €/año (dato de 2025) | BOE, SMI vigente en 2026/2027 |
| 14 ❗ | Bono Alquiler Joven: 250 €/mes, 18–35 años, ≈25.000 € | Que siga convocado en 2026–2027 en la comunidad del espectador |
| 16 | Paro: 70 % / 50 %, topes | SEPE |
| 21 ❗ | Límites para declarar: 22.000 € / 15.876 € | AEAT, campaña Renta 2026 (se presenta en 2027) |
| 22 | Donativos: 80 % de los primeros 250 € | AEAT |
| 24 | Límite del plan de pensiones: 1.500 € | AEAT |
| 25, 26 | 67 años / 65 con 38 años y 6 meses; 15 años = 50 %, 37 = 100 % | Seguridad Social, ley vigente desde 2027 |
| 27, 28 | ≈40 €/año por kW y por stand-by | Estimaciones; dependen de la tarifa |

Los vídeos de derechos (11–13, 15, 17, 19, 20, 29, 30) se basan en leyes estables: la LAU, la Ley de Vivienda de 2023, el Estatuto de los Trabajadores y la garantía de 3 años desde 2022. Aun así, conviene que una gestoría o un abogado lo revise una vez.

En el pie de vídeo pon «información general, no asesoramiento financiero».

## Fuentes de la investigación

- [Draper — hooks de finanzas que funcionan en TikTok en 2026](https://draper.chat/blog/tiktok-personal-finance-hooks-2026)
- [Blitzcut — hooks de finanzas para Reels 2026](https://blitzcutai.com/blog/finance-money-reel-hooks-2026)
- [Fluxnote — ideas de Shorts de finanzas 2026](https://fluxnote.io/guides/finance-youtube-shorts-ideas)
- [Fluxnote — formatos de Shorts en tendencia 2026](https://fluxnote.io/guides/youtube-shorts-trending-formats-2026)
- [OutlierKit — creadores de finanzas en YouTube 2026](https://outlierkit.com/resources/youtube-finance-niche-creators/)
- [Overseeros — canales de finanzas sin cara](https://www.overseeros.com/blog/successful-faceless-finance-youtube-channels)
- [Salary Transparent Street (Wikipedia)](https://en.wikipedia.org/wiki/Salary_Transparent_Street)
- [Rev — entrevista a Hannah Williams](https://rev.com/podcasts/hannah-williams)
- [Business Today — el vídeo del arroz de Humphrey Yang](https://businesstoday.in/latest/trends/tiktok-user-uses-rice-to-show-jeff-bezos-enormous-wealth/story/397321.html)
