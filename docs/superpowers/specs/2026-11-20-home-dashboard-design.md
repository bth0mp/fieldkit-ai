# Home dashboard and tab bar

Status: draft for the owner's approval, 21 November 2026.

## Intent

The owner wants the app easier to get around: what is now spread over six tabs (Home, Chats, Projects, Kit, Models,
Settings) should be reachable from the home page, which also shows at a glance how things stand (the model, what is
downloading, what is on the phone). The bottom tab bar stays, and the home page scrolls under it. This is the first part
of a fuller UI redesign; the other screens come later.

The owner chose this layout from mockups shown in the session of 20 November 2026 ("idea 3, Version A").

## What the owner sees

```
 Fieldkit                         [Offline]  (search)
 Fri 20 Nov · sunset 16:52
 +---------------------------------------------+
 | Assistant                  * Qwen3.5 4B    |
 | [ Ask anything               (mic) (send) ]|
 | Purifying creek water                   2h |
 | Generator in the garage?               Thu |
 +---------------------------------------------+
 | (download) Downloading guides       2 of 5 |   only while something downloads
 | ======-------                              |
 +---------------------------------------------+
 | Field kit                                   |
 |  Guides   Signals   Calc   Lists            |
 +---------------------------------------------+
 | Your library                                |
 |  Guides          12 on phone, 4 taught      |
 |  Kiwix           3 files                    |
 |  Projects        11                         |
 +---------------------------------------------+
 | Checklists                                  |
 |  Car kit  9 of 12  =========---             |
 |  Pet kit  4 of 10  ====------               |
 +---------------------------------------------+
 | Today   sunrise 06:58  sunset 16:52  moon 21:14 |
 +---------------------------------------------+
 | Phone                       41 GB free     |
 |  ===============----                        |
 |  Models          2 downloaded               |
 |  Gallery         18 images                  |
 +---------------------------------------------+
            Edit home
 ---------------------------------------------
  Home    Chats    ( + )    Kit    Settings       fixed; (+) is a raised round button
```

When the page scrolls, the header shrinks to one line ("Fieldkit" and the search button) and stays at the top.

## Goals

1. **Home is a scrolling stack of cards**, in this default order: Assistant, Downloads (only while something is
   downloading), Field kit, Your library, Checklists, Today, Phone, then an "Edit home" link.
2. **The bottom bar is fixed** and has five places: Home, Chats, a raised round New chat button in the middle, Kit and
   Settings. Projects and Models leave the bar; they are reached from the cards (below) and keep their screens.
3. **Nothing the current Home does is lost**: the model picker, the no-model setup card, the onboarding checklist
   icon and spotlight tour, network server discovery and "Add remote server", recent chats and the image gallery.
4. **Each card opens what it summarises in one tap:**
   - *Assistant.* The model chip takes the place of today's Models strip (`ModelsSummaryRow`) and opens what that
     strip opens, the models manager sheet (`ModelsManagerSheet`: text, image, voice and speech models, memory use,
     eject), from which the text and image pickers open as today. My call: this keeps every model control on Home and
     costs no extra tap, since today's strip also opens the manager first. The chip shows the loaded text model's
     name (with a server icon when it runs on a remote server), "Image model loaded" when only an image model is
     loaded, and "No model" otherwise. The spotlight tour steps attached to the strip today (1 and 13) attach to the
     chip. With no model downloaded, the existing setup card shows inside the Assistant card. The ask box takes typed
     text, or dictation from the microphone into the box as in a chat; sending starts a new chat with that message,
     as if typed in a new chat. The last two chats open that chat; "All chats" opens Chats.
   - *Downloads.* Shown only while a model, a guide or a "Download all" is downloading. It says what and how many,
     with one progress bar for the lot. A tap opens the Download manager when models are downloading, otherwise the
     Guide library. It goes when nothing is downloading.
   - *Field kit.* Guides (Guide library), Signals (Quick reference), Calc (Calculators), Lists (Checklists).
   - *Your library.* Guides: how many catalogue guides are on the phone and how many the assistant knows, the same
     numbers the Guide library screen shows (`libraryCounts`), with a second line saying six guides come with the app
     (the bundled field guides, which the Guide library does not list). My call: the numbers match the screen the row
     opens, and the six are still visible. Kiwix: how many files are added (Kiwix files). Projects: how many
     (Projects).
   - *Checklists.* Up to three lists with a progress bar each (ticked of total), the ones changed most recently first;
     a tap opens that list. With no lists yet, one line offers the starter lists.
   - *Today.* Sunrise, sunset and moonrise for today, worked out on the phone by the code the calculators already
     use, for the home place the owner sets in Settings (see "Owner's decisions"). The header's "sunset" line comes
     from the same numbers. With no home place set, the card shows one line, "Set your place", which opens that
     Settings row, and the header leaves the sunset out.
   - *Phone.* Free storage with a bar (free of total), how many models are downloaded (Models), how many images are in
     the gallery (Gallery). With no image model and no images, the Gallery row is left out.
