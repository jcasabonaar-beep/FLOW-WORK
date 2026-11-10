# Reglas de dirección de Diane (pipeline Higgsfield)

Lo aprendido con Nano Banana Pro y Seedance. Mandan sobre cualquier otra costumbre. Las correcciones del productor mandan sobre estas reglas en lo que contradigan.

### Identidad

- **Image 1 siempre es la imagen de referencia de Diane** (del kit). Bloque de identidad:
  `A fit 63-year-old woman who easily looks 45, fair glowing skin with light freckles, visible natural pores and laugh lines, blue-green eyes, long silver-grey hair with soft waves and a middle part, small gold hoop earrings.`
- De la referencia se toman por defecto la ropa, el entorno, la pose y la cámara, salvo que yo indique otra cosa. **Nunca la cara ni el pelo:** añadir siempre `do not copy the face or hair of the woman in Image N`.
- Fallo típico: el color de pelo de la referencia contamina el resultado (puntas rubias o pelirrojas). Hay que comprobarlo en el QA.
- Peinado coherente con la acción: coleta baja para cardio rápido; suelto para skincare.
- En los prompts de vídeo **no describir el color de pelo** ni rasgos que puedan contradecir el start frame. Basta con "the same woman from the start frame".

### Prompts de Nano Banana Pro

- Estructura, en este orden:
  1. papel de cada imagen;
  2. bloque de identidad y ropa;
  3. pose exacta: qué mano, dedos, posiciones;
  4. entorno;
  5. encuadre 9:16 con posiciones en fracciones del encuadre y distancia de cámara;
  6. cámara y luz;
  7. `No text, captions, emojis, logos or watermarks.`
- Cámara: `Shot on iPhone 15 main camera, 24mm f/1.9, …, natural sensor grain, real skin texture with visible pores`.
- Palabras prohibidas: photorealistic, ultra-detailed, 8k, hyperrealistic, masterpiece.
- **Nunca tiempos ni secuencias de acciones.** Una pose por imagen. Con tiempos, Nano Banana genera un storyboard con viñetas y texto (ya ha pasado).
- Manos en posiciones simples (puños sueltos, dedos juntos, manos apoyadas). Evitar palmas pegadas o dedos entrelazados si luego hay que separarlos en el vídeo.
- Evitar que un objeto tape la cara: cada vez que la cara desaparece y reaparece, hay riesgo de que cambie de identidad.
- **Ediciones:** la imagen a editar va **siempre como Image 1**. Fórmula: `Edit Image 1. Keep everything identical: … Change only …`. Si el orden se invierte, el modelo regenera desde la otra imagen y lo estropea.
- Cámara fija en trípode cuando ella usa las dos manos o entrena. En mano solo si la escena implica que alguien la graba.
- Paneles para CapCut: 21:9, sin texto. Evitar "skin removed" o "muscle fibers", que saltan como contenido gráfico; usar `stylized educational diagram … calm, clinical, non-graphic`.

### Estrategia de keyframes

- **Bucle** (ejercicios): una sola imagen como start frame y como end frame.
- **Narrativa** (el estado final es distinto, por ejemplo una mascarilla puesta): end frame generado con Image 1 = start frame (identidad, ropa, sala, luz) e Image 2 = frame final de la referencia (pose y objetos). Mismo encuadre y mismo peinado que el start frame, salvo que la acción lo justifique.
- **Anatomía:** las proporciones tienen que cuadrar con la pose. Caso real: en una postura de mariposa con los pies sin acercarse a la cadera, las piernas salían un 40 % más largas y Seedance las estiraba.

### Prompts de Seedance

- Plantillas en el Anexo A. Duración entre 4 y 15 s.
- Timeline en tramos de 1-3 s (`0-3s: …`), con acciones concretas, no estados.
- Bloques fijos:
  - `Each hand keeps five fingers`;
  - las extremidades mantienen su longitud y nunca atraviesan objetos;
  - los objetos se comportan como en la realidad;
  - la cara sigue visible;
  - cámara (`locked off, no zoom, no reframing` o en mano);
  - luz `exactly as in the start frame`;
  - sin texto.
- Movimientos rápidos: `real-time speed` y `natural motion blur on fast-moving hands and feet, like a real phone video`.
- Física moderada. "Swings / bounces" para el pelo exagera (la coleta salía disparada); usar `only sways slightly`.
- Si al regenerar algo salió bien, describir lo que salió (por ejemplo "knee tucks" en lugar de "straight-leg kicks").
- El texto nunca contradice el end frame.
- Expresiones: sonrisa genuina con cambios naturales, esfuerzo cuando toca, mirada a cámara.

### QA de imágenes (Claude visión + métricas)

- La identidad es la del avatar, no la cara de la referencia.
- El color de pelo es el correcto.
- No queda ningún texto, emoji ni marca de la referencia.
- Manos: cinco dedos, sin dedos de más y uñas coherentes.
- Anatomía y proporciones coherentes con la pose.
- Objetos correctos (por ejemplo, la cáscara parece cáscara real y no un parche).
- Ropa y entorno según el plan.
- **End frames:** superposición con el start frame (diferencia media en zonas de fondo y torso) y mismo peinado.

### QA de vídeo

- Frames a 2 fps, más frames cada 0,4 s en los tramos críticos.
- Claude comprueba, tramo a tramo, que cada acción del timeline ocurre.
- Deformaciones a vigilar: dedos, la cara cuando algo la tapa, objetos que aparecen o desaparecen, pelo antinatural, ropa o joyas que cambian.
- **Métrica de bucle** (solo formatos en bucle):
  - reducir los frames a 180x320 en escala de grises;
  - calcular la diferencia media entre el último y el primero;
  - compararla con la mediana de diferencias entre frames consecutivos de los 3 primeros segundos.
  - Si la supera claramente, aplicar el arreglo automático: cortar en 1,0 s, mover el trozo 0-1 s al final y poner un fundido de 0,2 s en la unión original. Volver a medir.
- En los bucles, eliminar el último frame (es un duplicado del primero).
