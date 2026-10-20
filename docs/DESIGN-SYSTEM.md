# Design system

The look and the rules every screen follows. Values come from the approved prototype
(`docs/prototype`), reduced by the coherence review of 2026-10-19 (`docs/design/coherence.md`):
every CSS rule, script style, icon, screen and second of the recorded tour mapped to one token and
one component, its 38 decisions approved by Alexis. Then independent UX, UI and design-systems
reviews of the 2a designs, against the needs of phases 0 to 3 (`docs/design/review-2a.md`), and
Alexis's four decisions on them. The changes that show are approved again on the before/after
designs of slice 2a; nothing in the style changes without his approval.

## Principles

These are the lead's and Alexis's rules from the prototype reviews.

- **Space first.**
  - The 3D carries the page; panels are light and few.
  - No dashboard feeling (the public client; the admin console may be dense).
  - Air everywhere.
- **People and help first.**
  - A room shows the people and what they say; counts, links and tools come on demand (a
    menu, the world's page, the composer's focus).
  - Jarvis offers the next step where a person may hesitate: at most three suggestions above
    the composer, and a "For you" card in the room's side panel, each with its source.
- **Realistic, not cartoon.** Planets, stations and light look like space photography.
- **Our own look.** Learn from references; never copy their interface.
- **One accent for actions.**
  - Line icons, never emoji in the interface. Emoji are for messages and reactions only.
  - Big primary actions.
  - Window controls (expand, close) sit above content actions (photos, saved), never in
    the same row.
- **Nothing overlaps; everything aligns.**
  - Consistent heights and baselines.
  - Long lists scale: a hundred rooms still fit.
- **Smooth.**
  - Things appear at the right time and place, with a transition.
  - Hovered items follow the pointer at once and ease back on leave.
- **Accessible.**
  - Every place is reachable without the 3D.
  - Visible focus; reduced motion respected.
- **Rich by composition, coherent by construction.** Few components, nested and parameterised;
  every screen is an assembly of them, and every assembly speaks only in tokens.

## Tokens

### Three tiers

| Tier | File | Holds | Read by |
|---|---|---|---|
| Primitives | `packages/ui/src/tokens.css`, named `--p-*` | The nine base colours, the only raw colours | Semantic tokens only: `check_css.py` refuses one read anywhere else |
| Semantic | `packages/ui/src/tokens.css` | The roles below, colours made only of primitives; the steps of space, size, type and time, which name a role already, hold their value | Components and compositions |
| Private | Inside a component's module, named `--_*` | What a variant or a context sets (`--_h`, `--_tone`) | That module only |

- Names say a role or a step, never a value (`--space-m`, not `--space-16`): a value can change
  without a rename.
- Shades are computed, not copied: `--color-mine-soft: color-mix(in oklab, var(--color-mine) 12%,
  transparent)`. One source per colour.
- The token file is the only list: Storybook reads its token page from it, and this document
  states the rules. A token joins it with the first component that reads it: one nothing reads
  fails `check_css.py`.

### Colour

The theme is dark only (`color-scheme: dark`). Nine base colours:

