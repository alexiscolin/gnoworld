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
| coral | `#FF8A7A` | Errors, danger, a falling trend; what is new (`--color-new`) |
| dusk | `#6885D9` | `--world` until a world has its own colour: its plate's tint, 16 % over the night. Nothing else |

Semantic roles, all computed from them:

| Role | Made of | Use |
|---|---|---|
| `--color-fill`, `--color-fill-hover` | text at 5% and 10% | The resting fill of fields, chips and cards; hover |
| `--color-text-faint` | muted at 80% | A field's placeholder alone, dimmer than the prefix as frame 10's (F5980): 5.1:1 on a field over night, 5.4:1 over space, 4.6:1 inside a card (WCAG AA; D311) |
| `--color-ink-hover` | space at 10% | Hover on a filled control, the cream or the coral, where the text's veil would not show (F369) |
| `--color-line`, `--color-line-strong` | text at 10% and 20% | Borders and dividers; secondary buttons, hover; a field's resting edge is the strong one (frame 10, F5968) |
| `--color-card`, `--color-card-hover` | text at 3% and 6% | The hub card of a places' list; under the pointer |
| `--color-bubble` | space at 94% | A bubble over the scene: near-black, no blur |
| `--color-pill-glass` | surface at 72% | The translucent pills over the scene and the globe (a space label, a country tag) |
| `--color-link` | the words' own ink | A link's ink on a page that sets one (a realm's page in its plate) |
| `--color-surface` | night | What floats over the page: popovers, menus, tooltips, dialogs |
| `--color-scrim` | space at 70% | Behind a dialog |
| `--color-<accent>-soft`, `--color-<accent>-line` | the accent at 12% and 50% | Tinted fills and borders of mint, amber, violet, coral |
| `--color-new`, `--color-new-line` | coral; coral at 60% | What is new in a list: the "New" divider's word and its rule, the 60% holding 3:1 against the page (WCAG 1.4.11). Its own token, so what is new can change hue without touching danger |
| `--world`, `--world-light` | a world's own colour, set from its data, a cool blue until it has one; that colour at 62% over the text | The plate's tint, 16% over the night; the world's words and lines on the plate; the dock keeps the plain surface |

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
- on chain: the call card, which signs in Adena and says every state in words (`app/src/features/calls/CallCard.tsx`);
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
| `--font-data` | 12 px | Geist Mono 400 | Addresses, hashes, code, chart axes |
| `--font-ui` | 13 px | Geist 500 | Controls, chips, tabs |
| `--font-reading` | 13 px, leading 1.5 | Geist 400 | The sentence under a card's or a dialog's title (frames 10 and 110): a line read, not a control |
| `--font-chat` | 13.5 px, leading 1.45 | Geist 400 | A chat's lines on a phone |
| `--font-chat-l` | 15 px, leading 1.5 | Geist 400 | A chat's lines with room for them: the full chat's and the dock's on a computer (D419) |
| `--font-body` | 14 px, leading 1.5 | Geist 400 | Messages, panels; item titles at 500 |
| `--font-field` | 14 px, 16 px under a coarse pointer, leading 1.5 | Geist 400 | A field's text and prefix: at 16 px iOS Safari does not zoom on focus (F371) |
| `--font-lead` | 16 px, leading 1.5 | Geist 400 | A world's description |
| `--font-action` | 16 px | Geist 500 | The 56 px main action |
| `--font-title-s` | 20 px | Geist 400 | Small headers (notifications) |
| `--font-title-room` | 22 px, leading 1 | Geist 300 | A room's name in the chat's header |
| `--font-title-m` | 26 px, -0.03em | Geist 300 | Panel and dialog titles, room names, big facts (frame 10's dialog title, F5969) |
| `--font-title-l` | 36 px, -0.03em | Geist 300 | Dialogs that tell a story (passport) |
| `--font-count`, `--font-hint`, `--font-tick`, `--font-mono-ui`, `--font-chip`, `--font-card-name`, `--font-card-title` | `--font-data`; 10.5 px; 11 px mono; 13 px mono 500; 12 px 500; 18 px; 17 px 500 | | A count beside its words; the smallest hint; the chart's axis labels; a function's signature; a chip's words in the plate's pills; a card's name; a card's title |
| `--font-figure` | 44 px, -0.04em, leading 1 | Geist Mono 500, tabular | The instrument figures of `Stat` (Alexis, 2026-10-31): the board "Instrument" of the counter-proposal; its caption is the label |

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
| `--control-xs` / `--control-s` / `--control-m` / `--control-l` | 24 / 32 / 44 / 56 px: badges and reactions / toolbars, chips, tabs / default / the main action. The default is 44 with a pointer too, as the video's (F5967); a field's box is the default and its two edges, 46 |
| `--radius-s` / `--radius-item` / `--radius-m` / `--radius-box` / `--radius-l` / `--radius-pill` | 8 / 10 / 12 / 16 / 24 / 999 px: small controls, rows, menus / cards, fields, popovers, bubbles / panels, dialogs / buttons, chips, tabs |
| `--icon-s` / `--icon-m` / `--icon-l` | 12 / 16 / 20 px, the only icon sizes |
| `--size-counter` / `--size-dot` / `--size-dot-l` / `--size-bar` | 18 px (an unread count) / 6 and 8 px (a dot) / 44 px (a bar of controls) |
| `--avatar-s` / `-m` / `-l` | 20 / 24 / 48 px |
| `--thumb-s` / `-m` / `-l` | 32 / 52 / 64 px: a row's lead / a card / the rail |
| Layout | header clearance 96, dock 420 (`--chat-dock`; `--chat-dock-s` 380 under 1400; 360 and 320 before 2026-11-08, D419), plate 808 with its fade (`--plate-w`), dialog 490 and wide 760, popover 300 px and wide 440; `--measure` 65ch; `--switch-at` 38rem, under which a Switcher stacks its children, about 65ch of body text in one unit for every child |

- Controls are a minimum height with padding, never a fixed height, so text zoomed to 200% grows
  the control instead of spilling out.
- A target is at least 24 px (WCAG 2.2, 2.5.8; a link inside a sentence aside), and the default
  control is 44 px; a toolbar's small controls stay at 32.
- Interface text and controls do not scale with the window; section space and titles do.
- **Density:** `comfortable` (default) or `compact`, the `data-density` of a `Card` (its `compact` prop), which its sheet reads.

### Elevation and effects

| Token | Value | Use |
|---|---|---|
| `--shadow-popover` | `0 12px 32px` space 55% | Popovers, menus, dialogs |
| `--shadow-float` | `0 16px 40px` space 45% | The flash, the big action |
| `--opacity-disabled` | 0.4 | Every disabled control |

### Layers

No token names a layer: the page stacks by the order of its elements, and a module that needs more sets its own small `z-index`
(`packages/ui/src/Flash/Flash.module.css`, `Panel/Panel.module.css`). The flash is the topmost, one at a time, queued.

Dialogs, popovers and the flash use the browser's top layer, which stacks by opening order. The flash shows at the top of the screen, centred, above a dialog's scrim when it
opens after the dialog (F331). A modal dialog makes everything outside it inert, the top layer
included: a flash raised over one is seen, and its Close and action wait until the dialog closes.
A flash shown before a modal dialog opens, such as the update notice, which stays, sits under the
dialog's scrim, dimmed and inert, and shows again as it was when the dialog closes (F354): raising
it again would show an action no one can press until then.

### Motion

| Token | Value | Use |
|---|---|---|
| `--motion-fast` | 120 ms | Hover, press, a popover's fade |
| `--motion-base` | 200 ms | Panels, tabs, chips |
| `--motion-wait` | 300 ms | What waits before it shows: a skeleton |
| `--motion-slow` | 360 ms | The dock sliding, the library view |
| `--motion-label` | 400 ms | A label of the scene fading in or out |
| `--motion-arrive` | 1.2 s | A page opened from its URL: its scene coming in from black |
| `--motion-scene` | 1.3–3.2 s, by distance | Flights (the scene, not CSS) |
| `--motion-spin` | 0.8 s | The spinner |
| `--motion-ambient` | 3 s | Ambient loops (a breathing orb, rings) |
| `--ease-standard` | `cubic-bezier(0.2, 0.7, 0.1, 1)` | Entering, moving |
| `--ease-emphasized` | `cubic-bezier(0.7, 0, 0.2, 1)` | Big reveals |
| `--ease-in` | `cubic-bezier(0.5, 0, 0.9, 0.4)` | Leaving |
| `--ease-out-3` | `cubic-bezier(0.215, 0.61, 0.355, 1)` | The arrival's curve (GSAP's power3.out) for what it does in CSS |
| `--d`, `--play`, `--n`, `--j`, `--pk`, `--spark-line`, `--spark-area` | 0 s, `running`, 0, 0, 0.9 s, 0.9 s, 1.2 s | The plate's entrance: a card's delay, whether its parts' animations run, a part's place in its row, the chart's peak label, when a line and its area draw; a card or a chart sets them |
| `--transition-tint`, `--transition-fade` | background and ink; opacity | A fill and an ink easing as a control is pointed at; a box fading as its opacity changes |
| `--motion-scale` | 1, or 0 | Every duration is multiplied by it: 0 under reduced motion, the system's or the site's own setting |

Enter and leave (the motion pass, 2026-11-07): everything that appears also leaves. It enters on `--ease-standard`
with a 4–12 px travel from where it comes, and leaves on `--ease-in` in about 70% of the time, with a fade and a few
pixels at most. Dialogs and popovers use `@starting-style` and `transition-behavior: allow-discrete`. The scene sets the
pace; the page follows its phases.

Named behaviours:
- **Arrival on a world:** the planet settles, the plate comes in, the figures count up. All of it
  takes 1.2 s at most.
- **Lifetimes:** a flash and a scene bubble live 5 s, held while the pointer is over them or the
  focus is in them, and then given 5 s again; every flash has its Close; a flash that carries an
  action stays until it is taken or closed, and taking it ends it (WCAG 2.2.1).
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

Baseline "widely available", with four named exceptions: from 2024, the `popover` attribute and
`@starting-style`; and `forced-color-adjust`, for pictures only (the avatar's face), which forced
colours then leave as drawn, the property doing nothing where forced colours do not exist (Alexis,
2026-10-21, F319); and `field-sizing` and `resize`, for the box of lines, which grows with its draft
and drags by its height alone (F1729). The lint holds the line and lists the exceptions, the last two
for the avatar's and the field's sheets alone (F349, F1729). Popovers are positioned by a
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
  `scripts/check_regressions.py`). Since the speed plan (2026-11-06) the default runs compare none: the pictures spec stays in the repository and
  runs in `check.sh --everything`; the approved video is the reference, compared by eye, and the design is decided live.
- **Invariants,** measured in the browser on every story and the journeys:
  - nothing overlaps: the point at the centre of each control hits that control;
  - every target is at least 24 px, the default control 44 px;
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
  activity and trail; Field's label, box (the frame round a prefix and its input), help, error and prefix.
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
  a quiz or a seal is an assembly in its feature, built from `Card`.
- **Storybook shows everything.** One page shows every token. Another shows every component at
  once. Then come each component's matrix (size × tone × emphasis × state) and the real
  assemblies.

| Component | Variants and states | Notes |
|---|---|---|
| `Button` | emphasis solid, outline, quiet, link; tone neutral, danger; sizes s, m, l; with an icon; disabled; busy; a `description`, the shortcut it shows (`keys`), `expanded`; or a link (`href`, `reload`) | The solid neutral (cream) is the primary: one per region. A danger button names its act |
| `IconButton` | sizes xs, s, m, l (the header, m: 44); outline, plain; pressed; expanded; a count, in a mine or new tone | Always a `label` (its `aria-label`), and a `Tooltip` with the same text (2c). A count shows past 99 as 99+, and the button adds it to its name as shown ("Unread notifications, over 99"): WCAG's label in name |
| `Chip` | interactive (default, selected, with a count); static, at `--control-xs`, with a tone (a card's state, a badge) | Room chips, quick actions, filters, reactions, genre lenses (ADR-0002 §3); "Testnet" and "Sponsored" are uses of the static chip |
| `Tabs` | segmented, with counts, icon-only; none selected | ARIA `tablist`. The views (Earth, Cosmos, List), notifications, the library filter, a world's rooms in the dock |
| `Popover` | anchored; plain or lazy trigger; `wide` (`--popover-wide`, 440 px, for a card of lists) | The native `popover` attribute; outside click and `Esc` close it |
| `Combobox` | mentions, commands, search | A list moved with the arrow keys in a `Popover`, ARIA `combobox`: `@`, `/` and ⌘K |
| `Listbox` | rows of a label and a muted hint; the picked row marked | The words that complete a field, on the floating surface (`Popover`'s): the field keeps the focus and the keys (`aria-controls`, `aria-activedescendant`), a press on a row picks it without taking the focus. The composer's `/`, `@` and `#` suggestions |
| `Tooltip` | | On every icon-only control |
| `Dialog` | standard, wide, sheet; from the start side (the ⌘K palette, the lightbox, the passport) | The native `<dialog>`. An optional `kicker` line above the title (the one label style, read with the description) and `hideClose` where the page draws another way out (Esc still closes). Focus moves to the first field or the title, never to a primary button. Device-only routes (`/passport`, `/saved`) open as dialogs over the current place. A signing block may sit inside one (registering a name, setting up a session); a dialog is never the transaction itself (ADR-0002 §4) |
| `Panel` | docked, floating; the plate (world-tinted, dot grid, fading edge, a vertical caption) | Header (one height), body, footer; the plate and the chat dock are panels |
| `Card` | header, body, actions; tones neutral and signal; dashed; compact; expand | Layout only. Its kinds (message, call, digest, proposal, event, announcement, media, poll, quiz, seal) are assemblies in their features (ADR-0002 §4) |
| `Row` | plain, divided, boxed; current; with a thumbnail, an icon or an avatar | Lists, connected worlds, notifications, search results, agenda entries. The activity slot carries in words what the 3D shows |
| `Field` | text, search, lines, date (the browser's `datetime-local`); a pill shape; label, help, error, prefix | The composer is a rich text box: bold shows as bold, Markdown on the wire. At rest it is one line (add, emoji, mention, send); the formatting tools show when it has focus. A name is typed at body size, never in data mono |
| `Disclosure` | sizes m (44 px) and s (36); a lead, a title, a trail; closed, open | A row that opens in place: a chevron that turns, and the body grown from nothing to its height. The body is always drawn and held shut, so a test reaches it and opening costs no second render. It opens from outside when `open` turns true |
| `Network` | a centre and two lanes of dots, each a realm (a round pill in the world's colour) or a pure package (square-cornered, empty); selected; one lane empty | The graph "Around it" on a realm's plate: what it imports and what imports it, at most 7 dots a lane and the rest a number in the legend; a word is cut where its count begins, and its full name is the dot's label. Drawn from its own width, with no `viewBox` scaling |
| `Switch` | off, on; a description; disabled | A real checkbox with `role="switch"`, its name and description at the left and the switch at the right; on is cream with a dark knob, as chosen elsewhere; the slide follows `--motion-scale`. An on/off setting that takes effect at once (the settings, D450) |
| `Select` | the small control's height; a name for assistive technology | The browser's own list, for a choice among many fixed rows (a country): a phone's picker does better than a list of ours |
| `Avatar` | sizes s, m, l; kind person, assistant, bot; presence; speaking ring | A person's nebula is generated from the address (ADR-0002 §1, §8 row 9): `partsFrom(address)`, then `draw(parts)`; three clouds of colour on night and the address's constellation over them (five stars, one per fifth of the disc so the shape stays open, joined in one of three orders, one bright), the same at every size, readable at 20 px. Never an NFT: the face is computed from the address, which only its key controls (ADR-0001 §11). Where the clouds and stars sit always comes from the address; the palette is chosen in phase 1. A face tells people apart at a glance, never who they are: anyone can try addresses until a face looks like yours, so the name, and the short address where a person matters, identify; my own messages are marked by my name in mint and the word "you", never by the face. The short address shows wherever a person matters (person card, mention list, DM header, signing). An assistant or a bot has its own mark and a word, never mint. Never a planet. No uploaded picture (ADR-0002 §6). Never a badge granted by the platform |
| `PlanetThumb` | world, ecosystem cluster, star, station, signal; dock magnification | Rendered from the same look as the 3D world |
| `Stamp` | a seed, a name, a day, a system; an icon; gold | A visit's mark: a superellipse whose roundness, proportions, tilt, inner dashes and ink hue come from the seed (continuous values), the icon of the world's kind, its name, day and system; gold with a star where charted first. Its family is the world's; a challenge's is `Badge` |
| `Badge` | a name, an icon, a tone; earned or not; a count | A challenge's medal: scalloped, filled in its tone once earned, dashed before, its name on a band across it |
| `Stat` | number, unit, caption; the heat badge; delta | Geist Mono 500, tabular, the "instrument" figures (Alexis, 2026-10-31), that count up on arrival. Under reduced motion, effects become `Stat` counts |
| `ActivityChart` | 24 h bars, a hover tooltip, sparkline | SVG, no chart library; Data graphics, above |
| `Progress` | bar, steps, arc | The flight, a quest, the signing wait, a speaker, the passport's gauge |
| `Kicker` | with a dot; vertical (the plate's atlas caption) | `--font-label` |
| `Flash` | title, line, one action (never cream) | One at a time; the next waits; arrival banners are its variants |
| `EmptyState` | text and one action | Every list has one |
| `Skeleton` | line, card, disc | Only where data takes longer than 300 ms |
| `Logo` | mark, mark and wordmark | The header |
| `Menu` | a trigger of words or an icon; acts, one danger (coral, after a separator), one greyed as coming soon (`soon`, with a `why`) | A list of acts under its trigger, in a `Popover`: the arrows, Home and End move among them, an act closes it first (WAI-ARIA's menu) |
| `NavItem` | current; a lead, a badge, a meta; a link, a button, or coming soon | An item of a column of places, the full chat's rooms and direct messages: a pill that fills cream when it is the one in view |
| `Breadcrumb` | a labelled trail of links ending on the current page | The video's kicker: the one label style, a dot in the world's colour, a chevron between steps |
| `ComingSoon` | a name; an icon, words or both; sizes; or any children | What a later slice brings, greyed and inert, "Coming soon" under the pointer and the focus, said so to a screen reader; it stays focusable and a click does nothing |
| `PagedList` | rows, a filter, sorts | 12 rows a page; the filter (64 characters) and the sorts show past 12 rows, a foot counts and adds 12 up to 100 |
| `Figures` | cells of a label, a value (a count that counts up, or a word), a unit, a line under it, a small line of its last values | The figures band of a world's plate, in one hub card |
| `Sparkline` | tone up (mint), down (coral), flat (muted); from the range or from zero; fills its box; arrives | A small line of how a value moved, its area shaded, for the eye alone: the words beside it say the change (a price's 24 h). Fewer than two values draw nothing |
| `DayChart` | up to 400 days of calls; a log or a linear scale | Bars with an axis at its steps, the peak written over its bar, a dot for a day with none, the tooltip and the keyboard of `ActivityChart`, and every value in a table for assistive technology |
| `Planet` | a name | A planet's stand-in beside a name, the world's colour lit from the upper left, until the scene gives a picture |
| `ChatLayout` | the frame's regions | The full-screen chat's frame: a header, the worlds, the rooms, the conversation and the info panel, each holding its own scroll; the app fills the slots |
| `Room`, `useAlone` | | The element that holds the plate's cards, which one is open and its Escape; a card opens in place by itself without one |
| `LinkProvider` | `pages`, the paths the app routes | Hands every link of the design system the page's own link, for the site's own paths; a link that must `reload` the document stays a plain anchor |

Not built, each when its slice needs it: `Table` and `Checkbox` (the admin console). A message is an assembly of the chat feature
(`app/src/features/chat/Message.tsx`), the ⌘K palette one of the search feature, on `Dialog` and `Combobox`. A presence dot is an `Avatar`
slot, a divider a base `hr`. The flight panel is the flight feature's assembly.

**Rich cards in the chat.** Every interactive structure of a room is one `Card`:
- a header: the type's icon, a kicker, a title and a state (live, ended, won, signed);
- a body of blocks: `Row`, `Progress`, `Stat`, `Grid`, `Field`, media `Card`,
  `Avatar`;
- a footer: actions and a meta line (a count, a clock with its unit).

Jarvis's answer stands out from the people's messages, as in the prototype: a `Card` in the violet
tone (`--color-signal-soft` fill, `--color-signal-line` border), its orb, the word "Assistant" beside
its name, its source in the meta line, and its next steps as at most three chips ("Ask them", "Fly to
Dev help"). A person's message stays a plain row; the composer's placeholder names it ("Message
#general or ask @jarvis").

This covers who's here, catch up, realm and vote, station, quest and expedition, poll, room games
and contest. A new kind is an assembly in its own slice, with its story. The calendar is gone (its
dialog left with D13995: Events is greyed, `ComingSoon`, until a realm gives it events).

The cards of slice 13, all in `app/src/features/`, none in `ui`:
- **The link card** (`chat/LinkCard.tsx`, a chunk of its own, asked by a line that has a card): a media `Card` under the line with the page's
  site, host, title, description and picture, as the server checked them. All its text is React's text, never markup; the picture is
  the server's own copy (`referrerPolicy="no-referrer"`), absent for a reader who saves data; the whole card links to the line's own URL,
  the text link being the keyboard's stop. Its author and the room's moderators have a Remove button.
- **The market card, compact** (`chat/MarketCard.tsx`, from the quick action "Market chart" or `/market [gnot|atone|btc]`): one `Row` a token,
  its symbol, price, 24 h change and a small `Sparkline` (58 by 22), Low and High in the row's `title`, the source in the header; the reader's
  alone, on this device.
- **Jarvis's cards** (`jarvis/AnswerCard.tsx`, `JarvisCard.tsx`, `chat/jarvisEntries.tsx`): a `Card` in the `signal` tone, compact, among the
  lines, with the "AI CONCIERGE" chip and "AI · may be wrong"; the asker's alone, on this device, never sent to the room. A realm's rows
  inline carry Read and Call.
- **The confirm dialog** (`app/src/ConfirmDialog.tsx`): a `Dialog` that asks before something that cannot come back: a title, a description,
  what it costs as children, an outline Cancel and a danger button that names the act; Esc and Cancel say no. Delete a line, moderate a
  line, unlink an account use it.
- **The proposals card** (`chat/ProposalsCard.tsx`, from `/proposals`): a compact `Card` headed "GovDAO", the open proposals first (at most five),
  each a proposal `Row` with its own Vote, which is the call card (never a vote of its own), then the last three with their status, and a
  button to the realm. Words, not blanks, when the proposals are being read, could not be read or none is open.
- **The trending card** (`chat/TrendingCard.tsx`, from `/trending`): a compact `Card`, the most called worlds of the last 7 days as an ordered
  list of plain `Row`s (the rank as the lead, the owner as the subtitle, the calls as the trail), a line saying what it is ranked by. Only the
  default universe is ranked, and the card says so in another.
- **The welcome card** (`features/welcome/Welcome.tsx`): a compact `Card` over space on a first visit, a kicker, a title, a line, a solid
  "Get started" (or "Connect Adena" where Adena is in the page) and an outline "Say hi"; any use or `Esc` closes it for good, and closed it stays
  drawn, inert and faded, so that it leaves as it came.
- **Get started** (`features/login/GetStarted.tsx`): a `Dialog` a Connect without Adena opens: four numbered steps, a `Disclosure` for what is
  only further reading, a solid Connect that appears once the page sees Adena (no reload) and a "Continue as a guest". Its links open in a new tab.
- **The error system** (`features/errors/`): one `ErrorView` in three sizes. `page` and `place` (inside a plate) show a title, one line, a solid
  primary way on chosen by the kind of failure and outline ways to the Earth and the Galaxy; `inline` is an `EmptyState` of look `failed`, one line
  with its retry, for a card or a panel that failed alone. `errorKind` sorts a failure into one of eight kinds (not found, gone, forbidden, too many,
  offline, unavailable, new version, crash) and `RouteError` is every route's one boundary: a reference to quote after a crash, the message and
  stack in development only. A new screen that reads something shows a failed read through `ErrorView`, never a message of its own.
- **The passport** (`features/passport/PassportView.tsx`): a wide `Dialog` headed by the account's name, a `Badge` as its lead, a row of `Stat`s
  (the stamps with a thin `Progress` against the worlds listed, the systems, the worlds charted first, the challenge steps) beside `Tabs` for
  Challenges, Stamps and Charted; each stamp is a `Stamp`, a card's lazy parts sit behind `Skeleton`s. It reads this device alone.
- **The call detail** (`chat/CallDetail.tsx`, the panel a chain line opens): a plain `Row` (function, realm, Succeeded or Failed), the error, the
  block and time, the gas and fee, then "Arguments" and "Events" as `Kicker`-headed lists, every text cut and drawn as text, never a link or
  markup; a `Skeleton` while it is read and an inline `ErrorView` if it fails.
- **The person card** (`chat/PersonCard.tsx`, `PersonBlocks.tsx`): a `Popover` on a name, the `Avatar`, the short address, the country, Message
  and Follow; for an account the blocks come from the server: the balance, "Their system" and "Tokens" as plain `Row`s, "Calls to worlds" as
  `Figures` over an `ActivityChart` of 30 days, and "Latest calls". A block with nothing is absent, never a zero.
- **The network line** (`features/home/NetworkLine.tsx`): one line under the hero's count, the chain's transactions and accounts today and a
  `Sparkline` of the last 14 days; a chain whose last block is old says so instead, and no answer draws nothing.
- **The realm's explanation** (`features/explain/Explained.tsx`): under a realm's or a world's title, two plain sentences in `Panel.Lede`, marked
  with the `spark` icon and "Jarvis · from its code"; a two-line `Skeleton` (`aria-busy`) while it is made, and the page's own first line when there
  is none. It is text, never markup, and never speaks as gnoworld.

The rule a new screen of these follows: it is a compact `Card`, a `Dialog` or a `Popover` of the design system's parts and tokens alone, a
block with nothing is absent, a read in progress is a `Skeleton` or one line of words, a failed read is an `ErrorView`, and what the chain,
a person or Jarvis wrote is drawn as text with its source.

### Icons

- One set of 61: close, plus, arrow, arrow-up-right, chevron, hash, search, chat, search-messages (a magnifier in a speech bubble: the chat's own search, slice 13), thread, reply, bell,
  passport, seal, expand, shrink, image, bookmark, smile, code, code-block, list-bulleted,
  list-numbered, quote, pause, play, pin, more, pencil, link, comet, at, mail, check, calendar,
  video (a video call, coming soon, D13995),
  spark, retry (a failed read tried again, slice 13), news, satellite, planet, orbits, map (space seen from above, D433), bold, italic, underline, strikethrough, slash, caret,
  share, menu, people, star, chart, info, warning, alert, lock, shield, key, sliders (the settings, slice 8). A new icon joins the
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
| Header | Top, 34 px from the edge, the same on every view | Controls at `--control-m` (44); the logged-in account's pill is the frames' 40 (f0031). Logo left; the views (Earth, Cosmos, List), the network (the universe switcher, "Testnet" on a testnet) and search centre; Jarvis, chat, passport, bell, account right. The account button opens the menu (passport, saved, settings, help, log out); on a phone, a menu button holds it with the navigation (ADR-0002 §1, menu and settings). When narrow, labels drop before icons; the network and the account never drop. Its pills have a backdrop that keeps them readable over any planet |
| Top centre | Under the header, centred in the scene's free area (between the plate and the dock) | One slot: the flight panel, the expedition pill, the flash |
| Hero | Bottom left of the cosmos, 48 px from the left and 32 from the bottom | The kicker, the number in mono with its line at the right (the network line: the chain's day, `features/home/NetworkLine.tsx`), two actions, and the tags that light space (`app/src/Lenses.tsx`); the scene keeps it clear (a safe area) |
| Rail | Right of the cosmos | Planets at 64 px, magnified like a dock; names on two lines; as tall as its worlds; labels keep out of it |
| Plate | Left of a world's frame | 808 px with its fade (`--plate-w`); its background fades into space over its last 64 px, with no border, so the planet keeps the frame's free area; the dot grid and the vertical atlas caption; a scroll cue when its content is cut |
| Chat dock | Right | 420 px, 380 px under 1400 px (D419), on the surface colour; messages anchored at the bottom; full screen on demand: a column of worlds, a room sidebar (rooms, Media, Saved, DMs), the conversation, and an info panel (Here now, pins) |
| Credits | A fixed corner, wherever textures show, on phones too | One 11 px "Credits" link in the muted grey, opening the full attributions (CC BY 4.0 §3(a)(2) allows a link) |

Search is a ⌘K palette (a wide `Dialog` with a `Combobox`), not a drawer.

Breakpoints:
- 900 px: phone layout, chat first (ADR-0002 §8, row 10). The chat is full screen; places
  are a list with planet thumbnails; "View in space" loads the 3D on request, and then the
  plate goes below the planet. The Earth alone keeps its chat a block of the page under the
  globe, up to the dock's 1280 px: a full chat would cover the globe, "View in space" and the
  Credits.
- 1200 px: the dock opens by itself on a world.
- 1400 px: the dock's width.

**When space runs short,** things drop in this order, never overlapping:
- a world's focus view (for example 1280 px with the plate and the dock): the flight
  panel's details, comets, auroras, small storms, moon labels (the moons stay), the rings'
  detail. The planet, its heat and its status ring never drop;
- the cosmos: the rail shortens to twelve worlds.
  The hero's number and its two actions never drop.

Components use container queries, so they fit wherever they are placed.

## CSS rules

- **The method is CUBE CSS** (composition, utility, block, exception) on CSS Modules, in
  cascade layers declared once: `@layer reset, tokens, base, compositions, components,
  utilities;`.
  - **Base** styles the elements globally first (type, links, focus, `hr`, rich text: code,
    quote, mention, underline), so components write little. An underline's line is the muted
    grey, a step under the words; a link's is the words' own colour, at the font's place.
    `::selection` waits for Baseline.
  - **Compositions** are the layout primitives, `Stack`, `Cluster`, `Grid`, `Sidebar`,
    `Switcher`, `Center`: intrinsic layouts that place things without styling them, each taking
    a space step (Center's is its gutter). All layout is one of them, never new CSS.
  - **Blocks** are the components, one CSS Module each, so class names never leak: no prefix,
    as the module renames each class with a hash; the utilities keep their plain names.
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
  - colours, sizes, radii, durations and shadows are tokens, and a bare `z-index` needs a `/* raw: why */` comment;
  - a raw value needs a comment saying why.
- **Logical properties** (`margin-inline`, `inset-block`), so the layout can follow the
  writing direction.
- **Direction** is read from `[dir="rtl"]`, not `:dir()`: the build's minifier turns `:dir()` into a
  list of languages, which a page set right to left by `dir` alone does not match.
- **Focus:** one ring everywhere, `:focus-visible` with a 2 px mint outline and an offset;
  fields included. Nothing hides focus.
- **Motion:** `transition` names its properties, never `all`. Prefer animating
  `transform` and `opacity`.
- **Stacking:** no `backdrop-filter`: a bubble is near-opaque (`--color-bubble`) until the blur is widely Baseline.
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
