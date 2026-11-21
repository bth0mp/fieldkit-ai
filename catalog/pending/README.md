# Candidates still held

Nothing here is rejected, and none of it is in `catalog/guides.json`. The file is a JSON array of candidates in the
shape `scripts/check-guides.js` reads from `catalog/candidates.json`.

- `third-party-host-class.json`: fourteen Navy and Army manuals found only on a hobby site, with no byte-identical
  second copy on an independent site. Their licence statements were confirmed. They are held because the owner
  confirmed the second-copy rule on 18 November 2026: a guide from a host that is not the publisher's own or an
  institutional archive needs a second copy with a matching SHA-256. Each still needs the third-party scan, the
  outdated-safety-advice check and the text readability check before it could be listed.

- `owner-questions-2026-11-18.json`: five short civilian and Corps of Engineers guides (sandbags, emergency water
  disinfection, hand and power tools, backcountry water treatment, reading topographic maps) whose every page has
  been looked at by eye. Each
  is held on one question only the owner can answer, written in its `question` field. On a yes, remove the
  `question` field, add a `creditsNote` saying every picture page was looked at and what was found, set
  `creditsReviewed` to true, and move the record into `catalog/candidates.json`.

- `owner-questions-2026-11-20.json`: three Defense Health Agency and Armed Forces Pest Management Board sheets and
  the Navy's Aerographer's Mate Module 5, plus two old USDA bulletins (HG 15 on freezing meat, AIB 413 on feeding
  bees), held after a second review, each on the one question in its `question` field. The same steps as above apply on a yes.

To add one, copy it into `catalog/candidates.json` and run the checker, then read every third-party hit by eye as
`catalog/REJECTED.md` and the design doc describe.
