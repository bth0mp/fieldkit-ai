# Fieldkit AI

Offline AI assistant for Android (React Native 0.83, llama.rn, whisper.rn). The Android
app id is `com.bth0mp.fieldkit`; the debug build adds `.dev`. Target device: Samsung
S24 Ultra (arm64-v8a).

## Licensing rules (read before adding code or dependencies)

- Never copy, decompile or port code, text or assets from Off Grid AI's proprietary Pro
  module or its store apps. Pro-style features are written from scratch.
- Keep the MIT notice in `LICENSE` and in the Open-source licenses screen.
- No GPL, AGPL or LGPL dependencies (for example espeak-ng). Prefer MIT, BSD or Apache-2.0.
- Image generation ships local-dream's `libstable_diffusion_core.so` under CC BY-NC 4.0,
  so the app must stay free and non-commercial while it is included.
- After adding or upgrading a dependency, run `node scripts/gen-notices.js` and commit
  the regenerated `src/generated/thirdPartyNotices.json`. Add native or bundled
  components (`.so`, models) to the `NATIVE` list in that script by hand.
- No Off Grid or Wednesday names, logos or links in anything the user sees. App name
  comes from `BRAND` in `src/config/branding.ts` (set by `scripts/rebrand.sh`).
  Internal ids (`ai.offgridmobile` Kotlin namespace, keychain services, `@offgrid/`
  storage keys) stay as they are so saved data and upstream cherry-picks keep working.

## Layout

- `src/` is the app. Optional extra features plug in through `src/bootstrap/slotRegistry.ts`
  and `src/navigation/screenRegistry.ts`; there is no `pro/` folder in this repo.
- `upstream` remote = off-grid-ai/OGAM (MIT), base tag `v0.0.103`. Cherry-pick fixes from
  it; never push its `v*` tags (they trigger the release workflow).
- Do not upgrade `llama.rn` without re-testing Gemma 4 and Qwen3.5 GGUFs.

## Windows setup

- `core.autocrlf` must be `false` in this repo; CRLF breaks the bash scripts.
- Run `npm ci` from PowerShell, not Git Bash: llama.rn's postinstall needs Windows `tar`.
- Release APKs build in GitHub Actions (`.github/workflows/android.yml`); there is no
  local NDK yet.

## Checks

The Husky pre-push hook runs eslint, `tsc --noEmit`, `jest --findRelatedTests`,
dependency-cruiser and knip for pushed JS/TS. Run the same before committing:

```bash
npx tsc --noEmit
npx eslint <changed files>
npm run depcruise
npm run knip
```

`jest.config.js` caps Jest at half the CPU cores: with one worker per core the heavy
rendered suites under `__tests__/integration/` run out of RAM and time out. If one still
fails, rerun it alone with `npx jest --runInBand <file>` before treating it as real.

## Testing

One rendered integration test per fix: mount the real screen, reach the state through
real gestures, assert what the user sees. Fake only at the device boundary
(`__tests__/harness/`), never our own modules. While iterating, run only that test file.

## Code

- Search `src/components/`, hooks and services for an existing piece before writing a new
  one; extend with a prop instead of forking a copy.
- UI uses theme tokens only: `TYPOGRAPHY`, `COLORS` (via `useTheme`), `SPACING`. Font
  weights stay at or below 400. Icons come from `react-native-vector-icons` (Feather by
  default). No emoji in UI text.
- Screens and hooks hold no business logic or authoritative state. Services own state
  machines, resources and side effects; stores are read-only projections for the UI.
- Interchangeable implementations (engines, providers, backends) sit behind one
  interface; callers never branch on the concrete type or on `Platform.OS` to choose a
  mechanism. Native modules expose the same methods and events on Android and iOS.
- Commit each green step separately with a per-concern message.