5. **The header** shows the app name, today's date with the sunset time, a small "Offline" label when the phone has
   no network connection (nothing when it has one), and a search button.
6. **Search** (the header button) opens one search box over titles the phone already has: chats, guides on the phone,
   checklists, and Quick reference cards. Tapping a result opens it. The six guides that come with the app are
   included and open in the document view (`DocumentPreview`). It is a title search only, not a search inside
   documents; asking the assistant is for that.
7. **Edit home** lets the owner move cards up and down and hide them. The Assistant, Your library and Phone cards can
   be moved but not hidden, because once the Projects and Models tabs go they are the only ways in to the model
   controls, Projects and the full Gallery (my call). The Downloads card is not listed, since it shows itself only
   while needed. The choice is saved on the phone and kept across updates.

## Non-goals

- Redesigning the other screens (Chats, a chat, Kit, Settings, Models, Projects). They keep their look for now and are
  only reached differently.
- New information. Every number on a card already exists in a store or service; only the Today card's place and the
  Offline label need something new (see below).
- A new look. The theme stays as it is: the indigo accent and cool greys, the Menlo monospace face, Feather icons,
  font weights at or below 400, no emoji.

## Anti-goals (a failure even if it works)

- Home opens more slowly than today, or stutters while scrolling, because a card does heavy work on the way in.
- Anything on Home needs the network.
- The app asks for, or gains, location access.
- Something reachable in one tap today (a chat, the model picker, a guide's screen) takes more than two.
- An emergency tool (Signals, Calculators, the guides) ends up hidden behind more taps than today.

## Constraints

- Project rules in `CLAUDE.md`: theme tokens only (`TYPOGRAPHY`, `COLORS` via `useTheme`, `SPACING`), weights at or
  below 400, Feather icons, no emoji. Screens and hooks hold no business logic; each card reads read-only store
  projections, and any new state (the home layout, the place for Today) is owned by a service. Native features expose
  the same methods on Android and iOS.
- Search `src/components/` and the hooks before writing a new piece (for example `Card`, `Button`, `AnimatedEntry`,
  `ModelPickerSheet`, `RecentConversations`) and extend with a prop rather than copying.
- One rendered integration test per change: mount the real screen, reach the state with real gestures, assert what
  the user sees; fake only at the device boundary (`__tests__/harness/`).
- Saved-data keys that exist stay as they are. New ones use the `@fieldkit/<snake_case>` prefix of the other Fieldkit
  features (`@fieldkit/checklists`, `@fieldkit/kiwix_files`).
- The onboarding spotlight tour and `spotlightConfig.tsx` point at `ModelsTab`, `ProjectsTab` and Home elements;
  they must be moved to the new places, and the tour must still run end to end.
- Code that navigates to `ModelsTab` or `ProjectsTab` (Home, Chats list, the spotlight hook) must go to the new
  routes; Models still takes its `initialTab`.
- The Offline label needs a network-state source the app does not have. My call: add
  `@react-native-community/netinfo` (MIT, Android and iOS), regenerate the third-party notices, and read it through a
  small service, not from the screen. Wi-Fi name fetching stays off, since on Android it needs location access.

## Approaches

1. **Launcher grid.** A page of twelve tiles under an ask box, three tabs. Closest to "everything on the home page",
   but shows no status. Not chosen.
2. **Search first.** One search box over everything, pinned shortcuts, a Browse list. Fast for someone who knows what
   they want, but less to see at a glance. Not chosen; its title search lives on as the header's search button.
3. **Status dashboard (chosen).** Cards that each summarise and open a part of the app. The owner liked it most and
   asked to keep a fixed tab bar with the page scrolling under it. Of the two improved versions shown, the owner chose
   **Version A** (ask box on the Assistant card, Downloads card, round New chat button, Checklists, Today, Phone,
   Edit home, Offline label, slim header on scroll) over Version B (an emergency strip at the top, folding cards and a
   plain four-item bar).

## Owner's decisions

1. **The Today card's place is set by hand, with no location permission** (owner, 21 November 2026: "Have it set
   manually dont have it use location permissions"). Settings gets a "Home place" row where the owner types a
   latitude and longitude, a UTM or an MGRS grid reference, read by the parser the calculators already use
   (`positionOf` in `src/services/tools/coordinateTools.ts`), with the same error message for a position it cannot
   read. A service owns it and saves it under `@fieldkit/home_place`; clearing the row clears the Today card. The app
   adds no location permission or location library, so what the calculators and the `sun_times` tool tell the user
   about not using their location stays true. The sunrise calculator does not fill in or change the home place.

## Left to the builder

- Component split, file layout and names; how each card gets its numbers from the existing stores.
- The slim-header animation and the raised button's exact size and shadow, within the theme.
- Copy for empty states, within the app's plain style.
- How Edit home looks (a list with up and down buttons is enough; drag to reorder is not required).
- How search ranks results.
