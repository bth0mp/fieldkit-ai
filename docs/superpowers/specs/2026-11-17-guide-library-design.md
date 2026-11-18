# Guide library: design

Date: 2026-11-17. Branch: `feat/field-guides` (continues the bundled field guides work, commits 98a512861..8ac90f404).

## Intent

Fieldkit AI ships six public-domain field guides inside the APK. The owner wants friends to be able to get many
more: a list of hundreds of free, copyright-free guides, sorted by category, that anyone can download inside the
app while they have internet and use later without it. The app is for off-grid use, so everything downloaded
must work offline afterwards.

The promise to users is "free and copyright free". A guide with a wrong or unproven licence is a failure even if
the feature works.

## Goals

- A Guide library screen that lists checked guides by category.
- Download any guide. Once downloaded it can be read straight away in the phone's PDF viewer.
- Teaching the assistant is a separate choice per guide: a taught guide joins the Field guides knowledge base and
  answers cite it, like the six built-in guides.
- Remove a downloaded guide (file and, if taught, its index).
- A catalogue of at least 100 checked guides to start, growing toward hundreds.
- The catalogue ships inside the app and is refreshed from the GitHub repo, so guides can be added and dead
  links fixed without a new APK.
- Every guide shows its publisher, licence and source link.

## Non-goals

- Live search of outside sites (Internet Archive, govinfo). See Approaches.
- Hosting or redistributing guide files ourselves. The phone downloads each file from the address in the
  catalogue (see "Where the file comes from"). The six bundled guides stay as they are.
- OCR. A scanned guide with no text layer can be read but not taught.
- Following new editions of a guide automatically.
- Downloads that survive the app being killed. Guides are small; a failed download is retried by hand.
- iOS.

## Anti-goals

- Listing any guide that is not provably public domain, CC0 or CC BY.
- Network traffic the user did not cause. The app is offline-first: the catalogue refresh runs only when the
  Guide library screen is opened or the user asks for a refresh. Never at app start, never in the background.
- Opening or indexing a downloaded file that does not match the checked copy (size and SHA-256).
- Answers getting slow without the user knowing why (see Scale limit).

## Constraints

- `CLAUDE.md`: licensing rules, theme tokens only, no emoji in UI text, services own state and side effects,
  stores are read-only projections, one rendered integration test per behaviour faking only the device
  boundary, checks (`tsc`, eslint, depcruise, knip) before each commit, commit each green step separately.
