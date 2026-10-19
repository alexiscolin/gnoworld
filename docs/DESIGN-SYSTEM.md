# Design system

The look and the rules every screen follows. Values come from the approved prototype
(`docs/prototype`), reduced by the coherence review of 2026-10-19 (`docs/design/coherence.md`):
every CSS rule, script style, icon, screen and second of the recorded tour mapped to one token and
one component, its 38 decisions approved by Alexis. The changes that show are approved again on
the before/after designs of slice 2a; nothing in the style changes without his approval.

## Principles

These are the lead's and Alexis's rules from the prototype reviews.

- **Space first.**
  - The 3D carries the page; panels are light and few.
  - No dashboard feeling.
  - Air everywhere.
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
| Primitives | `app/src/ui/tokens/primitives.css` | The nine base colours, the 4 px steps, the type sizes, the durations | Semantic tokens only: a component that reads one fails the lint |
| Semantic | `app/src/ui/tokens/semantic.css` | The roles below, each made only of primitives | Components and compositions |
| Private | Inside a component's module, named `--_*` | What a variant or a context sets (`--_h`, `--_tone`) | That module only |

- Names say a role or a step, never a value (`--space-m`, not `--space-16`): a value can change
  without a rename.
- Shades are computed, not copied: `--color-action-soft: color-mix(in oklab, var(--color-action)
  12%, transparent)`. One source per colour.
- The token files are the only list: Storybook reads its token page from them, and this document
  states the rules.

### Colour

The theme is dark only (`color-scheme: dark`). Nine base colours:

| Primitive | Value | Role |
|---|---|---|
| space | `#05070D` | The page behind the scene; the one ink on every light fill |
| night | `#0B0F18` | Surfaces: popovers, dialogs, cards on panels |
| text | `#F4F6FA` | Text; the base of the translucent fills |
| muted | `#9DA8BC` | The one secondary grey |
| cream | `#F2EFEA` | The primary button; what is selected |
| mint | `#5CF2C8` | The single accent: live, unread, focus, success, what is mine |
| amber | `#FFC46B` | Heat, the sun, live moments, what is about me |
| violet | `#B79CFF` | Uncharted signals |
| coral | `#FF8A7A` | Errors and a falling trend only |

Semantic roles, all computed from them:

| Role | Made of | Use |
|---|---|---|
| `--color-fill`, `--color-fill-hover` | text at 5% and 10% | The resting fill of fields, chips and cards; hover |
| `--color-line`, `--color-line-strong` | text at 10% and 20% | Borders and dividers; secondary buttons, hover |
| `--color-panel`, `--color-glass` | night at 86% and 60% | Docked panels; what floats over the scene |
| `--color-scrim` | space at 70% | Behind a dialog |
| `--color-<accent>-soft`, `--color-<accent>-line` | the accent at 12% and 50% | Tinted fills and borders of mint, amber, violet, coral |
| `--world` | a world's own colour, set from its data | A surface over a world is `color-mix(in oklab, var(--world) 12%, var(--color-panel))` |

**Three meanings, three colours, never colour alone:**
- selected (navigation, a choice): the cream fill;
- mine (my vote, my reaction, my name): mint;
- about me (a mention of me): amber.

Each one comes with an icon or a word as well.

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
| `--font-title-s` | 20 px | Geist 400 | Small headers (notifications) |
| `--font-title-m` | 28 px, -0.03em | Geist 300 | Panel and dialog titles, room names, big facts |
| `--font-title-l` | 36 px, -0.03em | Geist 300 | Dialogs that tell a story (passport) |
| `--font-display` | `clamp(4.5rem, 8vw, 7rem)`, -0.04em, leading 0.9 | Geist 600 | A world's name on its plate |
| `--font-hero` | `clamp(5.5rem, 11vw, 11rem)`, -0.06em, leading 0.9 | Geist Mono 400, tabular | The hero number |

- Each role is a composite token (`font: var(--font-body)`). The label's tracking and caps are a
  utility that components compose once.
- 11 px is the floor; nothing is smaller.
- Two families, Geist and Geist Mono, self-hosted with `font-display: swap` and preloaded for the
  first screen. The first paint is measured for layout shift.
