The clip prompt animates the approved frame of that clip (start frame) in Flow with the image-to-video model. The model creates the voice too.

ANALYZE the frame and the line, and describe:
- The exact action she performs during the clip, step by step, tied to words of the line ("on 'cinnamon' she taps the jar").
- The objects she interacts with and what happens to them (milk steams, spice falls, layers move in the tube).

FIXED RULES, always included:
- "Shot on iPhone, handheld but steady, vertical 9:16, natural phone-video look, the face stays large and close to the lens."
- "Hyperrealistic, natural human movements."
- She performs the action and speaks simultaneously, in one continuous take, looking directly into the lens.
- Speech delivery: talks continuously and naturally, like a real person telling a friend: fluid and energetic, no long pauses, no hesitations, only the tiny natural breath between sentences. Commas are NOT pauses: she reads straight through them without stopping. She says every word exactly ONCE: never repeats a word, never restarts a phrase, never stutters. She starts speaking on the first frame and finishes before the last second.
- Dialogue block: "{{SPEECH}}. Voice: {{VOICE}}. Very energetic, warm and enthusiastic, clear lip sync, looking straight into the lens." then the line in quotes as {{LINE}}.
- Audio: "No background music, no sound effects; only natural room ambience, the real sounds of the action and her voice."
- "IMPORTANT: do NOT add subtitles, captions or any on-screen text. The only text allowed is what already exists on real objects in the frame (product labels, the book cover, the store sign), unchanged." Put this sentence in EVERY clip prompt, near the start AND repeated as the last-but-one line: our editor adds its own subtitles later, so any text from Flow ruins the clip and it will be regenerated.
- Never eat or drink while speaking.
- "She says the line exactly once, word for word: no repeated words, no extra words before or after it."

HOOK (clip 1, always) and up to 2 other key moments of the script (a reveal, a surprise, the strongest claim): add exactly this, translated into the action you describe: "{{HOOK_STYLE}}" For those clips the camera is handheld with that gentle push-in and pull-back instead of static. Mark them with "hookStyle": true.

HOOK CLIP (clip 1): the camera starts on what she shows and pushes in on it so the viewer clearly sees what happens (e.g. the small balls dropping out of the tube's funnel onto the paper), then reframes to include her face as she speaks. The key action of the prop must happen visibly in the first 2 seconds.

VOICE CONTINUITY: every clip must sound like the same woman in the same moment: same voice, same accent, same energy level as clip 1. Include: "Same voice, tone and energy as the previous clips."

CAMERA: static by default (except the hook-style clips). If the reference clearly moves (push-in to an object, quick reframe), describe it precisely: on which word it starts, speed, where it lands, and that the voice continues uninterrupted.

NEVER describe her appearance, clothing or the setting.

LAST LINE, exactly: "The provided start frame defines the character's appearance, clothing and setting. Continue from there."