- Do not touch `src/services/tools`, `src/services/actions` or `generationToolLoop.ts` (another session's work).
- No new npm dependencies are needed: `react-native-fs` downloads and hashes, `@react-native-documents/viewer`
  opens PDFs (already used in `src/components/ChatMessage/components/MessageAttachments.tsx`).
- The repo `bth0mp/fieldkit-ai` is public, default branch `main`, so a raw file URL works without sign-in. The
  remote catalogue only becomes reachable once this work is merged to `main` and pushed, which the owner does.
  Until then the app runs on the bundled copy.
- Scale limit: `src/services/rag/retrieval.ts` loads every embedding in a project into memory and scores them
  all for each question. The six bundled guides are fine. Dozens of taught guides will be slow and may run out
  of memory. Indexing speed on the phone has not been measured yet.
- `ragService.indexDocument` refuses picked files over 5 MB and stops at 500,000 characters. Its `bundled: true`
  option skips both for a known file already in app storage (cap 2,000,000 characters). Library guides are the
  same kind of file.
- Government sites are flaky for scripted downloads (seen so far: DNS failures on armypubs.army.mil, bot
  challenges on irp.fas.org, HTTP 429 from web.archive.org, timeouts on nrcs.usda.gov). The catalogue check must
  be repeatable, and a guide must only be listed if a plain HTTPS GET fetches it.

## Approaches

- **A. Checked list, bundled and refreshed from GitHub (picked).** Every guide is checked before it is listed.
  The list ships in the app and is refreshed from the repo. Cost: the list only grows as fast as guides are
  checked.
- **B. Checked list, bundled only.** One fetch simpler, but a dead link stays dead until the next APK.
- **C. Live search of big online libraries.** No checking work, millions of results, but those sites mix
  copyrighted books with free ones, so the "copyright free" promise could not be kept.

The owner picked A on 2026-11-17, and separately chose that a downloaded guide is readable at once with
teaching as a per-guide choice.

## What the owner decided

- Hundreds of guides, in categories, downloadable in the app, for the owner and friends.
- Only free, copyright-free guides.
- Approach A.
- Downloaded guides are readable straight away; teaching the assistant is per guide.
- Building happens overnight on 2026-11-17/18 without the owner present.

Everything below is the designer's call unless marked otherwise.

## Licence rules for the catalogue

Allowed:

- Works of the United States federal government written by its employees (17 U.S.C. 105): Army, Navy, Air Force,
  Marine Corps and Coast Guard publications marked "approved for public release; distribution is unlimited",
  and publications of USDA, FEMA, CDC, NIH, EPA, NOAA/NWS, USGS, NPS, USFS, FAA, DOE and similar agencies.
- CC0 and CC BY works, with the attribution recorded.

Not allowed: CC BY-NC, CC BY-ND and CC BY-SA works; state, university and extension-service publications;
NGO manuals (Hesperian, Red Cross, WHO); contractor-written reports where the contractor may hold copyright
(national laboratories such as Sandia and NREL, Peace Corps manuals written under contract) unless the document
itself states it is public domain; anything whose status is unclear. When in doubt, leave it out and record why
in `catalog/REJECTED.md`.

Each listed guide records where its licence is stated (for example the distribution statement on the title
page), so the claim can be checked again later.

What counts as proof (designer's call, deliberately strict):

- Military publications: the distribution statement printed in the document.
- Civilian-agency publications: either the document or its official page says it is public domain, not
  copyrighted or free to reproduce; or the document is published under the agency's name alone, with no outside
  author, university, contractor or cooperative-agreement credit and no copyright notice, and the agency's own
  site states that its publications are public domain. The `licenceNote` quotes or points at that statement.
- An agency logo on the cover is not proof. A guide that credits outside authors is rejected unless it carries
  its own public-domain statement.

This makes the first catalogue mostly military manuals (Army, Navy, Marine Corps, Coast Guard), which is where
100 or more provable guides are. Civilian guides join as their statements are found.

### The pictures are part of the proof (picture audit, 18 November 2026)

A text search cannot see a credit printed inside a picture, a copyright notice held only in an image's embedded
metadata, or a maker's catalogue photograph, which carries no credit at all. So no guide is listed until
someone has looked by eye at every page that carries a picture, and its `creditsNote` says so. The audit that
established this looked at 4,340 pages of 42 listed guides and removed twelve. What it settled:

- **A credit in a picture or in image metadata counts like a printed one.** "Reproduced by courtesy of", "Courtesy
  of", a photographer's copyright notice in the image's metadata: out.
- **A labelled extract of another body's document is reproduced.** Pages a manual labels as an extract of a NATO
  agreement, or scanned pages that are visibly a standards body's own (its typeface, section heads and
  markers): out. NATO, ISO, IEC, ANSI, IEEE and NFPA are outside owners; a body of the United States government
  is not, and a state agency named as the cooperating agency on a federal map does not own the map.
- **Issue equipment against commercial products.** The services photograph their own issue items as cut-outs on
  blank backgrounds; with no maker's branding or catalogue styling these are the service's own. A cut-out of a
  commercial product that shows the maker's branding, model naming, sales callouts or a rating plate as its
  subject is the maker's picture: out. A cut-out of a commercial product with nothing in the picture to settle
  whose it is goes to the owner, and stays out until the owner rules.
- **A maker's name on a thing is not a maker's picture of the thing.** A nameplate or logo on equipment in the
  manual's own drawing or photograph is fine. A drawing whose lettering, callouts or style show it was lifted
  from the maker's literature is out.
- **A redrawn scale or chart is the manual's own; another body's artwork carried over unchanged is not.**

Newer guides are where this bites: recent agency layouts drop in web product shots and stock renders with no
credit. Older line art and field photographs were clean every time.

### Owner's rulings, 18 November 2026

The overnight build drew five lines strictly because the owner could not be asked. The owner ruled on each the
next morning. These rulings override anything in this document, the research brief or the batch instructions
that is stricter or looser.

1. **Staff-written agency guides are proved by authorship.** A civilian-agency publication counts as public
   domain when it is written by the agency's own staff and published under the agency's name alone, credits no
   outside author, contractor, university, photographer, illustrator or other outside owner anywhere in the
   document, and carries no copyright notice. The agency's site does not have to say more than a hedged notice
   ("most information presented on the USDA Web site is considered public domain"). The `licenceNote` says the
   proof rests on 17 U.S.C. 105 and staff authorship, and quotes the agency notice where there is one. It must not
   claim a public-domain statement the document does not print. Thanks to outside partners or contributors still
   reject the guide. An uncredited image in such a publication is taken to be the agency's own, since agencies
   credit the outside images they use, unless it is evidently from elsewhere: stock imagery, a manufacturer's
   product photo, another organisation's logo, illustration or chart. An image like that rejects the guide.
2. **Citing an outside standard is fine; reproducing it is not.** A guide may name, cite, summarise or paraphrase
   an outside standard, study or book, and may list such sources as "quoted or paraphrased". A guide that
   reproduces or adapts a table, figure, photo, form or passage credited to an outside owner (a standards body,
   company, publisher, university) stays out, with or without "by permission". The `creditsNote` records each
   mention and why it is a citation and not a reproduction.
   "Reproduced" means the document itself says so: a credit line, caption, footnote or in-picture credit on the
   item, or a statement that a named passage, table or figure is taken, adapted, condensed or reprinted from a
   named outside owner's work. A table of plain data with no such attribution is taken to be the publisher's own
   compilation, even when the reference list cites a handbook, standard or company sheet that prints similar
   data; a reference-list entry is a citation. Wording that a federal regulation itself prints is the
   regulation's, whoever it names. This one test applies to every guide. Three cases it settles:
   - "Based on", "according to" or "in accordance with" a named standard or statement is a citation when the
     item is in the publisher's own words or drawing, and the `creditsNote` says how that was judged. "Adapted
     from", "reprinted from", "courtesy of" and "by permission" mean the item itself was carried over.
   - A statement that a whole document or chapter condenses, or is drawn from, a named outside work counts as a
     credit on everything it covers.
   - A source long out of copyright (the Beaufort wind scale) has no owner.
   The contractor rule above still stands by itself: content the document says a contractor wrote stays out
   unless the document states it is public domain.
3. **The second-copy rule stays.** A guide whose only copy is on a site that is not the publisher's own or an
   institutional archive needs a byte-identical copy on a second, independent site. Guides without one stay in
   `catalog/pending/third-party-host-class.json` until a second copy is found.
4. **Partly unreadable guides are listed read only.** A guide a person can read but a program cannot, in part
   (more than 2% of its text lines in a scrambled encoding, or more than a tenth of its pages being page images
   with no text layer), is listed with `"hasText": false`, so the app offers Download and Open and no teach
   switch. Its candidate carries `"readOnly": true` and a `"readOnlyNote"` saying what is unreadable. A guide with
   a few full-page figures or picture tables is not read only: the assistant learns its text and misses those
   pages, as it misses every figure. The licence checks are not relaxed: every page without a text layer, and
   every page whose text is scrambled, is looked at by eye for third-party credits before the guide is listed.
5. **Scope removals stand.** Doctrine, tactics, weapons, administration and specialist military plant stay out.

Not changed by the rulings: outdated safety advice still rejects a guide; a download the app's own request cannot
fetch still cannot be listed; when in doubt, leave it out. An image that is evidently an outside owner's (stock
imagery, a manufacturer's catalogue photograph, another organisation's logo or chart) rejects any guide,
military or civilian, whatever statement the guide prints about itself.