- Sizes are in rem so the reader's zoom works; numbers that change are tabular.
- Weights: 300, 400, 500, 600. Leading: 0.9, 1, 1.4, 1.5.

### Space, size and shape

| Token | Values |
|---|---|
| `--space-3xs` … `--space-2xl` | 4, 8, 12, 16, 24, 32, 48, 64 px, a 4 px grid; section space is fluid with `clamp()` |
| `--control-xs` / `--control-s` / `--control-m` / `--control-l` | 24 / 32 / 40 / 56 px: badges and reactions / toolbars, chips, tabs / default / the main action. Under `pointer: coarse`, `--control-m` is 44 |
| `--radius-s` / `--radius-m` / `--radius-l` / `--radius-pill` | 8 / 12 / 24 / 999 px: small controls, rows, menus / cards, fields, popovers, bubbles / panels, dialogs / buttons, chips, tabs |
| `--icon-m` / `--icon-l` | 16 / 20 px |
| `--avatar-s` / `-m` / `-l` | 20 / 24 / 48 px |
| `--thumb-*` | 16, 24, 32, 48, 64 px |
| Layout | header clearance 96, dock 360 (320 under 1400), plate 620, rail 120, dialog 460 and wide 760, popover 300 px |

- Controls are a minimum height with padding, never a fixed height, so text zoomed to 200% grows
  the control instead of spilling out.
- A target is at least 24 px with a pointer and 44 px by touch (WCAG 2.2).
- Interface text and controls do not scale with the window; section space and titles do.

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

Dialogs use the native `<dialog>` and the browser's top layer. The flash is never under a
dialog's scrim: it shows above it, or waits until the dialog closes.

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

Under `prefers-reduced-motion: reduce`:
- flights become crossfades of `--motion-base`;
- figures appear at their value;
- nothing bounces or loops;
- the dock magnification is off.

The scene keeps its own speeds.

## Browsers

Baseline "widely available", with two named exceptions from 2024: the `popover` attribute and
`@starting-style`. The lint holds the line and lists the exceptions. Popovers are positioned by a
small function of ours until CSS anchor positioning (Baseline 2026) is widely available.

## Testing the CSS

Storybook, plus the journeys; no extra service.
- **Lint and types,** in the fast gate: `@eslint/css`, `check_css.py`, typed modules (`tsc`),
  jscpd.
- **Pictures:** every story, at three container widths and with reduced motion, screenshotted
  by Playwright and compared with the approved images (the browser and its platform: slice 2's
  plan). A new baseline is its own commit, which Alexis reviews; changing or deleting an
  approved one fails the push unless the commit says why (`Updated-baseline:`,
  `scripts/check_regressions.py`).
- **Invariants,** measured in the browser on every story and the journeys:
  - nothing overlaps: the point at the centre of each control hits that control;
  - every target is at least 24 px with a pointer and 44 px by touch;
  - `:focus-visible` draws its ring;
  - no horizontal scroll from 320 px wide; text still fits at 200% zoom;
  - forced colours keep every control visible; reduced motion stops transitions;
  - axe passes, contrast included.
- **Stories that stress:**
  - a text 40% longer and a 40-character name;
  - every state of the coherence review that the prototype lacked: sending, failed, typing,
    empty, loading, broken media, too late, no selection.
- **Budgets:** the CSS's size in the build budget, and layout shift at first paint.

## Components

They live in `app/src/ui`, each a component with its CSS Module, documented by its props.

**How they compose:**
- **Named parts.** Card.Header, Card.Body and Card.Actions; Row's lead, title, subtitle,
  activity and trail; Field's label, help, error and prefix.
- **Closed variants.** `size`, `tone` (neutral, action, warm, danger, signal), `emphasis`
  (solid, outline, quiet) and `density` are TypeScript unions, and each value only sets private
  properties.
- **No outside styling.** No component accepts `className` or `style`: TypeScript refuses them.
- **Context cascades.** `data-tone` and `data-density` on a container, and the surface level (a
  card on a panel is one step lighter), reach everything inside.