| Primitive | Value | Role |
|---|---|---|
| space | `#05070D` | The page behind the scene; the one ink on every light fill |
| night | `#0B0F18` | Surfaces: popovers, dialogs, cards on panels |
| text | `#F4F6FA` | Text; the base of the translucent fills |
| muted | `#9DA8BC` | The one secondary grey |
| cream | `#F2EFEA` | The primary button (one per region); what is selected |
| mint | `#5CF2C8` | `--color-mine`: what is mine, the focus ring, unread counts. Nothing else |
| amber | `#FFC46B` | Heat, the sun, live moments, what is about me; caution |
| violet | `#B79CFF` | What a machine says: uncharted signals, and the assistant (Jarvis's orb and the card of its answers) |
| coral | `#FF8A7A` | Errors, danger, a falling trend |

Semantic roles, all computed from them:

| Role | Made of | Use |
|---|---|---|
| `--color-fill`, `--color-fill-hover` | text at 5% and 10% | The resting fill of fields, chips and cards; hover |
| `--color-line`, `--color-line-strong` | text at 10% and 20% | Borders and dividers; secondary buttons, hover |
| `--color-panel`, `--color-glass` | night at 86% and 60% | Docked panels; what floats over the scene |
| `--color-scrim` | space at 70% | Behind a dialog |
| `--color-<accent>-soft`, `--color-<accent>-line` | the accent at 12% and 50% | Tinted fills and borders of mint, amber, violet, coral |
| `--world` | a world's own colour, set from its data | The plate over a world is `color-mix(in oklab, var(--world) 12%, var(--color-panel))`; the dock keeps the plain panel colour |
| `--texture-grid` | text at 6%, a 14 px dot grid | The plate's surface, from the prototype |

**Three meanings, three colours, never colour alone:**
- selected (navigation, a choice): the cream fill; on a thing that is not text (a planet, an
  avatar), a cream ring drawn with `box-shadow`, since `outline` is the focus ring's alone;
- mine (my vote, my reaction, my name): mint;
- about me (a mention of me): amber.

Each one comes with an icon or a word as well. The current row of a list is the hover fill one
step stronger and its title at 500; hover alone is the resting fill. Live is amber; progress is
text on the hover fill; a trend is text with its caret, coral when it falls.

**One cream primary per region** (the plate, the dock, a card, a dialog). The flash carries none.

**Severity, three levels, each an icon and a word:**
- notice: neutral, with the info icon;
- caution: amber, with the warning icon ("Testnet", "This realm is not checked by gnoworld");
- danger: coral, with the alert icon (an irreversible or costly act, an error).

**Confirmation follows reversibility:**
- reversible: act at once, then a flash with Undo;
- irreversible off chain: a dialog whose danger button names the act;
- on chain: the signing block (Components);
- value at risk on mainnet: the person types the amount.

**Trust, shown in words.** A conversation's header and its row show one of: not encrypted,
encrypted, key changed, checked by you; each an icon (lock, shield, key) and a word, never on the
avatar. "Never a verified badge" means no badge granted by the platform; a check the person made
is theirs. The network is always named, and a testnet always says "Testnet". "Sponsored" is for
paid placement only; a fee someone else pays reads "Fee paid by gnoworld".

**Contrast,** every pair at least 6.3:1. These are measured on 2026-10-19 with an sRGB mix: the
oklab mix differs by little, and axe in the gate measures the real pixels.

| Pair | On space | On night |
|---|---|---|
| Text | 18.6:1 | 17.7:1 |
| Muted | 8.4:1 | 8.0:1 (6.3:1 on the hover fill) |
| Mint, amber | 14.4:1, 12.8:1 | 13.7:1, 12.2:1 |
| Violet, coral | 8.8:1 | 8.4:1 |
| An accent on its own 12% tint | | 7.0:1 (violet) to 10.7:1 (mint) |
| The ink (space) on cream, mint, amber, coral | 17.6:1, 14.4:1, 12.8:1, 8.8:1 | |

**Glass keeps its contrast over any scene.** Its opacity has a floor, checked by a picture of
the brightest planet behind the header's pills.

### Type

| Token | Size | Family, weight, tracking | Use |
|---|---|---|---|
| `--font-label` | 11 px | Geist Mono 500, caps, 0.14em | Kickers, captions, counts, the header's links: the one label style |
| `--font-meta` | 12 px, leading 1.4 | Geist 400 | Timestamps, secondary lines, fine print |
| `--font-data` | 12 px | Geist Mono 400 | Addresses, hashes, code, the ticker, chart axes |
| `--font-ui` | 13 px | Geist 500 | Controls, chips, tabs |
| `--font-body` | 14 px, leading 1.5 | Geist 400 | Messages, panels; item titles at 500 |
| `--font-lead` | 16 px, leading 1.5 | Geist 400 | A world's description |
| `--font-action` | 16 px | Geist 500 | The 56 px main action |
| `--font-title-s` | 20 px | Geist 400 | Small headers (notifications) |
| `--font-title-m` | 28 px, -0.03em | Geist 300 | Panel and dialog titles, room names, big facts |
| `--font-title-l` | 36 px, -0.03em | Geist 300 | Dialogs that tell a story (passport) |
| `--font-display` | `clamp(4.5rem, 8vw, 7rem)`, -0.04em, leading 0.9 | Geist 600 | A world's name on its plate |
| `--font-hero` | `clamp(5.5rem, 11vw, 11rem)`, -0.06em, leading 0.9 | Geist Mono 400, tabular | The hero number |

- Each role is a composite token (`font: var(--font-body)`). The label's tracking and caps are a
  utility that components compose once; no component sets caps or tracking itself, units and
  domains inside a label keep their case, and the utility resets both under `:lang()` for scripts
  that caps break (Arabic, Hebrew, Persian…).
- 11 px is the floor; nothing is smaller.
- Two families, Geist and Geist Mono, self-hosted with `font-display: swap` and preloaded for the
  first screen; beyond the scripts Geist covers, a system fallback per script. The first paint is
  measured for layout shift.
- Message text holds at most `--measure` (65ch); text that people or realms write sits in a slot
  with `dir="auto"`.
- Sizes are in rem so the reader's zoom works; numbers that change are tabular.
- Weights: 300, 400, 500, 600. Leading: 0.9, 1, 1.4, 1.5.

### Space, size and shape

| Token | Values |
|---|---|
| `--space-3xs` … `--space-2xl` | 4, 8, 12, 16, 24, 32, 48, 64 px, a 4 px grid; section space is fluid with `clamp()` |
| `--control-xs` / `--control-s` / `--control-m` / `--control-l` | 24 / 32 / 40 / 56 px: badges and reactions / toolbars, chips, tabs / default / the main action. Under `pointer: coarse`, `--control-m` is 44 |
| `--radius-s` / `--radius-m` / `--radius-l` / `--radius-pill` | 8 / 12 / 24 / 999 px: small controls, rows, menus / cards, fields, popovers, bubbles / panels, dialogs / buttons, chips, tabs |
| `--icon-m` / `--icon-l` | 16 / 20 px, the only icon sizes |
| `--size-counter` / `--size-progress` | 18 px (an unread count) / 4 px (every progress bar) |
| `--avatar-s` / `-m` / `-l` | 20 / 24 / 48 px |
| `--thumb-*` | 16, 24, 32, 48, 64 px |
| Layout | header clearance 96, dock 360 (320 under 1400), plate 620 with a 440 text column, rail 120, dialog 460 and wide 760, popover 300 px; `--measure` 65ch; `--switch-at` 38rem, under which a Switcher stacks its children, about 65ch of body text in one unit for every child |

- Controls are a minimum height with padding, never a fixed height, so text zoomed to 200% grows
  the control instead of spilling out.
- A target is at least 24 px (WCAG 2.2, 2.5.8; a link inside a sentence aside), and the default
  control is 44 px by touch; a toolbar's small controls stay at 32.
- Interface text and controls do not scale with the window; section space and titles do.
- **Density:** `comfortable` (default) or `compact`, set once with `data-density` on a container;
  it remaps the control and row aliases, so no component holds a density rule of its own.

### Elevation and effects

| Token | Value | Use |
|---|---|---|
| `--shadow-popover` | `0 12px 32px` black 55% | Popovers, menus |
| `--shadow-float` | `0 16px 40px` black 45% | The flash, the big action |
| `--blur-glass` | 12 px | Small surfaces over the scene: labels, pills, the flash |
| `--blur-surface` | 24 px | Only where the slice 7 bench allows it; large panels use the near-opaque panel colour |
| `--opacity-disabled` | 0.4 | Every disabled control |

### Layers

| Token | Layer |
|---|---|
| `--z-scene` | The canvas |
| `--z-labels` | Labels and bubbles anchored to the scene |
| `--z-chrome` | Header, hero, rail, ticker, the top-centre slot |
| `--z-dock` | The chat dock, the plate |
| `--z-popover` | Popovers, menus |
| `--z-toast` | The flash: one at a time, queued |

Dialogs, popovers and the flash use the browser's top layer, which stacks by opening order, not
by these tokens. The flash is never under a dialog's scrim: it opens after the dialog, or waits
until the dialog closes.

### Motion

| Token | Value | Use |
|---|---|---|
| `--motion-fast` | 120 ms | Hover, press, a popover's fade |
| `--motion-base` | 200 ms | Panels, tabs, chips |
| `--motion-slow` | 400 ms | The dock sliding, the library view |
| `--motion-scene` | 1.3–3.2 s, by distance | Flights (the scene, not CSS) |
| `--motion-spin` | 0.8 s | The spinner |
| `--motion-ambient` | 3 s | Ambient loops (a breathing orb, rings) |
| `--ease-standard` | `cubic-bezier(0.2, 0.7, 0.1, 1)` | Entering, moving |
| `--ease-emphasized` | `cubic-bezier(0.7, 0, 0.2, 1)` | The loader's iris, big reveals |

Named behaviours:
- **Arrival on a world:** the planet settles, the plate comes in, the figures count up. All of it
  takes 1.2 s at most.
- **Lifetimes:** a flash and a scene bubble live 5 s.
- **Landing at once:** a click or `Esc` during a flight lands immediately (ADR-0001 §7).

Under `prefers-reduced-motion: reduce`:
- flights become crossfades of `--motion-base`;
- figures appear at their value;
- nothing bounces or loops;
- the dock magnification is off.

The scene keeps its own speeds.

## Data graphics

Bars, sparklines and deltas hold at least 3:1 against their ground; past bars in muted, the
current one in text; thin bars (24 for a day); the peak and the current value written in
`--font-data`, and the same values as text for assistive technology.

## Words

- A claim about security, cost or a format (encrypted, free, a fee, a name's rule) cites its
  source, an ADR line or a read of the chain; sample data in designs and stories is valid on the
  chain (a name passes `r/sys/namereg`).
- One time rule: the reader's local time, with UTC beside it; one way to write a deadline.
- No count against the universe's total ("42 of 551"); progress shows per constellation.
- Text written by a realm, a bot or Jarvis always shows its source and never speaks in
  gnoworld's voice.
- A person's country (opt-in) is its flag, a picture from one set, named for screen readers; never
  an emoji (Chrome and Edge on Windows draw two letters) nor a bare code.
- Reactions are emoji with their count, named for screen readers ("Rocket, 4, including you").
- Buttons start with a verb and name what happens ("Vote… · signs in Adena", "Read it · free").

## Browsers

Baseline "widely available", with two named exceptions from 2024: the `popover` attribute and
`@starting-style`. The lint holds the line and lists the exceptions. Popovers are positioned by a
small function of ours until CSS anchor positioning (Baseline 2026) is widely available.

## Testing the CSS

Storybook, plus the journeys; no extra service. The component tests render each story through a
helper of ours, not Storybook's `composeStories`, whose runtime brings an `expect` of its own that
stops Vitest counting assertions. The stories' journeys (`app/tests/stories`) build Storybook and
walk every story in Chromium, in the full gate.
- **Lint and types,** in the fast gate: `@eslint/css`, `check_css.py`, typed modules (`tsc`),
  jscpd.
- **Pictures:** every story, at three container widths and with reduced motion, screenshotted
  by Playwright and compared with the approved images (the browser and its platform: slice 2's
  plan). A new baseline is its own commit, which Alexis reviews; changing or deleting an
  approved one fails the push unless the commit says why (`Updated-baseline:`,
  `scripts/check_regressions.py`).
- **Invariants,** measured in the browser on every story and the journeys:
  - nothing overlaps: the point at the centre of each control hits that control;
  - every target is at least 24 px, the default control 44 px by touch;
  - `:focus-visible` draws its ring;
  - no horizontal scroll from 320 px wide; text still fits at 200% zoom;
  - forced colours keep every control visible; reduced motion stops transitions;
  - axe passes, contrast included.
- **Stories that stress:**
  - a text 40% longer, a 40-character name, a right-to-left message;
  - every state of the coherence review that the prototype lacked: sending, failed, typing,
    empty, loading, broken media, too late, no selection.
- **Budgets:** the CSS's size in the build budget, and layout shift at first paint.

## Components

They live in `packages/ui` (`@gnoworld/ui`), shared by the client and the admin console, each a
component with its CSS Module, documented by its props.

**How they compose:**
- **Named parts.** Card.Header, Card.Body and Card.Actions; Row's lead, title, subtitle,
  activity and trail; Field's label, help, error and prefix.
- **Closed variants.** `size`, `emphasis` (solid, outline, quiet), `tone` (neutral, danger; and
  for static marks mine, warm, signal) and `density` are TypeScript unions, and each value only
  sets private properties. A primary button is `emphasis="solid" tone="neutral"` (cream); a
  destructive one is `tone="danger"`.
- **No outside styling.** No component accepts `className` or `style`: TypeScript refuses them.
- **Context cascades.** `data-tone` and `data-density` on a container, and the surface level (a
  card on a panel is one step lighter), reach everything inside.

**Where they live:**
- **A component exists once two places use it;** otherwise it is a variant, or an assembly that
  lives in its feature. `ui` holds layout and states, never a domain: a call, a poll, a proposal,
  a quiz or a seal is an assembly in its feature, built from `Card` and the signing block.
- **Storybook shows everything.** One page shows every token. Another shows every component at
  once. Then come each component's matrix (size × tone × emphasis × state) and the real
  assemblies.

| Component | Variants and states | Notes |
|---|---|---|
| `Button` | emphasis solid, outline, quiet; tone neutral, danger; sizes s, m, l; with an icon; disabled; busy | The solid neutral (cream) is the primary: one per region. A danger button names its act |
| `IconButton` | sizes s, m, l (the header, 44 by touch); outline, plain; pressed; a count | Always an `aria-label`, and a `Tooltip` with the same text (2c). A count shows past 99 as 99+, and the button adds it to its name as shown ("Unread notifications, over 99"): WCAG's label in name |
| `Chip` | interactive (default, selected, with a count); static, at `--control-xs`, with a tone (a card's state, a badge) | Room chips, quick actions, filters, reactions, genre lenses (ADR-0002 §3); "Testnet" and "Sponsored" are uses of the static chip |
| `Tabs` | segmented, with counts, icon-only; none selected | ARIA `tablist`. The views (Earth, Cosmos, List), notifications, the library filter, a world's rooms in the dock |
| `ChoiceGroup` | segmented, list | ARIA `radiogroup`, one look: each option a boxed row; the chosen one cream with the check. The days to rent, a poll's and a quiz's answers |
| `Popover` | anchored; menu; listbox | The native `popover` attribute; outside click and `Esc` close it |
| `Combobox` | mentions, commands, search | A list moved with the arrow keys in a `Popover`, ARIA `combobox`: `@`, `/` and ⌘K |
| `Tooltip` | | On every icon-only control |
| `Toolbar` | | ARIA `toolbar` with roving focus: a message's actions, formatting, the composer's tools |
| `Dialog` | standard, wide (the ⌘K palette, the lightbox, the passport) | The native `<dialog>`. Focus moves to the first field or the title, never to a primary button. Device-only routes (`/passport`, `/saved`) open as dialogs over the current place. A signing block may sit inside one (registering a name, setting up a session); a dialog is never the transaction itself (ADR-0002 §4) |
| `Panel` | docked, floating; the plate (world-tinted, dot grid, fading edge, a vertical caption) | Header (one height), body, footer; the plate and the chat dock are panels |
| `Card` | header, body, actions; tones; dashed; density | Layout only. Its kinds (message, call, digest, proposal, event, announcement, media, poll, quiz, seal) are assemblies in their features (ADR-0002 §4) |
| `SignPanel` | preview, waiting, signed, in a block, done; refused, failed, too late, wrong network, wallet missing or locked | The one signing block, whoever signs (Adena, a session, a signature that is not a transaction). It shows the account, the realm, the function, the arguments, the network with its label, the fee as an estimate and who pays, the steps in words, the ADR-0001 §11 warnings and a link to gnoweb. Only it renders the confirm control |
| `Row` | plain, divided, boxed; current; with a thumbnail, an icon or an avatar | Lists, connected worlds, notifications, search results, agenda entries. The activity slot carries in words what the 3D shows |
| `Field` | text, search, composer, date (the browser's `datetime-local`); label, help, error, prefix | The composer is a rich text box: bold shows as bold, Markdown on the wire. At rest it is one line (add, emoji, mention, send); the formatting tools show when it has focus. A name is typed at body size, never in data mono |
| `Avatar` | sizes s, m, l; kind person, assistant, bot; presence; speaking ring | A person's nebula is generated from the address (ADR-0002 §1, §8 row 9): `partsFrom(address)`, then `draw(parts)`; three clouds of colour on night and the address's constellation over them (five stars, one per fifth of the disc so the shape stays open, joined in one of three orders, one bright), the same at every size, readable at 20 px. Never an NFT: the face is computed from the address, which only its key controls (ADR-0001 §11). Where the clouds and stars sit always comes from the address; the palette is chosen in phase 1. A face tells people apart at a glance, never who they are: anyone can try addresses until a face looks like yours, so the name, and the short address where a person matters, identify; my own messages are marked by my name in mint and the word "you", never by the face. The short address shows wherever a person matters (person card, mention list, DM header, signing). An assistant or a bot has its own mark and a word, never mint. Never a planet. No uploaded picture (ADR-0002 §6). Never a badge granted by the platform |
| `PlanetThumb` | world, ecosystem cluster, star, station, signal; dock magnification | Rendered from the same look as the 3D world |
| `Stat` | number, unit, caption; the heat badge; delta | Tabular numbers that count up on arrival. Under reduced motion, effects become `Stat` counts |
| `ActivityChart` | 24 h bars, a hover tooltip, sparkline | SVG, no chart library; Data graphics, above |
| `Progress` | bar, steps, spinner, wave, arc | The flight, a quest, the signing wait, a speaker, the passport's gauge |
| `Kicker` | with a dot; vertical (the plate's atlas caption) | `--font-label` |
| `Flash` | title, line, one action (never cream) | One at a time; the next waits; arrival banners are its variants |
| `EmptyState` | text and one action | Every list has one |
| `Skeleton` | line, card | Only where data takes longer than 300 ms |
| `Logo` | mark, mark and wordmark | The header and the loader |

Later, each in its slice: `Message` (4, on Card), `Breadcrumb` and the ⌘K palette (5, on
Dialog), the scene `Label` (7); `Table`, `Checkbox`, `Switch`, `Select` when the settings and the
admin console need them (8, 12). Menu is a `Popover`, a badge a static `Chip`, a presence dot an
`Avatar` slot, a divider a base `hr`. The flight panel is the flight feature's assembly.

**Rich cards in the chat.** Every interactive structure of a room is one `Card`:
- a header: the type's icon, a kicker, a title and a state (live, ended, won, signed);
- a body of blocks: `Row`, `ChoiceGroup`, `Progress`, `Stat`, `Grid`, `Field`, media `Card`,
  `Avatar`;
- a footer: actions and a meta line (a count, a clock with its unit).

Jarvis's answer stands out from the people's messages, as in the prototype: a `Card` in the violet
tone (`--color-signal-soft` fill, `--color-signal-line` border), its orb, the word "Assistant" beside
its name, its source in the meta line, and its next steps as at most three chips ("Ask them", "Fly to
Dev help"). A person's message stays a plain row; the composer's placeholder names it ("Message
#general or ask @jarvis").

This covers the calendar (an agenda of `Row`s by day, no calendar widget), who's here, catch up,
realm and vote, station, quest and expedition, poll, room games and contest. A new kind is an
assembly in its own slice, with its story.

### Icons

- One set of 55: close, plus, arrow, arrow-up-right, chevron, search, chat, thread, reply, bell,
  passport, seal, expand, shrink, image, bookmark, smile, code, code-block, list-bulleted,
  list-numbered, quote, pause, play, pin, more, pencil, link, comet, at, mail, check, calendar,
  spark, news, satellite, planet, cluster, bold, italic, underline, strikethrough, slash, caret,
  share, menu, people, star, chart, info, warning, alert, lock, shield, key. A new icon joins the
  list in the slice that needs it. Those that point along the text turn right to left: arrow,
  arrow-up-right, reply, list-bulleted, list-numbered and quote; the chevron and the caret point
  across it and stay.
- A 16 px grid, a 1.5 px stroke, round caps and joins, `currentColor`, drawn at `--icon-m` or
  `--icon-l` only.
- Each icon is a component that renders inline SVG with `aria-hidden="true"`. Its button
  carries the label.
- No emoji, no typed arrows or glyphs (→ ↑ ✓ ▲ ‹) in the interface.

## Layout

| Region | Place | Size |
|---|---|---|
| Header | Top, 34 px from the edge, the same on every view | Controls at `--control-m` (44 by touch). Logo left; the views (Earth, Cosmos, List), the network (the universe switcher, "Testnet" on a testnet) and search centre; Jarvis, chat, passport, bell, account right. The account button opens the menu (passport, saved, settings, help, log out); on a phone, a menu button holds it with the navigation (ADR-0002 §1, menu and settings). When narrow, labels drop before icons; the network and the account never drop. Its pills have a backdrop that keeps them readable over any planet |
| Top centre | Under the header, centred in the scene's free area (between the plate and the dock) | One slot: the flight panel, the expedition pill, the flash |
| Hero | Bottom left of the cosmos | The number, one line that says what gnoworld is, two big actions, the markets row; the scene keeps it clear (a safe area) |
| Rail | Right of the cosmos | Planets at 64 px, magnified like a dock; names on two lines; as tall as its worlds; labels keep out of it |
| Plate | Left of a world's frame | 620 px, a 440 px text column; its background fades into space over its last 64 px, with no border, so the planet keeps the frame's free area; the dot grid and the vertical atlas caption; a scroll cue when its content is cut |
| Chat dock | Right | 360 px, 320 px under 1400 px, in the plain panel colour; messages anchored at the bottom; full screen on demand: a column of worlds, a room sidebar (rooms, Media, Saved, DMs), the conversation, and an info panel (Here now, pins) |
| Ticker | Bottom | 34 px, pausable |
| Credits | A fixed corner, wherever textures show, on phones too | One 11 px "Credits" link in the muted grey, opening the full attributions (CC BY 4.0 §3(a)(2) allows a link) |

Search is a ⌘K palette (a wide `Dialog` with a `Combobox`), not a drawer.

Breakpoints:
- 900 px: phone layout, chat first (ADR-0002 §8, row 10). The chat is full screen; places
  are a list with planet thumbnails; "View in space" loads the 3D on request, and then the
  plate goes below the planet.
- 1200 px: the dock opens by itself on a world.
- 1400 px: the dock's width.

**When space runs short,** things drop in this order, never overlapping:
- a world's focus view (for example 1280 px with the plate and the dock): the flight
  panel's details, comets, auroras, small storms, moon labels (the moons stay), the rings'
  detail. The planet, its heat and its status ring never drop;
- the cosmos: the ticker, then the markets row, then the rail shortens to twelve worlds.
  The hero's number and its two actions never drop.

Components use container queries, so they fit wherever they are placed.

## CSS rules

- **The method is CUBE CSS** (composition, utility, block, exception) on CSS Modules, in
  cascade layers declared once: `@layer reset, tokens, base, compositions, components,
  utilities;`.
  - **Base** styles the elements globally first (type, links, focus, `hr`, rich text: code,
    quote, mention), so components write little. `::selection` waits for Baseline.
  - **Compositions** are the layout primitives, `Stack`, `Cluster`, `Grid`, `Sidebar`,
    `Switcher`, `Center`: intrinsic layouts that place things without styling them, each taking
    a space step (Center's is its gutter). All layout is one of them, never new CSS.
  - **Blocks** are the components, one CSS Module each, so class names never leak.
  - **Utilities** are a handful of single-purpose classes, driven by tokens: visually-hidden,
    the flow space, truncate, list-reset, scroll-body, the label style.
  - **Exceptions** are states read from attributes, `[aria-pressed="true"]`,
    `[aria-expanded]`, `[data-state="busy"]`, never modifier classes: the state the
    accessibility tree sees is the state the CSS draws, and tests select it by role.
- **A variant sets private properties only:** `.root[data-size="l"] { --_h: var(--control-l) }`,
  and one rule reads `--_h`. No declaration is written twice.
- **Fluid, not breakpoints:** type and space scale with `clamp()` tokens; components adapt
  with container queries; a media query is for the device (pointer, motion, contrast).
- **No `!important`, no ID selectors, no styling from outside a component.** The CSS
  linter enforces it.
- **Values come from tokens:**
  - colours, sizes, radii, durations, shadows, blurs and z-index are tokens;
  - a raw value needs a comment saying why.
- **Logical properties** (`margin-inline`, `inset-block`), so the layout can follow the
  writing direction.
- **Direction** is read from `[dir="rtl"]`, not `:dir()`: the build's minifier turns `:dir()` into a
  list of languages, which a page set right to left by `dir` alone does not match.
- **Focus:** one ring everywhere, `:focus-visible` with a 2 px mint outline and an offset;
  fields included. Nothing hides focus.
- **Motion:** `transition` names its properties, never `all`. Prefer animating
  `transform` and `opacity`.
- **Stacking:** a `backdrop-filter` blur only on small surfaces over the scene, and only one deep.
- **No dead CSS:** a module's unused class and a token nothing uses fail the gate.
- **Enforced, not hoped for:**
  - ESLint lints the CSS too (`@eslint/css`): only Baseline features for our browsers,
    every rule in a layer, logical properties, no `!important`, no invalid property or
    value, a cap on selector complexity;
  - `scripts/check_css.py` refuses:
    - a raw colour, size, radius, duration or z-index;
    - a token that does not exist, a token nothing uses, and a module class nothing uses;
    - a primitive read outside the token file;
    - a private property read outside its module;
  - **compositions, not blocks, do layout:** `check_css.py` refuses `display: flex` or
    `grid`, `gap`, the `flex-*`, `grid-*`, `justify-*` and `align-*` properties, and any
    outer `margin`, in a block's module. A block that truly needs one (an icon beside a
    label) says why in a `/* layout: … */` comment, and the gate prints the count of those
    exceptions so review sees it grow;
  - **no copied rules:** the same set of three or more declarations in two modules fails
    `check_css.py`; it becomes a composition, a utility or a `composes`;
  - a class a component names (`styles.x`, `styles["x"]`) that its module lacks fails
    `check_css.py`;
  - a copied block of CSS fails jscpd.
- **DRY by composition:** a pattern used twice becomes a component in `ui` (the layout
  primitives first), or a shared class reached with CSS Modules' `composes`; never a copy.
  Native CSS only: nesting, `@layer`, container queries, logical properties, `color-mix()`;
  no preprocessor, no utility framework.

## Not rebuilt

These are kept out on purpose (`docs/design/coherence.md`, "Not to rebuild"):
- **The prototype's dead UI:** the side card, the old Jarvis panel, the toast, the top and
  bottom bars, the evolutions board, the range slider, avatar upload.
- **Its invented timers:** the pot and its countdown (ADR-0002 §8, row 2).
- **Its bugs**, each with a test that holds it once the component exists.
