# The video, screen by screen

The approved prototype's walkthrough (the 2:24 "Essentials" cut, 1728 by 1080) is the product's end state (`docs/decisions.md`,
2026-10-31). One frame a second, `f0001.jpg` to `f0144.jpg`, lives in `~/.cache/gnoworld-tools/video-frames/`, outside the
repository: 21 MB of a video, and its sample people are not product data. A frame's number is its second in the video.

To compare a screen, render it at 1728 by 1080 at device scale 1 and lay it over the frame. Only three things may differ: real
data for the sample people; what is not built yet; the prototype's bugs and false words (`docs/design/coherence.md`, "Not to
rebuild").

| Frames | Screen | What it shows | Slice |
|---|---|---|---|
| 1 to 8, 16 to 17, 143 to 144 | The cosmos, the home | Header, the people-online number, two big actions, markets row, rail, labels, ticker | 5 for the 2D parts, 7 |
| 9 to 15 | "Pick a name and a face" | The dialog over the dimmed cosmos | 9 |
| 18, 19, 36, 88, 89, 101, 128, 129, 142 | A flight | The flight panel over the scene | 7 |
| 20 to 35 | GovDAO | Plate, proposals, activity, planet, chat dock, vote cards | 5, 7, 9 |
| 37 to 42 | The Earth by day | Plate, ring, country pills, chat dock | 5, 6, 7 |
| 43 to 55 | The Earth by night, turning | Bubbles, far-side counts, the chat growing | 6, 7 |
| 56 to 77 | The chat in full screen | Column of worlds, rooms, conversation, Earth panel, Jarvis, poll | 5q; Jarvis 10; polls phase 1 |
| 78 to 84 | A direct message | The same layout, one conversation | 5q |
| 85 | The Earth with a DM docked | Dock on a direct message | 7 |
| 86, 87 | Notifications | The panel in place of the dock | not placed yet |
| 90 to 97 | A new world, Fresh Mint | Plate, signal, first-to-chart pill, planet, dock | 5, 7, 9 |
| 98 to 100, 126, 127 | Search | ⌘K at the top left | 5n |
| 102 to 107, 115 to 125 | BUBBLE | Plate, previews in the chat, rooms, planet | 5, 7 |
| 108 to 114 | "Boop the pot" | A call's card signed in Adena | ADR-0002 cuts pots: Alexis's call |
| 130, 131 | A free slot, "rent me" | Station plate and the satellite's sign | 11 |
| 132 to 137 | "Put your words in orbit" | The rent card | 11 |
| 138 to 141 | "gm from Paris" | The rented slot | 11 |

These ranges were read from contact sheets, frame by frame only where a screen starts or ends: check a boundary against the
frames before relying on it.
