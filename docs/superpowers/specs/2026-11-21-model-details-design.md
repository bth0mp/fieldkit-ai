# Model details, popularity and a "Which model?" guide

Status: draft for the owner's approval, 2026-11-21.

## Intent

The owner loves the app and now wants help choosing models. Their words: "I want to see
most downloaded. Last updated. Most used. Best use cases per model on what to choose.
Recommendations for hardware for each kind of phone etc. Also allow me to search for more
models that might be released capable for my phone."

"Most used" means what other people use, as counted by the site the models come from
(Hugging Face), not usage on this phone. The advice is hand-written notes. The owner
approved the screen sketch below ("Looks perfect") and chose to extend the existing Models
screen with notes bundled in the app ("Let's go with 1").

Why: today the Models screen shows a name, a size and a one-line description. Choosing
between a dozen look-alike names needs a reason ("good for notes and summaries, runs well
on your phone"), and new releases appear on Hugging Face every week.

## What the owner sees

Model card, in search results and in the picks list:

```
Qwen 3.5 2B                         Recommended
1.2M downloads this month · 9.8M all time
2.3k likes · updated 3 days ago
Good for: everyday chat, notes, summaries
```

Models screen, top of the Text tab:

```
[ Which model? ]          (opens the guide)
Sort: Trending | Most downloaded | Most liked | New releases
```

"Which model?" guide (its own screen):

```
Your phone: 12 GB memory                (the user's tier is highlighted)

4 GB   e.g. <example phones>   Runs: tiny chat models, Whisper Tiny/Base
6 GB   ...
8 GB   ...
12 GB  <- you   Runs well: Gemma 4 E4B, Qwen 3.5 9B, ...  Tight: ...
16 GB  ...

Text models
  Gemma 4 E4B   Good for: ...   Not for: ...   Fits: 6 GB and up
  ...
Image models
  ...
Transcription
  Whisper Small   Good for: ...   Not for: ...
```

With no connection, the guide and every note still show. Sorting, search and the
download numbers show "Needs a connection" in their place.

## Goals

1. **Numbers on every model card** that comes from Hugging Face: downloads in the last 30
   days, all-time downloads, likes, and "updated N days ago" (from `lastModified`).
   Shortened as 1.2M, 9.8M, 2.3k.
   - The picks list already fetches each pick's Hugging Face details when the tab opens
     (`fetchRecommendedModelDetails`, one `/models/{id}` call per pick). Add the missing
     fields to that call and to `transformModelResult`; do not add a new request on open.
     A pick whose call fails shows its note without numbers, as it does offline.
2. **Sorts that ask Hugging Face**, not a reorder of the first 30 results:
   - Trending: `sort=trendingScore`.
   - Most downloaded: `sort=downloads`. This is Hugging Face's 30-day count, which is
     what "most used" means here.
   - Most liked: `sort=likes`.
   - New releases: newest first (`sort=createdAt`), limited to known publishers (see
     "My calls").
   How they sit in the sort pill:
   - These four replace the current client-side "Downloads" and "Newest" options.
     "Smart" (the default), "For you" and "Size" stay as client-side reorders of
     whatever list is showing.
   - Picking one of the four runs a search, even with an empty query, the same way a
     filter change does today (`runSearch`). The results replace the picks list, and
     the typed query and filters still apply.
   - Going back to "Smart" with an empty query and no filters shows the picks list
     again.
   - Nothing new is fetched when the tab opens.
3. **Only models that can fit the phone** come back. The request asks Hugging Face for
   models at or under the phone's size limit, using `num_parameters=min:0,max:<N>B`
   (checked live 2026-11-21: known repos such as bartowski's Mistral 7B pass `max:8B`;
   a repo Hugging Face has no size for may be left out, which is accepted). N is
   `maxParams` in `MODEL_RECOMMENDATIONS.memoryToParams` for the phone's tier, as
   worked out in goal 4. The existing per-file check (`fileExceedsBudget`) still hides
   files that are too big.
4. **A "Which model?" guide**, opened from the top of the Models screen:
   - Phone tiers by memory: 4, 6, 8, 12 and 16 GB (the tiers in `memoryToParams`; 3 GB
     folds into 4). Each has two or three example phones and what runs well on it.
   - The user's tier is highlighted. A phone reports less memory than the box says: the
     owner's 12 GB S24 Ultra reports 10.8 GB (`MemTotal` 11350580 kB, read over adb on
     2026-11-21). So the tier is the smallest of 4, 6, 8, 12 and 16 at or above
     `hardwareService.getTotalMemoryGB()`, and 16 for anything above 16. One helper
     does this, and goal 3's size limit uses it too.
   - A short "getting the most from your phone" part: keep it plugged in and cool for long
     jobs, close other apps, and on Snapdragon phones the NPU image models (QNN) are
     faster than the CPU ones (MNN).
   - Notes for each pick: "Good for" and "Not for" lines, and which tiers it fits.
5. **Hand-written notes, bundled in the app**, for:
   - every entry in `RECOMMENDED_MODELS` (11 text and vision models);
   - every entry in `WHISPER_MODELS` (10; English-only and multilingual pairs can share
     one note);
   - image models, as notes on CPU (MNN) and NPU (QNN) and on each model the image list
     shows today;
   - the curated LiteRT models (`curatedLiteRTRegistry.ts`), if any are listed on the
     phone.
   A card shows the model's "Good for" line, when it has a note.
   - Writing the notes is part of this build, not something the owner supplies. One
     subagent writes each note from the model card, and a second checks it against the
     same card. Example phones are checked the same way, against the maker's spec page.
   - Every note ships in the first release. A model whose card supports no honest
     "Good for" line ships without a note, never with placeholder text.
