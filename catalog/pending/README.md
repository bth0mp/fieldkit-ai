# Candidates still held

Nothing here is rejected, and none of it is in `catalog/guides.json`. The file is a JSON array of candidates in the
shape `scripts/check-guides.js` reads from `catalog/candidates.json`.

- `third-party-host-class.json`: fourteen Navy and Army manuals found only on a hobby site, with no byte-identical
  second copy on an independent site. Their licence statements were confirmed. They are held because the owner
  confirmed the second-copy rule on 18 November 2026: a guide from a host that is not the publisher's own or an
  institutional archive needs a second copy with a matching SHA-256. Each still needs the third-party scan, the
  outdated-safety-advice check and the text readability check before it could be listed.

To add one, copy it into `catalog/candidates.json` and run the checker, then read every third-party hit by eye as
`catalog/REJECTED.md` and the design doc describe.