**Where they live:**
- **A component exists once two places use it;** otherwise it is a variant.
- **Storybook shows everything.** One page shows every token. Another shows every component at
  once. Then come each component's matrix (size × tone × emphasis × state) and the real
  assemblies.

| Component | Variants and states | Notes |
|---|---|---|
| `Button` | primary, secondary, text; sizes s, m, l; with an icon; disabled; busy | A primary is filled with cream. Never two primaries side by side |
| `IconButton` | sizes s, m; pressed | Always an `aria-label`, and a `Tooltip` with the same text |
| `Chip` | interactive (default, selected, with a count); static (tones, as badges and tags); the "Testnet" and "Sponsored" badges | Room chips, quick actions, filters, reactions, genre lenses (ADR-0002 §3) |
| `Tabs` | segmented, with counts, icon-only; none selected | ARIA `tablist`. The views (Earth, Universe, List), notifications, the library filter |
| `ChoiceGroup` | segmented, list | ARIA `radiogroup`: the days to rent, a poll's answers |
| `Popover` | anchored; menu; listbox | The native `popover` attribute; outside click and `Esc` close it |
| `Combobox` | mentions, commands, search | A list moved with the arrow keys in a `Popover`, ARIA `combobox`: `@`, `/` and ⌘K |
| `Tooltip` | | On every icon-only control |
| `Toolbar` | | ARIA `toolbar` with roving focus: a message's actions, formatting, the composer's tools |
| `Dialog` | standard, wide (the ⌘K palette, the lightbox, the passport) | The native `<dialog>`. Focus moves to the first field or the title, never to a primary button. Device-only routes (`/passport`, `/saved`) open as dialogs over the current place. Not for transactions (ADR-0002 §4) |
| `Panel` | docked, floating; world-tinted | Header, body, footer; the plate and the chat dock are panels |
| `Card` | message, call (preview → sign → waiting → landing → result; refused, failed, too late), realm digest, proposal, event, announcement, media; tones; dashed | Call cards and digests follow ADR-0002 §4 |
| `Row` | plain, divided, boxed; current; with a thumbnail, an icon or an avatar | Lists, connected worlds, notifications, search results, agenda entries. The activity slot carries in words what the 3D shows |
| `Field` | text, search, composer, date (the browser's `datetime-local`); label, help, error, prefix | The composer is a rich text box: bold shows as bold, Markdown on the wire |
| `Avatar` | sizes s, m, l; presence; speaking ring | An astronaut generated from the name (ADR-0002 §1, §8 row 9): a stylized, futuristic suit and helmet, few details, readable at 20 px. Phase 1: its parts chosen by the person. Never a planet. No uploaded picture (ADR-0002 §6). Never a "verified" badge |
| `PlanetThumb` | world, ecosystem cluster, star, station, signal; dock magnification | Rendered from the same look as the 3D world |
| `Stat` | number, unit, caption; the heat badge; delta | Tabular numbers that count up on arrival. Under reduced motion, effects become `Stat` counts |
| `ActivityChart` | 24 h bars, a hover tooltip, sparkline | SVG, no chart library |
| `Progress` | bar, steps, spinner, wave, arc | The flight, a quest, the signing wait, a speaker, the passport's gauge |
| `Kicker` | with a dot | `--font-label` |
| `Flash` | title, line, one action | One at a time; the next waits; arrival banners are its variants |
| `FlightPanel` | in transit, course plotted, entering orbit | Target, distance, speed, arrival and a progress bar, in tabular numbers (ADR-0002 §1) |
| `EmptyState` | text and one action | Every list has one |
| `Skeleton` | line, card | Only where data takes longer than 300 ms |
| `Logo` | mark, mark and wordmark | The header and the loader |

Later, each in its slice: `Message` (4, on Card), `Breadcrumb` and the ⌘K palette (5, on
Dialog), the scene `Label` (7). Menu is a `Popover`, a badge a static `Chip`, a presence dot an
`Avatar` slot, a divider a base `hr`.

**Rich cards in the chat.** Every interactive structure of a room is one `Card`:
- a header: the type's icon, a kicker, a title and a state (live, ended, won, signed);
- a body of blocks: `Row`, `ChoiceGroup`, `Progress`, `Stat`, `Grid`, `Field`, media `Card`,
  `Avatar`;
- a footer: actions and a meta line ("42 of 551", a clock).

This covers the calendar (an agenda of `Row`s by day, no calendar widget), who's here, catch up,
realm and vote, station, quest and expedition, poll, room games and contest. A new kind is an
assembly in its own slice, with its story.

### Icons

- One set of 44: close, plus, arrow, arrow-up-right, chevron, search, chat, thread, reply, bell,
  passport, seal, expand, shrink, image, bookmark, smile, code, code-block, list-bulleted,
  list-numbered, quote, pause, play, pin, more, pencil, link, comet, at, mail, check, calendar,
  spark, news, satellite, planet, cluster, bold, italic, underline, strikethrough, slash, caret.
- A 16 px grid, a 1.5 px stroke, round caps and joins, `currentColor`.
- Each icon is a component that renders inline SVG with `aria-hidden="true"`. Its button
  carries the label.
- No emoji, no typed arrows or glyphs (→ ↑ ✓ ▲ ‹) in the interface.

## Layout

| Region | Place | Size |
|---|---|---|
| Header | Top, 34 px from the edge | Controls at `--control-m` (44 by touch). Logo left; the views (Earth, Universe, List) and search centre; Jarvis, chat, passport, bell, account right. The account button opens the menu (passport, saved, settings, help, log out); on a phone, a menu button holds it with the navigation (ADR-0002 §1, menu and settings). Its pills have a backdrop that keeps them readable over any planet |
| Top centre | Under the header | One slot: the flight panel, the expedition pill, the flash |
| Hero | Bottom left of the cosmos | The number, one line of text, two big actions, the markets row |
| Rail | Right of the cosmos | Planets at 64 px, magnified like a dock; names on two lines |
| Plate | Left of a world's frame | Content column up to 620 px; its right edge melts into space behind the planet; a scroll cue when its content is cut |
| Chat dock | Right | 360 px, 320 px under 1400 px; full screen on demand: a column of worlds, a room sidebar (rooms, Media, Saved, DMs), the conversation, and an info panel (Here now, pins) |
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
  - **Base** styles the elements globally first (type, links, focus, `::selection`, `hr`, rich
    text: code, quote, mention), so components write little.
  - **Compositions** are the layout primitives, `Stack`, `Cluster`, `Grid`, `Sidebar`,
    `Switcher`, `Center`: intrinsic layouts that place things without styling them, each taking
    a space step. All layout is one of them, never new CSS.
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
    - a primitive read outside the token files;
    - a private property read outside its module;
  - **compositions, not blocks, do layout:** `check_css.py` refuses `display: flex` or
    `grid`, `gap`, the `flex-*`, `grid-*`, `justify-*` and `align-*` properties, and any
    outer `margin`, in a block's module. A block that truly needs one (an icon beside a
    label) says why in a `/* layout: … */` comment, and the gate prints the count of those
    exceptions so review sees it grow;
  - **no copied rules:** the same set of three or more declarations in two modules fails
    `check_css.py`; it becomes a composition, a utility or a `composes`;
  - modules are typed (`vite-css-modules`, `generateSourceTypes`, named exports), so a class
    used in a component but missing from its CSS fails `tsc`;
  - a copied block of CSS fails jscpd.
- **DRY by composition:** a pattern used twice becomes a component in `ui` (the layout
  primitives first), or a shared class reached with CSS Modules' `composes`; never a copy.
  Native CSS only: nesting, `@layer`, container queries, logical properties, `color-mix()`;
  no preprocessor, no utility framework.

## Not rebuilt

These are kept out on purpose (`docs/design/coherence.md`, "Not to rebuild"):
- **The prototype's dead UI:** the side card, the old Jarvis panel, the toast, the top and
  bottom bars, the evolutions board, the range slider, avatar upload.
- **Its bugs**, each with a test that holds it once the component exists.
