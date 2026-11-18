# Candidates waiting on the owner's decisions

These guides were researched on 2026-11-17/18 and held back, not rejected. None is in `catalog/guides.json`.
Each file is a JSON array of candidates in the shape `scripts/check-guides.js` reads from
`catalog/candidates.json`. To add one, copy it into `catalog/candidates.json` and run the checker, then read
every third-party hit by eye as `catalog/REJECTED.md` and the design doc describe.

- `agency-policy-class.json`: six USDA NRCS Engineering Field Handbook chapters (terraces, diversions, gully
  treatment, ponds and reservoirs, springs and wells, irrigation). Staff-written, no outside credits, but they
  print no public-domain statement of their own, and the USDA site says only that "most information" on it is
  public domain. Held until the owner decides whether "written by federal staff, no outside credits" is enough
  proof (the same question decides FEMA's "Are You Ready?" and the NRCS ponds handbook, both in `REJECTED.md`).
- `third-party-host-class.json`: fourteen Navy and Army manuals found only on a hobby site, with no
  byte-identical second copy on an independent site. Their licence statements were confirmed. Held under the
  second-copy rule. Each still needs the third-party scan, the outdated-safety-advice check and the text
  readability check before it could be listed.
