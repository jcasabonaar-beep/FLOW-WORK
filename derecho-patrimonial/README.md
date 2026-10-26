# Test de Derecho Patrimonial

Juego de preguntas tipo test para repasar Derecho Privado Patrimonial (Universidad de Zaragoza). Cubre los temas 1, 2, 3, 4 y 8 con 630 preguntas repartidas en 21 niveles de 30.

## Cómo usarlo

La versión publicada en claude.ai guarda el progreso en la cuenta del usuario (capacidades `db` y `user` del artifact, documento privado `data/users/<id>/progreso`), así que se sincroniza entre móvil y ordenador. Abriendo `index.html` en local, el progreso se guarda solo en el navegador.

## Qué incluye

- **Al fallar**, una hoja de corrección te explica qué marcaste frente a la respuesta correcta y por qué es así. Si tu opción es la respuesta de otra pregunta del temario, te avisa de la confusión. También te muestra el mini-apunte del concepto con un truco para recordarlo.
- **Ronda de repaso** al final de cada nivel con las preguntas falladas, y una lista de «Conceptos a repasar» en los resultados.
- **Apuntes** por tema: 65 mini-apuntes (`data/apuntes.js`) que se enlazan solos con cada pregunta por palabras clave.

- Un apartado por tema, con entre 3 y 6 niveles. Cada nivel se aprueba con 15 aciertos y desbloquea el siguiente.
- De 1 a 3 estrellas por nivel (50 %, 75 % y 90 % de aciertos).
- Explicación tras cada respuesta y ficha de estudio con las 30 preguntas de cada nivel.
- Puntos con multiplicador por racha, XP y rangos (de «Estudiante de primero» a «Catedrático/a»).
- Comodines por partida: 50/50, pista (te enseña el truco del concepto a cambio de la mitad de puntos) y cambiar pregunta.
- Camino de niveles por tema, mascota (Lexi), objetivo diario y colores por tema.
- Examen de tema, examen global, repaso de fallos y desafío relámpago de 60 segundos.
- Modo contrarreloj opcional, sonidos, logros, estadísticas por tema y racha de días.
- Tema claro y oscuro. Funciona con teclado (1–4 / A–D e Intro).

## Editar preguntas

Las preguntas están en `data/t*.js`. Cada una tiene el formato
`[enunciado, correcta, incorrecta, incorrecta, incorrecta, explicación]`; las opciones se barajan al jugar.
Después de editar, regenera la página:

```
python3 build.py
```

## Repaso inteligente

Cada pregunta y cada mini-apunte guardan una «caja» de memoria (sistema Leitner): acertar la sube y aleja la siguiente repetición a 1, 2, 4, 7, 15 y 30 días; fallar la devuelve a hoy. El modo **Repaso inteligente** tiene dos fases: tarjetas de apuntes para el recuerdo activo (te autoevalúas con «Ni idea», «A medias» o «Lo sabía») y un test de 30 preguntas que mezcla los temas elegidos. El test prioriza tus fallos, luego lo que vence hoy y lo que no has repasado, y pesa más los temas con peor acierto. Si fallas una pregunta, vuelve a salir cinco preguntas después.

## Sin números de artículo

El ajuste «Sin números de artículo» está activado por defecto. Oculta las preguntas de `data/articulos.js`, que solo piden un número de artículo, ley o título, y quita del resto de textos (enunciados, opciones, explicaciones y apuntes) las referencias del tipo «art. 1258 CC». Se puede desactivar en Ajustes.
