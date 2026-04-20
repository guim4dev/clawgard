# Clawgard — Logo Prompts (working doc)

Direction chosen: **hybrid crab-rune glyph** — a single abstract mark that reads
simultaneously as a stylized crab and as a Norse-inspired rune. Clean, confident,
one-idea logomark in the Vercel / Arc / Deno family.

Paste the prompts below into ChatGPT / DALL-E / Midjourney and iterate.

---

## Primary — paste first, ask for 4 variations

```
Logo for open-source developer tool "Clawgard". Design: a single abstract
glyph that reads simultaneously as a stylized crab (two claws on the sides,
small body in the middle) AND as a Norse-inspired rune (angular, symmetric,
made of straight or subtly curved geometric strokes only — no organic curves).
The two crab claws double as the two "arms" of a rune-like symbol. Strict
bilateral symmetry around the vertical axis. Stroke weight uniform throughout.
Negative space readable at 16x16px (test: the whole mark should still be
legible as a silhouette at favicon size).

Flat vector, single solid color fill, no gradients, no shading, no texture,
no drop shadow. Aesthetic reference: Vercel, Arc browser, Deno logomarks —
clean, confident, one idea.

Color: deep indigo (#312e81). Transparent background (true alpha, no off-white
halo). 1024x1024 PNG. No text, no outer frame, no background rectangle.

Generate 4 distinct variations exploring different rune-stroke interpretations
while keeping the crab-reading intact.
```

---

## Dark-mode / inverted variant

Run after picking the primary silhouette.

```
Same glyph as the previous Clawgard logomark, but inverted: pure white
(#ffffff) solid fill on transparent background. Identical shape, identical
proportions, identical symmetry — ONLY the color changes. 1024x1024 PNG.
```

---

## Favicon simplified (16x16 / 32x32 target)

```
Simplified favicon version of the Clawgard logomark. Same crab-rune glyph but
stripped to its bare silhouette: chunkier strokes, fewer internal details,
optimized for legibility at 16x16 and 32x32. Bilateral symmetry preserved.
Flat vector, solid indigo (#312e81), transparent background. Output 1024x1024
PNG so it down-samples cleanly. No text, no frame, no drop shadow.
```

---

## Open Graph banner (1200x630)

```
Open Graph social-share banner for open-source project "Clawgard". Layout:
the Clawgard crab-rune glyph on the left third (deep indigo #312e81, ~400px
tall), centered vertically. Right two-thirds is empty negative space on a
subtle off-white background (#fafafa) — designed so the text "Clawgard /
self-hosted agent-to-agent relay" can be added later in a separate step.
No text in this image. No gradients, no photography, no drop shadow. Clean,
editorial, developer-tool aesthetic. 1200x630 PNG.
```

---

## Iteration tips

- Generate 4 variations of the primary first; pick the silhouette that reads
  as BOTH crab and rune without effort.
- If the background comes back off-white instead of transparent: add
  "pure alpha transparency, no off-white halo around edges" to the prompt.
- When happy with the PNG, trace to SVG in Figma/Illustrator — ChatGPT won't
  give you vector output directly.
- Keep the final asset at `docs/branding/logo.svg` + `logo.png` + `favicon.png`
  once the direction is locked.

## Decisions to revisit when picking the final mark

- Does the glyph survive monochrome? (Should — it's already single-color.)
- Does it survive inverted on a dark background?
- Is it confused with any existing logomark in the dev-tool space? (Quick
  sanity check: Dribbble / Brandmark / Google Images search for "crab logo
  minimal" and "rune logo minimal".)
- Does the mark still read as "Clawgard" when placed next to "hatchling" /
  "buddy" terminology? The crab nods to "claw", so yes — but confirm with a
  non-team reader.
