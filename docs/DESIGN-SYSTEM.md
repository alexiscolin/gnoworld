# Design system

The look and the rules every screen follows. Values come from the approved prototype
(`docs/prototype`), reduced to a short scale: it used 20 font sizes, 11 control heights and
82 `!important`. Slice 2 of the backlog (ADR-0001 §7, "our own look") refines them with
designs before code; until then this is the reference.

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
  - Long lists scale: forty rooms still fit.
- **Smooth.**
  - Things appear at the right time and place, with a transition.
  - Hovered items follow the pointer at once and ease back on leave.
- **Accessible.**
  - Every place is reachable without the 3D.
  - Visible focus; reduced motion respected.

## Tokens

Tokens live in `app/src/ui/tokens.css` as custom properties, in the `tokens` layer.
Components read tokens and never raw values.

### Colour

The theme is dark only (`color-scheme: dark`).

| Token | Value | Use |
|---|---|---|
| `--color-space` | `#05070D` | The page behind the scene |
| `--color-surface` | `rgba(11, 15, 24, 0.86)` | Docked panels; a world's plate tints it with the world's colour at 10–14% |
| `--color-surface-raised` | `#0B0F18` | Popovers, dialogs, cards on panels |
| `--color-line` | `rgba(255, 255, 255, 0.10)` | Borders, dividers |
| `--color-line-strong` | `rgba(255, 255, 255, 0.20)` | Secondary button borders, hover |
| `--color-text` | `#F4F6FA` | Text |
| `--color-text-muted` | `#9DA8BC` | Secondary text. It replaces the prototype's two greys |
| `--color-primary` / `--color-primary-ink` | `#F2EFEA` / `#15161A` | The primary button, selected tabs |
| `--color-action` / `--color-action-ink` | `#5CF2C8` / `#04201A` | The single accent: live, unread dots and counts, focus ring, success |
| `--color-warm` | `#FFC46B` | Heat, the sun, moments that are live |
| `--color-signal` | `#B79CFF` | Uncharted signals |
| `--color-danger` | `#FF8A7A` | Errors and a falling trend only |

Every text pair holds at least 4.5:1. Measured on 2026-10-16, on the space background
unless noted:

| Pair | Ratio |
|---|---|
| Text | 18.6:1 |
| Muted text | 8.4:1 on space; 8.0:1 on raised surfaces; 6.8:1 on `#1A2030` |
| Primary ink on primary | 15.8:1 |
| Action ink on action | 12.2:1 |
| Action | 14.4:1 |
| Warm | 12.8:1 |
| Signal | 8.8:1 |
| Danger | 8.8:1 |

The gate checks contrast with axe.

### Type

| Token | Size | Family, weight | Use |
|---|---|---|---|
| `--text-label` | 0.6875rem (11 px), caps, `letter-spacing: 0.14em` | Geist Mono 500 | Kickers, captions, counts |
| `--text-meta` | 0.75rem (12 px) | Geist 400 | Timestamps, secondary lines |
| `--text-ui` | 0.8125rem (13 px) | Geist 500 | Controls, chips, tabs |
| `--text-body` | 0.875rem (14 px), line height 1.5 | Geist 400 | Messages, panels |
| `--text-lead` | 1rem (16 px), line height 1.55 | Geist 400 | A world's description |
| `--text-title-s` | 1.25rem (20 px) | Geist 400 | Panel and dialog titles |
| `--text-title-m` | 1.75rem (28 px), `letter-spacing: -0.03em` | Geist 300 | Room names, big facts |
| `--text-title-l` | 2.25rem (36 px), `letter-spacing: -0.03em` | Geist 300 | Dialogs that tell a story (passport) |
| `--text-display` | `clamp(4.5rem, 8vw, 7rem)`, `letter-spacing: -0.04em` | Geist 600 | A world's name on its plate |
| `--text-hero` | `clamp(5.5rem, 11vw, 11rem)` | Geist Mono 400, tabular | The hero number |

- Two families: Geist and Geist Mono, self-hosted with `font-display: swap` and preloaded
  for the first screen.
- Sizes are in rem so the reader's zoom works.
- Numbers that change use `font-variant-numeric: tabular-nums`.

### Space, size and shape

| Token | Values |
|---|---|
| `--space-*` | 4, 8, 12, 16, 24, 32, 48, 64 px (a 4 px grid) |
| `--control-s` / `--control-m` / `--control-l` / `--control-xl` | 32 / 40 / 44 / 56 px: toolbars and chips / default / primary and touch / the hero's and a plate's main action |
| `--radius-s` / `--radius-m` / `--radius-l` / `--radius-xl` / `--radius-pill` | 8 / 12 / 16 / 24 / 999 px: inner controls / cards and popovers / inputs and the composer / panels and the dock / buttons and chips |
| `--hit-min` | 24 px: the smallest target (WCAG 2.2). Touch targets are 44 px |

### Layers

| Token | Layer |
|---|---|
| `--z-scene` | The canvas |
| `--z-labels` | Labels and bubbles anchored to the scene |
| `--z-chrome` | Header, hero, rail, ticker |
| `--z-dock` | The chat dock, the plate |
| `--z-popover` | Popovers, menus |
| `--z-toast` | The flash note: one at a time, queued |

