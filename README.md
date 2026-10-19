# 👑 Tavern Suite Menu

<img width="1883" height="890" alt="Screenshot_21" src="https://github.com/user-attachments/assets/6032416a-8b8e-4fc9-9d5a-285c942161e9" />


A visual-novel main menu for SillyTavern. It comes up when SillyTavern starts and shows you where
you left off: the character who last spoke, the room you were in, what the others did while you
were away. From here you open the chat, the deck of characters, a dossier, the diary or the map.

**Version 1.10.0**

---

## ✨ Features

<img width="1872" height="881" alt="Screenshot_13" src="https://github.com/user-attachments/assets/bdf53d79-9552-40e1-b193-bbd10d70bcec" />


* 🎭 **The last scene, waiting for you** — the character who spoke last, full height if they have a
  sprite (the same folder Character Expressions uses), a different face each time and never a sad
  or angry one; without a sprite, their card from the deck, big, with two face-down cards behind.
  Click them to go through their last lines.
* 🖼️ **The room behind them** — the room you are in on RPG Map, a random room from the map, or the
  chat background. Pick any room with a picture from **Rooms** to put it behind the menu.
* 🎟️ **Continue** — opens the chat you were in, with the place and the room on the ticket. The
  ticket's stub tears off as you go in.
* 🐇 **The rabbit hole** — RPG Dungeons' gacha on the main screen: the character's best companion on
  the tile, their tickets in the corner. It opens over the menu, and closing it brings you back.
* 🃏 **The deck** — your characters and groups as hanging cards, four at a time. Tabs for all,
  favourites and groups, SillyTavern's tags on a parchment list, search, order, Import and Create. A group with its
  own picture shows the picture; one without shows its members side by side.

  <img width="1862" height="879" alt="Screenshot_14" src="https://github.com/user-attachments/assets/803e9829-bd4b-4bb6-8f6c-93f843f87741" />

* 🙈 **Only what you want to see** — hide any character or group from the menu (the eye on the
  plaque; they wait in the *Hidden* tab), or turn on a **showcase**: the eye next to a tag, and the
  whole menu — deck, meetings, the main screen — shows only what carries it. Nothing is deleted or
  changed in SillyTavern.
* 👥 **Groups, made here** — deal the deck, pick characters into the slots, name the group on its
  banner and seal it. Rename it, add or remove members, or disband it (two clicks) from its dossier. It is all saved through
  SillyTavern itself, so its own group list stays in step.
* 🪞 **You** — your persona as a file of loose papers beside its card: name and title written on the
  label, “about” on a pinned sheet, where it goes in the prompt (with depth and role) as a checklist,
  its lorebook picked from a shelf, who it is linked to, and whether it is the default face. Change
  anything and a wax seal comes up to save it. Make a new face, delete one, or become another — all
  saved in SillyTavern's personas.
