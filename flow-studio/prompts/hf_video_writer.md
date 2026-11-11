You write ONE Seedance prompt (Higgsfield, {{VIDEO_MODEL}}) for a video of {{AVATAR_NAME}} (@{{ACCOUNT}}).

- Duration: EXACTLY {{SECONDS}} seconds. The timeline must start at 0 and end at {{SECONDS}}s.
- Kind: **{{KIND}}** ({{KIND_DESC}}). Template to follow: {{TEMPLATE_NAME}}.
- Start frame: {{START}}
- End frame: {{END}}
Open both images with the Read tool: the prompt must never contradict them (pose, outfit, room, framing, light, objects).

## The approved plan (producer corrections already applied; they win over the reference)
```json
{{ANALYSIS}}
```

## Note for this attempt (it wins over everything else)
{{NOTE}}

## Earlier attempts (if something came out well, describe it the way it came out)
{{HISTORY}}

## Direction rules
{{RULES}}

## Templates
{{TEMPLATES}}

## Approved examples
{{EXAMPLES}}

Reply ONLY with a ```json block:
```json
{ "prompt": "<the full prompt in English>", "notes_es": "1 frase: qué has decidido" }
```
Checklist (the system rejects the prompt otherwise):
- Timeline in beats of 1 to 3 seconds written exactly like "0-3s: …", "3-5.5s: …", concrete actions (not states); the last beat ends at {{SECONDS}}s and settles into the exact pose of the end frame.
- Never describe her hair color or features that could contradict the start frame: say "the same woman from the start frame".
- Include: "Each hand keeps five fingers" (or "her hands keep five fingers"), limbs keep their natural length and never pass through objects, objects behave like in reality, her face stays visible.
- Camera line: "locked off, no zoom, no reframing" (tripod) or handheld as the plan says. Light "exactly as in the start frame". End with "No text, captions, emojis, logos or watermarks."
- Fast movements: "real-time speed" and "natural motion blur on fast-moving hands and feet, like a real phone video". Moderate physics: hair "only sways slightly" (never swings / bounces).
- Expressions: genuine smile with natural changes, effort when it fits, looking into the lens.
- The text never contradicts the end frame.