Dialogs use the native `<dialog>` and the browser's top layer, so they need no z-index.

### Motion

| Token | Value | Use |
|---|---|---|
| `--motion-fast` | 120 ms | Hover, press, a popover's fade |
| `--motion-base` | 200 ms | Panels, tabs, chips |
| `--motion-slow` | 400 ms | The dock sliding, the library view |
| `--motion-scene` | 1.3–3.2 s, by distance | Flights (the scene, not CSS) |
| `--ease-standard` | `cubic-bezier(0.2, 0.7, 0.1, 1)` | Entering, moving |
| `--ease-emphasized` | `cubic-bezier(0.7, 0, 0.2, 1)` | The loader's iris, big reveals |

Under `prefers-reduced-motion: reduce`:
- flights become crossfades of `--motion-base`;
- nothing bounces or loops;
- the dock magnification is off.

## Components

They live in `app/src/ui`, each a component with its CSS Module, documented by its props.
Features compose them and never restyle them from outside. A missing variant is added to
the component.

| Component | Variants and states | Notes |
|---|---|---|
| `Button` | primary, secondary, text; sizes m, l, xl; with an icon; disabled; busy | A primary is filled with `--color-primary`. Never two primaries side by side |
| `IconButton` | sizes s, m; pressed | Always an `aria-label`. The tooltip shows the same text |
| `Chip` | default, selected, with a count | Room chips, quick actions, filters |
| `Tabs` | segmented, with counts | ARIA `tablist`. Notifications, the library filter, the rail |
| `Popover` | anchored, with arrow keys inside | The native `popover` attribute where it fits; outside click and `Esc` close it |
| `Dialog` | standard, wide | The native `<dialog>`. Focus moves to the first field or the title, never to a primary button. Device-only routes (`/passport`, `/saved`) open as dialogs over the current place. Not for transactions (ADR-0002 §3) |
| `Card` | message card, call card (preview → sign → landing → result), proposal, event | Call cards follow ADR-0002 §3 |
| `Row` | with a planet thumbnail, a title, a subtitle, a trailing action | Lists, connected worlds, notifications |
| `Field` | text, search; the composer | The composer is a rich text box: bold shows as bold, Markdown on the wire |
| `Avatar` | sizes 20, 24, 48 | An identicon generated from the name (ADR-0001 §10). An uploaded picture only if the media service is decided (ADR-0002 §1). Never a "verified" badge |
| `PlanetThumb` | world, ecosystem cluster, star, station, signal; dock magnification | Rendered from the same look as the 3D world |
| `Stat` | number, unit, caption | Tabular numbers |
| `ActivityChart` | 24 h bars, a hover tooltip | SVG, no chart library |
| `Kicker` | with a dot | `--text-label` |
| `Flash` | title, line, one action | One at a time; the next waits |
| `EmptyState` | text and one action | Every list has one |
| `Skeleton` | line, card | Only where data takes longer than 300 ms |

### Icons

- One set: a 16 px grid, a 1.5 px stroke, round caps and joins, `currentColor`.
- Each icon is a component that renders inline SVG with `aria-hidden="true"`. Its button
  carries the label.
- No emoji, no typed arrows (→ ↑ ✓) in the interface.

## Layout

| Region | Place | Size |
|---|---|---|
| Header | Top, 34 px from the edge | Controls at `--control-l`. Logo left; Universe and List and search centre; Jarvis, chat, passport, bell, account right |
| Hero | Bottom left of the cosmos | The number, one line of text, two big actions, the markets row |
| Rail | Right of the cosmos | Planets at 64 px, magnified like a dock; names on two lines |
| Plate | Left of a world's frame | Content column up to 620 px; its right edge melts into space behind the planet |
| Chat dock | Right | 360 px, 320 px under 1400 px; full screen on demand |
| Ticker | Bottom | 34 px, pausable |

Breakpoints:
- 900 px: phone layout. The plate goes below the planet, and the chat becomes a sheet.
- 1200 px: the dock opens by itself on a world.
- 1400 px: the dock's width.

Components use container queries, so they fit wherever they are placed.

## CSS rules

- **Cascade layers**, declared once: `@layer reset, tokens, base, components, utilities;`.
  - The reset and the base style elements.
  - Components are CSS Modules, so class names never leak.
- **No `!important`, no ID selectors, no styling from outside a component.** The CSS
  linter enforces it.
- **Values come from tokens:**
  - colours, sizes, radii, durations and z-index are tokens;
  - a raw value needs a comment saying why.
- **Logical properties** (`margin-inline`, `inset-block`), so the layout can follow the
  writing direction.
- **Focus:** `:focus-visible` gets a 2 px `--color-action` ring with an offset. Nothing
  hides focus.
- **Motion:** `transition` names its properties, never `all`. Prefer animating
  `transform` and `opacity`.
- **Stacking:** a `backdrop-filter` blur only on surfaces over the scene, and only one deep.
- **No dead CSS:**
  - a module's unused class fails the lint;
  - a token nothing uses is removed.
