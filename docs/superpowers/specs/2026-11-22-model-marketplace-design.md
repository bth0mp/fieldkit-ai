# Choosing a model opens the Models screen

Status: draft for the owner's approval, 2026-11-22.

## Intent

The owner's words: "now I want it easier to select models or at least easier to find new
models. Such as when I choose a model it takes me to the model market place."

The "market place" is the Models screen. Choosing a model and finding a new one become the
same step: tap the model, land on the Models screen, tap Use, and you are back where you
were. The owner picked this ("A") over keeping the quick popup and adding a link to it.

Why: today it takes three taps from Home to reach the Models screen from the model chip
(chip, list, picker, "Browse more models"), a chat has no way there at all, and a finished
download has no Use button, so the owner goes back and hunts for the model they just got.

## What the owner sees

Models screen, Text tab, opened from the model chip on Home or the model name in a chat:

```
 <  Models                                        [downloads]
 [ Import Local File ]        [ In memory: 5.1 GB        > ]
 Text Models  Image Models  Voice Models  Transcription Models

 Which model?                                              >
 [ Search Hugging Face models...               ] [ filters ]
 (Smart)(Trending)(Most downloaded)(Most liked)(New releases)…

 YOUR MODELS                             + Add remote server
   Gemma 4 E4B                  In use            [ Unload ]
   4.2 GB · Q4_K_M · Vision
   Qwen3.5 4B                                        [ Use ]
   2.7 GB · Q4_K_M · ~4.1 GB RAM
 Study PC
   llama3.1 8B  (cloud)                              [ Use ]

 12GB RAM — models up to 8B recommended
 RECOMMENDED FOR YOUR DEVICE
   …
```

Chat header (it says the word "Models" today):

```
 <  Trip planning
    Gemma 4 E4B  >  ·  Default
```

A model's file list, once a file has downloaded:

```
 Qwen3.5-4B-Q4_K_M                        [ Use ]  [delete]
```

One change from the sketch the owner approved: the search box and sort buttons sit above
"Your models" and stay put, so finding new models is always in reach however many models
are on the phone.

## Goals

1. **Choosing goes to the Models screen.** These open it, on the tab named:

   | From | Tab | After Use |
   |---|---|---|
   | Home's model chip (`models-summary`) | Text; Image when only an image model is in use | back to Home |
   | Home's setup card, "Select Model" and "Browse Models" | Text | back to Home |
   | Chat header's model name (`model-selector`) | Text; Image when only an image model is in use | back to the chat |
   | Chat with no model ("No Model Selected"), button always shown | Text | back to the chat |
   | A chat message that needs a text model and none was ever chosen | Text | back to the chat, and the message is sent |
   | "Use the on-device model" in the calendar-data notice | Text | back to the chat |
   | Chats tab "New" with no model in use | Text | a new chat opens |
   | Chats tab empty state with no model in use (new button) | Text | a new chat opens |
   | Raised + tab button with no model in use (goes to Home today) | Text | a new chat opens |
   | "No Model" alert in a project (two screens), new "Open Models" button | Text | back to the project |
   | "No Image Model" alert in the chat composer, new "Open Models" button | Image | back to the chat |
   | Image section of chat settings, when no image model is downloaded | Image | back to the chat |
   | Home's Phone card "Models" row | unchanged (Text) | back to Home |

   "Back" is the screen under the Models screen, whichever it is (the tour and a trip to the
   Download Manager and back included). "A new chat opens" means the chat takes the Models
   screen's place, so Back from that chat leads to the tab it was opened from.

2. **"Your models" on the Text and Image tabs**, at the top of the list:
   - The model in use comes first, then newest download first (`downloadedAt`).
   - A row shows what Home's picker row shows today: name, size, quantization, the Vision
     mark, and the RAM hint with "(may not fit)".
   - A row not in use has **Use**; the whole row is tappable and does the same. The row in
     use says "In use" and has **Unload** (a remote model has **Disconnect**).
   - Text tab: remote server models follow, under their server's name, with the cloud mark.
     Servers known to be offline are left out, except for the model in use.
     "Add remote server" opens the Remote Servers screen.
   - With none: "No text models yet. Download one below, or add a remote server." (Image:
     "No image models yet. Download one below.")
   - The section shows with the picks list. A search, a filter that searches, or one of the
     four Hugging Face sorts replaces it with results, as it does the picks today. On the
     Image tab it shows while the search box is empty.
   - It works with no connection, and follows changes made elsewhere while it is open: a
     download ending, a delete, a server removed, a model unloaded to make room.
   - Every downloaded model is listed, including recovered ones. (Home's picker lists them,
     the chat popup hides some; hiding them would leave no way to choose them.)
