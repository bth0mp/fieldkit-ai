# Fieldkit AI

An offline AI assistant for Android. It runs GGUF language models on the phone with
llama.cpp and answers questions from PDFs you load into a project knowledge base. Nothing
is sent anywhere; the model runs in your phone's RAM.

Fieldkit AI is a fork of [Off Grid AI](https://github.com/off-grid-ai/OGAM) by Wednesday
Solutions (MIT), based on the v0.0.103 release. The original README is kept at
[docs/UPSTREAM_README.md](docs/UPSTREAM_README.md).

## What it does

- Chat with any GGUF model, with streaming, thinking mode and markdown.
- Project knowledge base: add PDFs and text files to a project. They are chunked,
  embedded on-device with a bundled MiniLM model and stored in SQLite. Conversations in
  that project get a `search_knowledge_base` tool.
- Attach documents and images to a chat, use vision models, transcribe speech with
  Whisper, generate images with Stable Diffusion.
- Connect to an Ollama, LM Studio or other OpenAI-compatible server on your network.

## What changed from upstream

- Based on tag `v0.0.103`, the last public release that builds without upstream's private
  repositories. Upstream history is kept, so upstream fixes can still be cherry-picked.
- The private `pro` submodule is removed. Without it the app runs as the free edition.
- Pro upsell screens and prompts are removed: the Home crown button, the Settings banner
  and PRO card, the share and "Pro aha" sheets in chat, the voice model upsell, and the
  Pro Tools row (shown only if a Pro Tools screen is registered).
- Renamed to Fieldkit AI with application id `com.bth0mp.fieldkit`, so it installs
  alongside the official app. The Kotlin namespace stays `ai.offgridmobile`.
- CI is a single workflow, `.github/workflows/android.yml`, that builds a release APK.
- The MIT `LICENSE` is unchanged.

## Build with GitHub Actions

Every push to `main` and every `v*` tag runs `.github/workflows/android.yml`:

1. `typecheck` runs `npm ci` and `npx tsc --noEmit`.
2. `apk` builds `assembleRelease` for `arm64-v8a` and uploads the APK and its `.sha256`
   as the `fieldkit-apk` artifact. On a `v*` tag it also attaches both files to a GitHub
   Release.

To build all four ABIs, run the workflow by hand (Actions > Android > Run workflow) and
tick `all_abis`.

To publish a release:

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Signing key

Without signing secrets the workflow signs with the public React Native debug key and
prints a warning. Anyone can sign an update with that key, so set up your own before you
rely on the app.

1. Generate a keystore (keytool ships with any JDK):

   ```bash
   keytool -genkeypair -v -keystore fieldkit-release.jks -alias fieldkit -keyalg RSA -keysize 4096 -validity 10000
   ```

2. Base64-encode it.

   Linux:

   ```bash
   base64 -w0 fieldkit-release.jks > fieldkit-release.jks.b64
   ```

   macOS:

   ```bash
   base64 -i fieldkit-release.jks -o fieldkit-release.jks.b64
   ```

   PowerShell:

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\fieldkit-release.jks")) | Set-Content -NoNewline fieldkit-release.jks.b64
   ```

3. Add four repository secrets (Settings > Secrets and variables > Actions), or with `gh`:

   ```bash
   gh secret set ANDROID_KEYSTORE_BASE64 < fieldkit-release.jks.b64
   gh secret set ANDROID_KEYSTORE_PASSWORD
   gh secret set ANDROID_KEY_ALIAS --body fieldkit
   gh secret set ANDROID_KEY_PASSWORD
   ```

4. Back up `fieldkit-release.jks` and both passwords somewhere other than this machine,
   for example a password manager. Android only installs an update signed with the same
   key. If the key is lost, the only way to update is to uninstall the app, which deletes
   its downloaded models and chats.

Delete the `.b64` file once the secret is set. Never commit the keystore.

Moving from a debug-signed build to a release-signed build also needs one uninstall,
because the keys differ.

## Sideload onto a phone

From the browser on the phone:

1. Download the APK from the workflow run (Actions > run > Artifacts) or from the
   Release page.
2. Open it and allow your browser or file manager to install unknown apps when Android
   asks.

From a computer, with USB debugging on (Settings > About phone > Software information >
tap Build number seven times, then Developer options > USB debugging):

```bash
adb install -r fieldkit-v0.1.0-abc1234.apk
```

Check the download against its `.sha256` first:

```bash
sha256sum -c fieldkit-v0.1.0-abc1234.apk.sha256
```

## Suggested models

In the app, open Models, search for the repository, and download the `Q4_K_M` file.

| Model | Repository | Notes |
| --- | --- | --- |
| Gemma 4 E2B | `unsloth/gemma-4-E2B-it-GGUF` | Fastest and smallest. Good default. |
| Gemma 4 E4B | `unsloth/gemma-4-E4B-it-GGUF` | Better answers, still quick on a flagship phone. |
| Qwen3.5 9B | `unsloth/Qwen3.5-9B-GGUF` | Best quality of the three; slowest and needs the most RAM. |

These need llama.rn 0.12.5, which this tag already ships. Do not upgrade llama.rn without
testing them again.

## Rebrand

`scripts/rebrand.sh` renames the app in one step:

```bash
scripts/rebrand.sh "Fieldkit AI" com.bth0mp.fieldkit
```

It sets the Android `app_name` (escaped for XML and Android string resources), the
`applicationId`, the `.dev` debug id in `package.json`, `displayName` in `app.json`, and
`BRAND.name` in `src/config/branding.ts`. On Windows, run it from Git Bash. Changing the
application id makes Android treat the app as a new one.

## Build locally

Needs Node 22.23.4 or newer, JDK 17, and the Android SDK with NDK `27.1.12297006`.

```bash
npm ci
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

The APK is written to `android/app/build/outputs/apk/release/app-release.apk`.

Checks:

```bash
npx tsc --noEmit
npx jest --forceExit
```

## License

MIT. See [LICENSE](LICENSE). Fieldkit AI is based on Off Grid AI by Wednesday Solutions.
