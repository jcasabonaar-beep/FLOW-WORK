# Vida Real XP — reglas del proyecto

Canal de YouTube en español **Vida Real XP** (`@VidaRealXP`): cortos animados sin voz sobre la vida real (disciplina, videojuegos, hábitos...). El canal en inglés (*Real Life XP*) se abrirá más adelante si el de español funciona; mientras tanto se siguen generando versiones `_EN`.

## Referente de viralidad
Tomar **siempre** como referencia el sistema de **Day One Films** (`@dayonefilmsofficial`), analizado en `canal/MANUAL_VIRAL.md`: miniaturas, texto de miniatura, títulos, temas, estructura, duración y ritmo. Copiar su sistema, nunca sus videos, títulos ni miniaturas concretas.

## Miniaturas
- Las miniaturas las genera el usuario con **Nano Banana Pro**.
- **Dar los prompts en el momento de crear cada video** (no por adelantado): 3 prompts por video para la prueba A/B, cada uno emparejado con su título.
- Usar la plantilla de `canal/MANUAL_VIRAL.md` (sección 3) y recordar adjuntar `canal/personaje_referencia.png`.
- Texto de miniatura: 1–3 palabras, MAYÚSCULAS, punto final, distinto del título.

## Producción
- Motor de animación: `video-disciplina/corto.py` (personaje y efectos) y `video-gaming/juego.py`.
- Cada corto: versión ES y EN, banda sonora sintetizada, capítulos ≥ 10 s, Short vertical en bucle, `PUBLICACION.md`.
- Los archivos generados (`salida/`) no se suben al repositorio.
