# Flow Studio — oficinas de producción de videos

Pegas **link de Instagram + guion** y cinco trabajadores hacen el video:

| Oficina | Qué hace |
|---|---|
| 🎞️ Capturador | Descarga el reel y saca un fotograma por segundo |
| 🎬 Director (Claude) | Traduce al inglés americano, suaviza las frases de salud peligrosas, reparte en clips de 8 s, elige la captura de cada clip y escribe los prompts de Nano Banana y Omni |
| 🖼️ Frames (Claude + Chrome) | Genera los frames en Google Flow con tu avatar y revisa cara, jersey y piel |
| ✋ **Parada 1** | Tú revisas los frames: Vale / Cambiar (escribes qué) / Subir el tuyo |
| 🎥 Clips (Claude + Chrome) | Anima cada frame en Flow con Omni |
| ✂️ Editor | Une los clips, quita silencios, sube la voz, pone hook, subtítulos palabra por palabra y CTA |
| ✋ **Parada 2** | Tú apruebas el video final o pides rehacer clips o la edición |

Desde el panel puedes **pausar** cualquier oficina, **detenerla ya**, **ver todo lo que ha hecho** (🔍 Ver oficina) y **meter tus propios frames o clips** en cualquier momento.

---

## Instalación (solo la primera vez, Windows)

1. Descarga esta carpeta `flow-studio` en tu ordenador (por ejemplo en `Documentos\flow-studio`).
2. Doble clic en **`instalar.bat`**. Instala Node, ffmpeg, yt-dlp, Python y Claude Code.
   Si te dice que cierres y vuelvas a abrir, hazlo una vez más.
3. Abre una terminal (tecla Windows → escribe `cmd`), escribe `claude` y entra con tu cuenta de Claude. Cierra con `/exit`.
4. Doble clic en **`abrir.bat`**. Se abren dos cosas:
   - Un **Chrome nuevo** (perfil "Flow Studio") con Google Flow → **entra con tu cuenta de Google** (solo la primera vez).
   - El **panel** en `http://localhost:4000`.

## Uso diario

1. Doble clic en `abrir.bat`.
2. En el panel: **＋ Nuevo video** → nombre, link de Instagram, guion, escenario y palabra del CTA → **Empezar**.
3. No toques el Chrome de Flow mientras trabajan (puedes mirarlo). Usa tu Chrome normal para lo demás.
4. Cuando el panel te avise (morado ✋), revisa y aprueba.
5. El video aprobado se guarda en la carpeta `output`.

### Si falla la descarga de Instagram
El Capturador se para y te pide el archivo. Descarga el reel (en la app de Instagram: compartir → descargar, o con una web tipo snapinsta) y **arrástralo al panel**.

### Si Flow pide algo (login, captcha, créditos)
El trabajador se para y te lo dice en su oficina. Resuélvelo en el Chrome de Flow y pulsa **▶ Continuar**.

### Si quieres hacerlo tú a mano
En `config.json` cambia `"flowMode": "auto"` por `"manual"`. El panel te da en cada clip las imágenes en orden, el botón **📋 Copiar prompt** y una casilla para arrastrar el resultado.

---

## Ajustes (`config.json`)

- `avatar.images`: fotos del avatar (en la carpeta `avatar`).
- `avatar.anchors`: lo que nunca debe cambiar (jersey, piel, pelo).
- `avatar.voice`: cómo suena la voz en todos los clips.
- `settings`: escenarios (cocina, Walmart, Target, súper). Puedes añadir más.
- `captions`: tamaño, posición y palabras por golpe de los subtítulos.
- `cta`: texto del CTA final.

## Cosas a saber

- Automatizar Flow va contra sus condiciones. Usa tu cuenta a ritmo normal y el riesgo es bajo, pero no es cero.
- El plan **Pro de Claude** tiene límites: manejar Chrome gasta bastante. Si a mitad del día se acaba, el trabajador se para con un error; espera a que se renueve y pulsa **Continuar**. Si se queda corto a menudo, pasa a Max.
- Prueba del editor sin gastar nada: `npm run test-editor`.

---

## 🎥 Vídeos Higgsfield de Diane (@diane.glows)

Pegas el link de un reel (Instagram o TikTok) y Flow Studio lo imita con Diane: análisis → keyframes con Nano Banana Pro → vídeo con Seedance → entrega (hook, overlays para CapCut y descripción). Botón **🎥 Nuevo vídeo Higgsfield**. El piloto automático **no** usa este pipeline.

