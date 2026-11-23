# Every model explains itself and says whether it runs here

Status: approved by the owner, 2026-11-23 (shown 2026-11-22 and again 2026-11-23; the owner
answered "continue work").

## Intent

The owner's words: "add the same the same prompts we have for text gen explaining everything
from hugging face on all other models like image etc. As well as if it can run it locally".

Text model cards already show what Hugging Face knows: downloads, likes, when the model was
updated, and a "Good for" line. Image, transcription (Whisper) and LiteRT cards show far less:
an image card shows only its size and chip. Every card, text included, should also answer
"will this run on my phone?" before the download starts, not after.

## What the owner sees

Image tab, one card:

```
DreamShaper V8 (NPU 8gen2)                     1.0 GB
Runs on this phone
Original: Lykon/DreamShaper
364K downloads this month · 1.0K likes
Good for: <from the maker's page>
```

Transcription tab, one card:

```
Large v3 Turbo                                 809 MB
Runs on this phone
Original: openai/whisper-large-v3-turbo
<N> downloads this month · <N> likes
Good for: Speech to text in 99 languages; smaller than Large v3
```

A card that will not run says why instead: "Won't run: needs about 5.1 GB, this phone allows
4.2 GB" or "Won't run: needs Snapdragon 8 Gen 2 or newer". "Tight on this phone" means the
app will load it but warns first.

## Goals

- **Run answer on every card** (text, image, Whisper, LiteRT): "Runs on this phone", "Tight on
  this phone" or "Won't run: <reason>". It uses the same numbers as the load check in
  `activeModelService/memory.ts`: `modelMemoryBudgetMB` for Won't run,
  `modelWarningThresholdMB` for Tight, `textOverheadMultiplier` for text,
  `hardwareService.estimateImageModelRam` for image, and `getImageModelCompatibility` for the
  chip. So the card never promises a model the app then refuses.
- **Numbers from the original model's page.** Hugging Face reports 0 downloads for the repos
  the app downloads image and Whisper files from (`xororz/sd-mnn`, `xororz/sd-qnn`,
  `ggerganov/whisper.cpp`). Each image and Whisper model is mapped by hand to the page of the
  model it was converted from (`openai/whisper-*`, `Lykon/DreamShaper`, ...). The card names
  that page ("Original: ...") so the numbers are not mistaken for the file's own.
- **Notes for image models** where the maker has a Hugging Face page. Written in our words from
  that page, checked by a second reviewer, stored in `features/modelGuide/notes.ts`
  (`IMAGE_NOTES`), so they work offline. Shown on the card and in "Which model?".
- **Image tab sorting:** Popular, Most liked, Newest, Size. Models without an original page sort
  last for the first three.
- **One fix found on the way:** "Your models" estimates image RAM at 1.8 times the file while
  the Android load gate uses 2.5. It should call `estimateImageModelRam`.

## Non-goals

- Voices: they are Android's own text-to-speech voices, not Hugging Face models. Nothing to
  explain.
- No description for an image model whose maker has no page (about 13 of the 20). It gets
  size, chip and the run answer only.
- No numbers offline. Text models already need a connection for theirs; the same notice covers
  the other tabs.
- No speed or quality claims, as for text notes.

## Anti-goals

- A card that says "Runs" and a load that then refuses.
- A description or number taken from a re-upload page that does not describe the file the app
  downloads.

## Approaches

1. **Chosen: hand-made map to the original page, numbers fetched live, notes bundled.** Same as
   text models: numbers need a connection, notes do not. About 30 lines of mapping data.
2. Bundle the numbers too. Works offline, but they go stale at every release and would need
   a release just to refresh them.
3. Use the download repo's own numbers. They are 0, so this shows nothing.

## Left to the builder

- Where the run answer sits in `ModelCardContent` (it replaces the "Too large" fallback badge).
- Whisper has no load gate. Its run answer uses `ramGB` where the catalogue gives one, else the
  file size, against the same two thresholds.
- Which image names have a maker page: a research step lists the page for each of the 20 names
  (`AbsoluteReality`, `AnythingV5`, ... `unStableIllusion`) or the reason there is none.

Separate from this work, for the owner: the app never turns on a filter for adult pictures. I
believe Google Play requires one for AI image apps, but its current policy has not been checked.