* 🃏 **Characters, made here** — a new character from the deck's “+”, as a case file: the card with
  its portrait, a label with the name, creator and version, and five papers to pick up and write
  on — look (description), soul (personality, scenario), voice (first message, other greetings,
  example dialogue), for the AI (system prompt, post-history instructions, the character's note with
  its depth and role) and notes (creator's notes). A filled paper gets a wax seal; the file status
  shows how complete the card is, with talkativeness and favourite right there. Edit the card from its dossier, or delete it (two clicks; its chats are kept). The
  character's lorebook is linked in SillyTavern's own editor.
* 🏷️ **Tags, handled here** — make a tag, rename it, give it a colour, delete it; put tags on a
  character or a group from the plaque under the deck.
* 📱 **The phone over the menu** — it opens in place, the menu stays behind it.
* 🔔 **Small sounds** — a click, a card dealt, a page turned, a wax seal. Made in the browser, no
  files; turn them off or down in the settings.
* 📖 **Diary and map, read here** — the diary as a leather book that is laid out like one: pages
  filled to the bottom, long entries running on to the next page, drop caps, taped photos, oval
  portraits of the people, an illuminated summary, and pages that turn (entries, events, people,
  gifts, summary) and the map as rooms with their pictures and who is in them. A button opens the
  extension itself for everything else.
* 🗂️ **Dossier** — their card, their room behind them, what RPG Diary knows about a character (role, how you met, looks, notes, trust),
  their last line, their latest chronicle, and **One day**: their routine from RPG Map on a clock
  face, weekdays and weekend.
* 🔗 **Group dossier** — the members on a corkboard, red threads between those who share a line in
  the chronicle, where each of them is now, and a shared secret from what was overheard.
* 📜 **Chronicle · Calendar · Overheard · Gifts · Meetings** — scenes, not lists: notes pinned on a
  red thread, a desk calendar on rings with nine days to a leaf (click a day to hold it up and
  read), letters as sealed envelopes and scenes as doors — with tabs for all, letters or doors; an
  envelope's seal cracks and the whole letter unfolds on one sheet, a door opens through its keyhole
  onto the scene, and what you have read stays opened — gift tags that swing when touched, polaroids of the last chats. Nothing scrolls — they
  are dealt a few at a time and you turn the page (arrows, dots or ← →). With the characters' faces, and the diary's pictures where it has them. A red gem
  marks what is new.
* ✉️ **Letters and secrets** — RPG Phone's unread messages and the overheard scenes, counted at the top.
* 🌐 **English and Russian** — follows SillyTavern's language, or set it by hand.

---

## 🧩 How it fits the suite

<img width="1878" height="877" alt="Screenshot_16" src="https://github.com/user-attachments/assets/56ff2745-81d4-4321-97fa-372b971bc9e2" />

The menu only **reads**. It never writes into another extension's data and never changes a prompt.

| Shown | Comes from |
|---|---|
| Room, background, who is where, chronicle, routine, overheard | 🗺️ [RPG Map & Locations Engine](https://github.com/tavern-rpg-suite/RPG-Map-Locations-Engine)  |
| Role, how met, looks, notes, trust, events, gifts | 🪶 [RPG Diary](https://github.com/tavern-rpg-suite/RPG-Diary) |
| Date and time on the counter | 🗞️ [RPG Scene Card](https://github.com/tavern-rpg-suite/RPG-Scene-Card) |
| Unread letters | 📱 [RPG-Phone](https://github.com/tavern-rpg-suite/RPG-Phone) |
| Companions and tickets | 🐇 [RPG Dungeons — The Rabbit Hole](https://github.com/tavern-rpg-suite/RPG-Dungeons) |
| Sprite | SillyTavern's Character Expressions folder |

Every one of these is optional. Without one, its card or medallion is simply not there, or is
dimmed with a note. **Diary**, **Map** and the phone button open those extensions through their own
buttons, so they behave exactly as they always do. If one of them is switched off, the menu says
so and stays open.

With no chat open there is nothing to read the scene from, so the menu keeps a few words about each
chat as you play it: the last line, who said it, the date and time. Only the last 40 chats are kept.

---

## ⚙️ Settings

Extensions → **Tavern Suite Menu**.

* **Show the menu when SillyTavern starts** — on by default.
* **Menu background** — the room you are in, a random room, or the chat background.
* **Accent** — gold, crimson, frost or sage.
* **Sounds** — on or off, and how loud.
* **Motion** — *Calm* turns every animation off. A system setting for reduced motion does the same.
* **Open the menu** — the 👑 crown in SillyTavern's top bar (where there is no top bar, a 👑 button next to the suite's other buttons), or `/hub`.

---

## ⌨️ Keys

**Esc** steps back: a panel, then the dossier, then the deck, then closes the menu.
**← →** turn the pages of the deck.

---

## 💡 Notes

* The menu is drawn for desktop. It scales to the window and keeps its proportions.
* It lives in its own shadow root, so a SillyTavern theme cannot recolour or shift it.
* The fonts ship with the extension (Playfair Display SC, Cormorant Garamond, Caveat, PT Mono —
  SIL Open Font License, see `fonts/OFL.txt`), so nothing is fetched from the internet.

---

## License

AGPL-3.0