| Etapa | Qué hace | Estado |
|---|---|---|
| 🎞️ Referencia | Descarga con yt-dlp (con las cookies del Chrome de Flow Studio si hace falta), guarda la descripción original, frames a 2 fps + cambios de escena y hojas de contactos con el segundo en cada miniatura | ✅ |
| 🧠 Análisis | Claude (visión) hace el plan: formato, acciones por tramos, ropa, sitio, cámara, textos, duración (máx. 15 s) y estrategia de keyframes | ✅ |
| ✋ Tu OK análisis | Lo revisas. Escribe una corrección y Claude lo rehace (tus correcciones mandan), o edita el JSON a mano | ✅ |
| 🖼️ Keyframes | Claude escribe el prompt con las reglas, el código lo revisa y Nano Banana Pro (Unlimited) lo genera. QA (Claude visión + superposición con el start frame): hasta 4 intentos que corrigen el fallo concreto. Tú: ✅ Aprobar / ↻ Regenerar / ✏️ Editar con nota | ✅ |
| 🎥 Vídeo | Prompt con las plantillas A4/A5 revisado en código, Seedance (Unlimited, 9:16, sin audio, start + end frame), métrica y arreglo de bucle, QA tramo a tramo (frames cada 0,4 s) y hasta 2 regeneraciones con correcciones | ✅ |
| 📦 Entrega | Vídeo limpio, hook (siempre 63), contadores, paneles 21:9 y plan de CapCut; descripción revisada en código (keycaps, NAD, CTA, 5 hashtags, sin promesas) como Google Doc + 📋 Copiar + copia en tu Drive (`Diane Glows/<día>`) | ✅ |

- Kit de Diane: `avatar/diane/` (`diane_principal.jpg` es siempre Image 1).
- Reglas de dirección, plantillas y ejemplos aprobados: `prompts/hf_rules.md`, `prompts/hf_templates.md`, `prompts/hf_examples.md`.
- Ajustes: sección `higgsfield` de `config.json` (bloque de identidad, duraciones, intentos, paradas por defecto). Las paradas se pueden cambiar en cada vídeo desde su ficha.
- Archivos de cada vídeo en `jobs/<id>/`: `ref/` (video, descripción, `f2/` frames, `scene/` cortes, `sheet/` hojas, `kf_start.jpg`/`kf_end.jpg`), `analysis.json` y `analysis_vN.json` (cada versión).

### Higgsfield en el Chrome de Flow Studio
- Usa el **Chrome de Flow Studio** (el que abre `abrir`), nunca tu Chrome normal. Inicia sesión en higgsfield.ai en ese Chrome una vez, a mano.
- **🎓 Aprender Higgsfield** (en la ficha, sección Keyframes): Claude recorre a la vista las pantallas de imagen y vídeo, guarda el mapa de botones en `memory/higgsfield-selectors.json` (por roles y textos visibles, sin clases CSS), lo comprueba y hace **una** imagen de prueba en Unlimited. No toques ese Chrome mientras aprende.
- Al generar, el programa comprueba modelo, 9:16, batch 1 y **Unlimited** antes de pulsar Generar; si el coste sale en créditos, para. Una sola generación a la vez (comparte el turno con Flow).
- Si Higgsfield muestra un aviso (términos nuevos, verificación, límite, login) o un botón no está donde esperaba: **no clica a ciegas**. Guarda captura y HTML en `jobs/<id>/debug/`, el vídeo pasa a "Te esperan" y tú lo resuelves en ese Chrome y pulsas Continuar. Si ya había mandado la generación, al continuar recoge el resultado sin generar otra vez.
- **Se arregla solo:** si un botón cambió o está escondido, Claude mira la captura de ese momento, corrige el mapa y lo reintenta (2 veces como mucho). Si no hay mapa todavía, aprende solo antes de generar. Solo te avisa por lo que no debe hacer él: login, captcha, términos nuevos, límites o créditos.
- Si aun así algo deja de encontrarse: **🎓 Volver a aprender**. **🔎 Comprobar mapa** revisa todo sin generar (también `npm run hf-check`).
- Si al aprender sale "Cannot find module 'playwright-core'": cierra la ventana negra y ejecuta `npm install` una vez en la carpeta `flow-studio`.

### Probar una etapa suelta (sin el panel)
```
node tools/hf-test.js capture https://www.instagram.com/reel/XXXX/
node tools/hf-test.js analysis <id que te da el paso anterior>
node tools/hf-test.js correct <id> "en el segundo ejercicio abre piernas y brazos a la vez"
```
También acepta un .mp4 en lugar del link. Los trabajos de prueba salen en el panel, en "Te esperan".