3. **Use after a download.** On the Text tab's file list, a downloaded file that is not in
   use has a labelled **Use** button next to delete, in place of today's unused check icon;
   the one in use shows the existing "Active" badge. An image model moves to "Your models"
   when its download ends (it leaves the list of downloads today). Transcription cards get
   the same Use button for a downloaded model that is not in use.
4. **Sort buttons always visible** on the Text tab, in one row that scrolls sideways, in
   this order: Smart, Trending, Most downloaded, Most liked, New releases, For You, Size.
   The sort icon that opened them (`sort-pill`) goes. Labels, behaviour and
   `sort-option-*` ids stay.
5. **In memory.** A button beside Import Local File reads "In memory: 5.1 GB", the total of
   every loaded model (text, image, voice, transcription), or "In memory: none". It opens
   the existing models sheet, retitled "IN USE": four rows with the model, its memory and
   its eject, and Eject All Models. Tapping a row closes the sheet and goes to that tab.
   Eject keeps its meaning: it frees memory and keeps the choice; Unload drops the choice.
6. **The chat header names the model in use**, cut short when long, "Image model" when only
   an image model is in use, "No model" otherwise. The cloud mark for a remote model stays.
7. **No message names a "Models tab"** (there is none). They say "Models screen", except
   Storage settings, which says models are deleted in the Download Manager.
8. **The old pickers go**: `ModelPickerSheet`, `ModelSelectorModal`, `VoiceModelsSheet`, and
   the hooks and handlers only they used. `WhisperPickerSheet` stays for Model Settings.

Done looks like: from Home or a chat, switching between two downloaded models takes two
taps (model, Use) and lands back where it started, with the new name showing. From a
finished download it takes one.

## What Use does

One service owns this; the screen only calls it and shows the outcome. It builds on
`activeModelService.selectTextModel` (which also records the last text model, used to reload
it later) and replaces the four sets of handlers around it in Home, the chat, the Chats tab
and the chat popup, which differ today.

- **Text model on the phone**: stop a reply that is being written, drop any remote
  selection, unload the model in memory, mark the new one in use. The new one loads with the
  next message, as Home does today, so the memory check and "Load Anyway" appear then.
  - Why unload first: the chat decides a LiteRT model is ready when *any* LiteRT model is
    loaded (`engines.isModelReady`), so marking a second one in use would let the first
    answer. And stop and unload both act on the engine of the model *in use*
    (`getActiveEngineService`), not the one loaded, so marking a model from the other engine
    first would leave the old one running or in memory. Unloading while the old model is
    still the one in use avoids all three.
  - The chat under the Models screen must not pass through "no model" on the way: a new
    chat would swap to the No Model screen and lose a half-typed message.
- **Remote model**: stop a running reply, connect, then unload the local text model
  whichever engine it uses (a loaded llama model wins over a remote one today, and a LiteRT
  one does for one-shot jobs). If connecting fails, say so, stay on the Models screen, and
  leave the earlier model in use. Connecting writes the remote choice before it knows the
  server answered (`setActiveRemoteTextModelImpl`), so failure has to put it back.
- **Image model**: mark it in use; it loads with the next image, as Home does today. The
  loader unloads an earlier image model itself (`doLoadImageModel`), so nothing more is
  needed.
- **Unload / Disconnect**: stop a running reply, unload, and leave nothing in use for that
  type, as the pickers do today.
- While a text model is loading, being swapped or being connected to, Use and Unload are
  disabled on the Text tab, and that model's row shows the spinner. The Image tab does the
  same while an image model loads. (A load that ends marks its own model in use, so a choice
  made mid-load would be undone.) The service's own state says so
  (`activeModelService.subscribe`, `isLoading` per type), loads started in a chat included.
- Text and Image: Use leaves the Models screen. A second quick tap must not go back twice.
  Transcription and Voice: choosing stays on the screen, as today.
- Errors show in the Models screen's own alert.

Back in the chat after Use:
- The photo, tools and thinking controls match the new model before the first message.
  (Vision is worked out again only on some changes today, not for one LiteRT model to
  another.)