6. **Automatic labels on search results** that have no note: "Vision", "Coding" and
   "Small, fast", worked out from the Hugging Face tags, name and size.
7. **Works offline**: the guide and notes need no connection. The numbers, sorts and search
   say "Needs a connection" when `useOffline()` is true, instead of showing an error or an
   empty list. The picks list still shows offline, with notes and without numbers.
   Search only ever reaches Hugging Face. Downloaded models live on their own screen,
   and that screen does not change.

## Non-goals

- Tracking which models this phone uses.
- Measured speed (tokens per second) per phone. The tier labels come from the app's own
  size rules.
- Notes for every search result. Only the picks get notes; search results get labels.
- Paging past the first page of results.
- New sorts or numbers on the Image and Transcription tabs. Their lists are fixed or come
  from one repo; they get notes, not popularity numbers.
- Caching numbers for offline use.

## Anti-goals (a failure even if it works)

- A note says something about a model that its model card does not support, or a "fits"
  label recommends a model that the app then refuses to load.
- Sorting returns a list that is mostly zero-download personal uploads, or mostly models
  too big to run.
- The Models screen gets slower to open, or the Text tab stops working with no
  connection.
- Any name, logo or link from the app this one started from appears.

## Constraints

- CLAUDE.md applies:
  - theme tokens only (`TYPOGRAPHY`, `COLORS` via `useTheme`, `SPACING`);
  - font weights 400 or less;
  - Feather icons;
  - no emoji;
  - no business logic in screens or hooks;
  - one rendered integration test per fix, faking only at the device boundary
    (`__tests__/harness/`).
- No new dependencies. Plain `fetch` to the Hugging Face API, as `huggingface.ts` does
  today.
- `expand[]=gguf` sends each model's whole chat template (several KB per model, checked
  2026-11-21). Do not request it for lists. Get the size from `num_parameters`, the name
  and `safetensors` where needed, or ask for `gguf` only on the detail screen.
- Plain `filter=gguf` also returns image-generation GGUFs (for example Qwen-Image). Text
  sorts add `pipeline_tag=text-generation` or the same rule `searchModels` uses today.
- Notes follow the guide library's content rules. Each note is written from the model's
  own Hugging Face model card. It states no more than the card supports, and records that
  card's URL in the data (not shown to the user). A second reviewer reads every note
  against its card.
- Example phones per tier must be checked against each maker's spec page. If a tier
  can't be checked, leave its examples out rather than guess.
- Release: 0.4.0 (minor feature), signed, once CI is green and the owner approves.

## Approaches

1. **Extend the Models screen, with notes bundled in the app** (chosen: "Let's go
   with 1"). The cards and sorts change in place. The guide is one new screen, and the
   notes are a data file in the app. It works offline and ships with each release. The
   cost is that new notes wait for an app update.
2. **An online notes catalogue**, like the guide library. Notes could be updated without a
   release, but it needs hosting and a download step, and it does not work on first
   launch offline.
3. **A separate guide section with its own search.** It keeps Models untouched, but it
   splits one choice across two places, and the owner would have to switch between them.

## Owner's decisions

- "Most used" is Hugging Face popularity, not local tracking.
- The notes are hand-written.
- The card and guide layout is the sketch above ("Looks perfect").
- Approach 1.

## My calls (owner, please check these)

- **"Most downloaded" uses this month's count.** Hugging Face sorts by the last 30 days;
  all-time is shown on the card but not offered as a sort.
- **"New releases" covers known publishers only:** unsloth, bartowski, ggml-org,
  lmstudio-community and QuantFactory, merged newest first. Any upload sorted by date is
  mostly zero-download personal files (checked 2026-11-21). New models from big makers
  reach these publishers within days. Trending catches popular new ones from anyone.
  - `author=` takes one name, so the five calls run in parallel and are merged.
  - If one fails, the rest still show. If all fail, it shows the existing search error.
  - Trending, Most downloaded and Most liked get no minimum count, because they rank by
    popularity already.
- **Fit labels come from existing data, not from measurement.** The guide says that
  they come from size, not a speed test.
  - A text pick is "Runs well" on tiers above its `minRam`, "Tight" on the tier equal
    to its `minRam`, and not listed below that.
  - Whisper and image models have no `minRam`. Their label comes from the app's own load
    rule: `fileExceedsBudget` with the file's size at each tier's memory. That way the
    guide never recommends a file the app would refuse.
- **The memory tier rounds up to the size on the box**, in the new guide and the new
  sorts only. The existing device banner and the "For you" sort keep using the raw
  number, so on the owner's phone they still treat it as the 8 GB tier. Changing them
  would change today's recommendations, so it is left for later.
- **Tiers by memory only.** The chip gets one line of advice (Snapdragon NPU for images),
  not its own tiers.
- **Popularity is per repo.** The same model is published by several quantizers, so
  "downloads" counts one repo, not the model family. The card does not try to add them
  up.
- **Labels:**
  - "Vision" when the tags or `pipeline_tag` say image-text-to-text, or the repo has an
    `mmproj` file;
  - "Coding" when the name or tags contain "code" or "coder";
  - "Small, fast" at 2B parameters or under.
  At most two labels per card.

## Left to the builder

- Screen and file names, and where the notes data lives. A typed TypeScript data file
  like `src/features/quickReference/cards.ts` is the pattern to copy.
- How the guide registers: the main stack or `screenRegistry`, whichever the Models
  screen's other sub-screens use.
- The exact request for each sort, the number of results per page (30 today), and how
  the "New releases" calls merge.
- Number formatting (1.2M, 2.3k), and "updated today, 3 days ago, 2 months ago".
- The testIDs for the new parts, keeping the existing ones unchanged:
  `models-screen`, `search-input`, `sort-pill`, `model-card-{i}`, `model-detail-screen`.
