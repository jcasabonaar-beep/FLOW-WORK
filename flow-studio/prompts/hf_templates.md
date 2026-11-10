# Plantillas de prompts (Higgsfield)

{IDENTITY BLOCK} = el bloque de identidad de config.json (higgsfield.identity).

### A1. Nano Banana Pro, imagen base desde una referencia

```
Use Image 1 for the woman's identity: face, facial features, skin, silver-grey hair color and body. Use Image 2 for her outfit, {setting elements}, her pose and the camera angle. Ignore all text in Image 2, and do not copy the face or the hair of the woman in Image 2.

{IDENTITY BLOCK} {hairstyle for this action}. She wears {outfit from Image 2}.

{Exact pose: body position, which hand does what, fingers, gaze, expression.}

{Setting from Image 2, element by element.}

Framing, vertical 9:16: {positions as fractions of the frame}. The camera is about {distance} {in front of / beside} her at {height}.

Shot on iPhone 15 main camera, 24mm f/1.9, {tripod / handheld by someone…}. {Light direction and quality}, natural sensor grain, real skin texture with visible pores. No text, captions, emojis, logos or watermarks.
```

### A2. Nano Banana Pro, end frame (narrativa)

```
Use Image 1 for the woman's identity, face, silver-grey hair, outfit, jewelry, nails, room and lighting. Use Image 2 only for {objects / final state}, her hand position and the framing; ignore all text in Image 2 and do not copy the face or the hair of the woman in Image 2.

The same woman from Image 1, {final state described precisely}. {Hands and fingers}. {Gaze and expression}. Her hair is {same as Image 1}.

Framing, vertical 9:16: the same framing as Image 1. The same room from Image 1.

Shot on iPhone 15 main camera, 24mm f/1.9, on a tripod at eye level. The same light as in Image 1, natural sensor grain, real skin texture with visible pores. No text, captions, emojis, logos or watermarks.
```

### A3. Nano Banana Pro, edición

```
Edit Image 1. Keep everything identical: {list of everything that must not change}.

Change only {one thing}, using Image 2 as reference: {exact description}.

No text, captions, logos or watermarks.
```

### A4. Seedance, bucle

```
Start frame and end frame: the same provided image. The video begins and ends on exactly that pose, so it loops seamlessly.

The same woman from the start frame, in the same {outfit}, {position}. {Energy and speed}. She keeps looking into the lens with {expression}.

{0-Xs: beat 1}
{…}
{last beat: … settles into the exact pose of the end frame.}

{Motion rules: hands five fingers, limbs constant length, objects real, physics moderate.}

Camera: iPhone 15 main camera, 24mm f/1.9, {tripod locked off / handheld}, no zoom, no reframing; {full body stays in frame}. {Light} exactly as in the start frame, natural sensor grain. No text, captions, emojis, logos or watermarks.
```

### A5. Seedance, narrativa con end frame

```
Start frame: the first provided image. End frame: the second provided image, {final state}. The video moves continuously from one to the other in a single real-time take, like a real phone video of {topic}.

The same woman throughout, in the same {outfit, jewelry, hair}, in the same room.

{0-Xs: beat 1}
{…}
{last beat: … settling into the exact pose of the end frame.}

{Motion rules + object rules + "her face, eyes and identity stay the same throughout".}

Camera: iPhone 15 main camera, 24mm f/1.9, on a tripod at eye level, locked off, no zoom, no reframing. {Light} exactly as in the start frame, natural sensor grain, real skin texture. No text, captions, emojis, logos or watermarks.
```

