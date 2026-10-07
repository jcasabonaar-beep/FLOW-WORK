# Test de Derecho Patrimonial

Juego de preguntas tipo test para repasar Derecho Privado Patrimonial (Universidad de Zaragoza). Cubre los temas 1, 2, 3, 4 y 8 con 630 preguntas repartidas en 21 niveles de 30.

## Cómo usarlo

Abre `index.html` en el navegador. No necesita instalación ni conexión, salvo para cargar las fuentes. El progreso se guarda en el propio navegador.

## Qué incluye

- Un apartado por tema, con entre 3 y 6 niveles. Cada nivel se aprueba con 15 aciertos y desbloquea el siguiente.
- De 1 a 3 estrellas por nivel (50 %, 75 % y 90 % de aciertos).
- Explicación tras cada respuesta y ficha de estudio con las 30 preguntas de cada nivel.
- Puntos con multiplicador por racha, XP y rangos (de «Estudiante de primero» a «Catedrático/a»).
- Comodines por partida: 50/50 y cambiar pregunta.
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