Where the file comes from (designer's call): the publisher's own host first. If that host is unreliable or the
file has moved, a byte-exact institutional copy is allowed: govinfo.gov, DTIC, the UNT digital library and web
archive, and Wayback Machine raw captures (`id_` form) of the official URL. A copy uploaded by a member of the
public (an Internet Archive item, a hobby site) is a last resort, allowed only when the document itself carries
its release statement, and its `licenceNote` says so. The recorded hash means a copy that later changes simply
fails to download until the catalogue is rechecked.

## Catalogue

`catalog/guides.json` at the repo root, imported into the app bundle and fetched from
`https://raw.githubusercontent.com/bth0mp/fieldkit-ai/main/catalog/guides.json`. The values below only
show the shape; they are not a checked entry. The titles in the screen sketch further down are placeholders too.

```json
{
  "version": 1,
  "updated": "2026-11-18",
  "categories": [{ "id": "medical", "name": "First aid and medical" }],
  "guides": [{
    "id": "army-tc-0-00-example",
    "title": "Example Training Circular",
    "category": "medical",
    "publisher": "US Army",
    "year": 2015,
    "licence": "Public domain",
    "licenceNote": "US government work (17 U.S.C. 105). Title page: approved for public release; distribution is unlimited.",
    "url": "https://...",
    "bytes": 10234567,
    "sha256": "...",
    "pages": 196,
    "hasText": true
  }]
}
```

Starting categories (the builder may merge or split them as the list fills in): first aid and medical; water
and sanitation; food growing, preserving and foraging; shelter and building; power and electrical; fieldcraft,
knots and survival; navigation and weather; radio and communications; vehicles, engines and tools; disasters and
emergencies; animals and farming.

The six bundled guides are not in the catalogue. They are already on the phone.

The app treats the fetched catalogue as untrusted input: it must parse, have a supported `version`, and every
guide must have an `https` URL, a 64-character hex `sha256`, a positive `bytes` and a known category. A
catalogue that fails any check is ignored and the last good one (bundled, or the last good fetch) stays. A host
allowlist is deliberately left out: whoever can change the catalogue can also publish an APK.

## Catalogue checker

`scripts/check-guides.js` (Node, no new dependencies) is how guides get into the catalogue and how the list is
re-verified later. For each candidate it downloads the file into its own new, empty directory under a temp
folder, treats it as untrusted data, and records size, SHA-256, page count and whether it has a text layer
(`pdftotext`). It looks for the public-release distribution statement in the first pages where the publisher
uses one. It fails loudly on a dead link or a changed hash. Downloaded files are deleted after checking; only
the recorded facts are kept.

Licence judgement is not automated beyond that. Each guide's `licenceNote` is written from reading the document.

## App design

**Service.** A guide library service owns the state machine for each guide: not downloaded, downloading (with
progress), downloaded, teaching, taught, failed (with a reason). Downloads go to
`<documents>/guide-library/<id>.pdf.part`, are verified against `bytes` and `sha256`, then renamed. A mismatch
deletes the file and reports "This file doesn't match the checked copy". State persists across launches; on
launch the service reconciles it with the files actually on disk and the documents actually in the knowledge
base. A zustand store projects the state for the screen.

**When the catalogue changes under a downloaded guide.** The service keeps a copy of the catalogue entry it
downloaded from. A file is checked once, at download, against that entry; after that it keeps working offline
whatever later catalogues say. If a refresh no longer lists a downloaded guide, the guide stays readable and
taught, moves to a "No longer listed" group at the end of the list with a line saying it was removed from the
library, and can be removed by the user. If a refresh changes a guide's hash or size, the downloaded copy is
left alone; removing and downloading again fetches the new file.

**Reading.** `viewDocument` with the file URI and `application/pdf`, as message attachments do.

**Teaching.** `ragService.indexDocument({ projectId: 'field-guides', bundled: true, ... })` with the guide's
title as the document name, one guide at a time. Un-teaching deletes the document from the knowledge base and
keeps the file. If the Field guides project no longer exists, teaching a guide recreates it (same name, prompt
and colour as `src/features/fieldGuides/fieldGuides.ts`), without re-adding the six bundled guides the user
removed. A guide with `hasText: false` (scanned, or listed read only under the owner's ruling 4) cannot be taught
and says "Read only. The assistant can't learn this guide."

**Scale limit.** The screen shows how many guides are taught. Past a threshold (the builder picks a
conservative one, as a named constant to tune after a phone measurement) the teach control explains that the
assistant searches every guide it has learned and that more guides make answers slower. This is a known
ceiling, not a fix; the upgrade path is one knowledge base per category or an indexed vector search.

**Screen.** Guide library, reached from the Field guides project's knowledge base screen and from Settings.

```
<-  Guide library                          refresh
[ Search guides                                  ]
214 guides   9 downloaded   4 taught

FIRST AID AND MEDICAL (31)
  First Aid for Soldiers
  US Army  ·  9.8 MB  ·  Public domain        [Download]

  Tactical Combat Casualty Care Handbook
  US Army  ·  4.2 MB  ·  Public domain       62%

  Emergency War Surgery
  US Army  ·  21 MB  ·  Public domain
  [Open]   Assistant knows this [on]     [Remove]

WATER AND SANITATION (18)
  ...
```

Tapping a row expands it to show year, pages, the licence note and the source link, like the Open-source
licenses screen. Search filters by title and publisher. With no connection, the bundled list still shows;
download buttons report that there is no connection.

**Credits.** Each guide's licence and source are shown in the library. The Open-source licenses screen gains
one sentence saying that guides downloaded from the Guide library are listed there with their licences.

## Testing

Rendered integration tests, faking only the device boundary (file system and download, the PDF extractor, the
llama.rn embedding context, the network fetch for the catalogue; op-sqlite on node:sqlite):

1. Download and teach: open the library, download a guide, see it become openable, teach it, then ask a question
   in a Field guides chat and see the guide's passage sent to the model with its title as the source.
2. A download whose bytes do not match the catalogue shows the mismatch error and leaves no file.
3. A refreshed catalogue adds a guide; a malformed one leaves the bundled list in place.

Plus a unit test for catalogue validation, and `scripts/check-guides.js` run over the shipped catalogue.

The harness (`__tests__/harness/nativeBoundary.ts`) needs `downloadFile` and `hash` on the file system fake.

## Overnight rules (2026-11-17/18)

- Work in this worktree on `feat/field-guides`; commit each green step.
- Do not push, merge, tag or release. Do not install anything on the phone.
- Candidate guide files may be downloaded to this PC's temp folder without asking each time, only to check
  them (size, hash, text layer, licence statement). Each goes in its own new, empty directory, is treated as
  untrusted data and is deleted after checking. Nothing downloaded is added to the repo or the APK.
- Order: checker script and a first batch of the catalogue, then the app feature with its tests, then more of
  the catalogue with whatever time is left. A working feature with 100 checked guides beats 400 guides and no
  feature.
- Record what was done, what was skipped and the guide count in the shared notes file `field-guides.md`.

## Left to the builder

File and module layout, names, the persisted state shape, the exact layout within the theme tokens, the
taught-guides threshold, the checker's internals, the final category list, and where exactly the two entry
points sit on their screens.