- A message that was waiting for a text model is sent once. Coming back without choosing
  leaves it waiting, as closing the popup does today.

Other existing behaviour to keep:
- "Reload" after a settings change reloads in place and shows the chat's own loading bar.
  It opened the popup only to show a spinner.
- The tour: "Load a model" still starts on Home's chip (steps 1 and 13 stay anchored there).
  Its second part, "Select a model" (index 11), points at the first row of "Your models"; it
  pulses the picker's first row today. "Load your image model" (index 13) is reworded only,
  to say open Image Models.
- Opening the Models screen with a tab must set that tab once. Today it is set again each
  time the screen regains focus, so coming back from the Download Manager would throw the
  owner back to the first tab now that most ways in name one.
- Home's chip spinner follows the service's own loading state, since Home no longer starts
  loads or unloads. Home's full-screen loading overlay goes with them.
- Voice and Transcription choosing keep working from the Models screen's own tabs.
- The app's own choices stay as they are: the composer's image toggle picking the first
  image model, an image model marked in use when its download, retry or import ends and
  none was, the image classifier's preload, the image picker in chat settings, the remote
  server found again at a new address, and onboarding.

## Constraints

- Project rules in `CLAUDE.md`: theme tokens only, weights at or below 400, Feather icons,
  no emoji, logic in services, one rendered integration test per behaviour, fakes only at
  the device boundary. No new dependency. No change to `llama.rn`.
- Reuse `ModelRow`, `ModelCard` (`onSelect`, `isActive`), `ModelsManagerSheet`,
  `useResidentRows`, `useEjectAllModels`, `useActiveTextModel`. "In use" for text means what
  `useActiveTextModel` says (remote before local), so Home, the chat and this screen agree.
- Test ids kept: `models-summary`, `model-selector`, `model-loaded-indicator`, `model-item`,
  `remote-model-item`, `models-row-*`, `sort-option-*`, `setup-card`, `home-phone-models`.
- What works today and is covered by the tests of the removed pickers must still be covered
  where it now lives: RAM hints, per-row eject, the remote cloud mark, a failed load leaving
  no model in use, Load Anyway on send, calendar data refusing a remote model.
- Maestro flows and `.maestro/E2E_TESTING.md` follow the new path. They are not run in CI.

## Approaches

- **A. Straight to the Models screen** (owner's pick). One place to choose and to find. The
  cost is a full screen instead of a popup to switch models, and the two pickers' tests move.
- **B. Keep the popup and add "Find new models" everywhere.** Smaller, but choosing and
  finding stay in two places, and three pickers keep drifting apart.
- **C. A Models tab in the tab bar.** Not offered: the tab bar was settled with the Home
  dashboard (0.3.0), and it would not take the owner there when choosing.

Layout of A: the search and sorts stay fixed above a scrolling list that starts with "Your
models". The other layout (search and sorts inside the list, under "Your models") matches
the sketch to the letter, but pushes finding new models off the screen as models add up, and
the search box would be rebuilt on every search.

## Non-goals

- Use in the Download Manager. "Your models" has it one step back.
- Choosing a model per chat.
- Store-style shelves, pictures or ratings.
- New sorts, or sorts on the Image tab.
- Deleting from "Your models". Delete stays where it is.
- Loading a model the moment it is chosen.
- The open items from 0.4.0 (Whisper sizes, `mtp-*` files, the emulator startup crash).

## Anti-goals (a failure even if it works)

- A model answering that is not the one the screen says is in use.
- Losing a typed message, or sending one twice, on the trip to the Models screen and back.
- A choice that takes more taps than today.
- Any way to free memory, or to reach a remote server, that exists today and is gone after.
- The Models screen being unusable with no connection.

## My calls (the owner can change any of them)

- Search and sorts sit above "Your models".
- The + button with no model goes to the Models screen and then a new chat, not Home.
- Choosing a different text model stops a reply that is being written.
- Transcription and Voice stay on the screen after choosing.
- The memory button and sheet keep all four eject controls and Eject All.
- Recovered models are listed.
- The release is 0.5.0, after the owner says to push.

## Left to the builder

- File layout, the service's name and shape, how the screen knows to open a new chat after
  Use, and spacing and styles within the theme.
- Whether the Import and In memory buttons share a row or wrap on narrow screens.
- How the waiting message is sent on return, as long as it is sent once.
