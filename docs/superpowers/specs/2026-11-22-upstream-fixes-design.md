# Upstream fixes (Off Grid v0.0.104 to v0.0.125): design

Date: 2026-11-22. Status: approved by the owner ("Do all of them", 2026-11-22).

## Intent

The owner asked whether Off Grid v0.0.125 can go into Fieldkit. Little of that release can,
but releases since Fieldkit's base (v0.0.103) fixed bugs Fieldkit still has. The worst can
erase every saved chat. Bring those fixes over, plus the one speed-up in v0.0.125 that
applies, without changing how Fieldkit looks or what it offers.

## Goals

1. Saved chats and settings survive a failed or slow read, and a chat history over 2 MB
   opens again on Android.
2. A streamed reply no longer rewrites the whole chat history about 20 times a second.
3. A remote server's key is stored only in the Keychain, and existing plain copies are removed.
4. The engine, download, voice, lock screen, search, image, list and chat-scroll fixes named
   in the plan.
5. Faster tab switches.

## Non-goals

- Anything from Off Grid's Pro, Boost, Video Studio, Sync or analytics code.
- A newer `llama.rn`, Reanimated, executorch or whisper.rn. No new dependencies at all.
- Upstream's animated background, redesign, or "Ask the app" guide. "Ask Fieldkit" gets its
  own design.
- Upstream 30b62e2ec (dirty model loads gated on live free RAM). It changes which models are
  allowed to load, so it needs measuring on the phone first.
- A ban on sending a key over plain HTTP. Fieldkit's current rule stays.

## Anti-goals

- Losing or resetting anything the owner already saved: chats, projects, settings, servers,
  models. Every storage change reads the old format.
- Copying from the private `shared` packages, the `pro` submodule, OGAD (AGPL) or the store apps.

## Constraints

- Upstream code is taken only from the public MIT repo, from files with no `@offgrid/*`,
  `../shared` or `pro/` import. Each commit names the upstream commit it came from.
- `feat/model-marketplace` is being edited in another session. This branch must merge with it
  without conflicts (checked with `git merge-tree`); a fix that would conflict waits.
- All rules in `CLAUDE.md` apply: rendered test per fix, theme tokens, no emoji, commit per step.

## Approaches

- **Merge upstream:** rejected. 142 of 645 source files import packages that are not public.
- **Cherry-pick commits:** rejected as the default. Most touch files Fieldkit has changed or
  lacks, and several single commits were corrected by later ones.
- **Hand-port the final upstream behaviour, file by file, with a test per fix:** chosen.

## Decisions

- **Saved state.** Port the final versions of `chunkedStorage.ts`, `hydrationGatedStorage.ts`
  and `mergeSessionIntoSaved.ts`. Only the chat store is chunked. Every persisted store is gated.
  The checklist store keeps its own guard.
- **When saved chats stay unreadable.** Upstream keeps writes blocked and says nothing, so new
  chats vanish at exit. Fieldkit shows a notice on the Chats screen with Try again. It never
  offers to discard the saved chats.
- **Database cap.** `AsyncStorage_db_size_in_MB=64`.
- **Keys.** The persisted server record never holds a key. On load, a plain key moves to the
  Keychain first and is dropped from the record only after that succeeds.
- **Helper files.** Upstream's rules live in a private package, so Fieldkit writes its own
  filename check.

## Left to the builder

Test file layout, helper names, and the wording of log lines.
