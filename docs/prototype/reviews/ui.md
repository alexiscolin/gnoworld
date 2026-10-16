# gnoworld: visual craft review (UI, motion, overlap, rhythm)

**Note on method.** The brief's 390 px recipe does not give a 390 px layout. Headless Chrome will not make a window narrower than 500 px, so `--window-size=390,844` lays the page out at 500×701 and then crops the picture to 390. Every earlier "mobile" shot was really a 500 px layout. Real 390 shots need CDP emulation; `scratchpad/review-ui/cdp.mjs` does this, and it can also take frames with reduced motion turned off. All evidence below is in `scratchpad/review-ui/`. Line numbers are approximate because `app.js` is changing; the function names are the reliable anchors.

**What works.** The focus composition is strong: big type on the plate, a big planet floating over its edge, and the chat docked in the same frame. The palette stays calm with one accent colour. The plate's entrance (0.7 s `power3.out`, 50 ms stagger, count-ups) has the right weight, and reduced motion is handled everywhere.

---

### 1. Three notes share one slot and land on the plate's top edge (S)
- **Where:** the flight panel (`#flight`, `.center`, top 102 px), the stamp note (`#flash`, top 96 px) and the first-visit toast (`#toast`, `.center`) all sit in the same place.
- **What happens:** the plate appears at 68 % of the flight (`onNear`), but the flight panel only hides 700 ms after arrival (`app.js` frame loop, `if (t >= 1) … setTimeout(… $('flight').hidden = true, 700)`). For about 1.5 s, "IN TRANSIT · BUBBLE 0.56 AU" sits over the plate title (`fly-5600.png`). Then "Stamped · BUBBLE" stacks on top of "ENTERING ORBIT" (`hop-13300.png`). After that the stamp note sits across the frame line at y 98 for 5 s (Moon, AI Ring). On a first discovery, all three notes can show at once.
- **Why it matters:** this is the "dashboard panel" feel the product lead rejects, at the exact moment of arrival.
- **Fix:**
  - In `flyTo`'s `onNear` path (`go()`), call `G.to('#flight', { opacity: 0, duration: .25, onComplete: () => { $('flight').hidden = true; $('flight').style.opacity = ''; } })`.
  - In focus view, anchor the stamp note in the free space above the planet: `body[data-view="focus"] #flash { left: min(600px, 41vw); right: 384px; top: 122px; }`.
  - Make `toast(b)` call `flash('You discovered …', …)` and delete `#toast`.

### 2. Hopping between worlds tears the scene down and builds it again; Connected worlds pops in (S + M)
- **Where:** `go()` always calls `exitFocus()`, and `exitFocus` sets `data-chat=''` and `data-view=''`.
- **What happens:** going from BUBBLE to Adena fades out the plate and frame and slides the chat out. The universe rail, ticker and labels come back mid-flight, then everything is rebuilt (`hopsheet.jpg`).
- **Second problem:** `#fConn` and `#fStation` are missing from the stagger selector in `enterFocus` (`'#fLeft > .kicker, #fText, …, #fTalk'`, about line 1741). "CONNECTED WORLDS" therefore appears at full opacity on bare space before the rest of the plate (`hop-12400.png`).
- **Fix (S):** add `#fConn, #fStation` to that selector.
- **Fix (M):** in `go(b)`, when `state.view === 'focus' && focusable(b)`, skip `exitFocus()`. Keep `data-view` and `data-chat` as they are, fade only `#fLeft` (`G.to('#fLeft', { opacity: 0, duration: .25 })`), and let `enterFocus` stagger it back in. The chat then crossfades rooms instead of leaving and coming back.

### 3. The status ring and the floating messages run over the plate text (S–M)
- **Where:** the planet is placed with `left = textRight - 40` (frame loop, about line 3644). The status ring sits at 1.07 R, so any progress above 50 % sweeps into the text column.
- **What it overlaps:**
  - Moon: the "W" of "57 MSGS/H NOW" is hidden (`moon-9000.png`).
  - AI Ring: the ring crosses the end of the activity chart (`ai-9000.png`).
- **Floating messages:** they flip left by a fixed 238 px with no left limit (`x.el.style.transform = … px - 238 …`, about line 3757). They cross the plate edge and the "65 %" row on AI Ring, and two of them stack on each other on Moon.
- **Ring label:** on Art Hall, "▲ 4% vs a usual hour" covers the `#builders · 8` room pin (`art-14000.png`).
- **Fix:**
  - **Ring shader:** draw the arc on the right half only, so it stays out of the text and the planet keeps its size. Use `float t = p.x < 0.0 ? 2.0 : atan(p.x, p.y) / 3.14159265;` and use `PI` instead of `TAU` for `h` and the tick. The arc then ends at 6 o'clock, right above its label.
  - **Messages:** `const bx = Math.max(textRight + 12, px + 238 > limit ? px - 238 : px + 6)`, and hide a message whose rectangle hits one already placed (a `placed[]` list, as the labels use).
  - **Pins:** hide a room pin whose point falls within 40 px of `#fRingLabel`'s rectangle.

### 4. Universe labels touch, flicker and pop; the HOME caption sits on the sun (M)
- **Collisions:** the label collision rectangle has no padding (`const r = [x - 14, y - 58, …]`, about line 3725). Memba DAO/Adena and Dev help/Bug hunters touch at 1440 px and overlap at 390 px (`mu-12000.png`).
- **Pops:** labels switch `hidden` on and off every frame while the camera auto-rotates. They pop in and out with no fade and flicker when they are right at the limit.
- **Zone caption:** the "HOME · Earth and GovDAO, close to gno.land" caption sits on the sun's white core and cannot be read (`peek-11000.png`).
- **Fix:**
  - Pad the rectangle by 8 px: `[x - 22, y - 62, x - 6 + labelW, y - 22]`.
  - Add hysteresis: keep a label that is already showing until the overlap is more than 12 px.
  - Fade instead of switching: `b.op += ((free ? 1 : 0) - b.op) * (1 - Math.exp(-dt / .15))`, write that to `opacity`, and use `visibility: hidden` below 0.02.
  - Show zones only in the Map lens (`state.lens === 'map'` in the ZONES loop).

### 5. The telescope peek hides the world it describes and shows raw markdown (S)
- **Where:** `peekShow` places the card at `r.bottom + 8` of the whole label button, which includes the stem, so the card lands on the planet.
- **What happens:** hovering GovDAO hides the GovDAO planet and part of the HOME caption. The text shows `*storage deposit*`, `~~freeze~~` and `**vote ends tonight**` as typed (`peek-11000.png`).
- **Fix:**
  - Place the card beside the pill: `const r = el.querySelector('.pill').getBoundingClientRect(); left = r.right + 12` (or `r.left - 272` when it would reach the rail), `top = r.top - 4`.
  - Render the line with `mdInline`, or strip the markers: `.replace(/\*\*|__|~~|[*_`]/g, '')`.
  - Set `controls.autoRotate = false` while a label is hovered, so the card does not drift away from its label.

### 6. Mobile 390: the floating Chat pill overlaps the CTA, the nav and the plate (S)
- **Where:** `#mChat` (bottom: 76 px).
- **What happens:**
  - In the universe it sits on "Join the chat" (which does the same thing) and on the nav pill's search button (`mu-12000.png`).
  - In focus view it covers "66 % regulars this week" (`mb-14000.png`).
- **Fix:**
  - Put it in the nav row: `#mChat { bottom: calc(12px + env(safe-area-inset-bottom)); height: 44px; }` and add `body[data-view="focus"] #hnav .views { right: 76px; }`.
  - Hide it where the hero is showing: `body:not([data-view="focus"]) #mChat { display: none; }`.

### 7. Hard crops instead of fades (S)
- **Chat list:** messages are cut in half under the pinned bar, on Earth, Art Hall and AI Ring and on mobile (`earth-15000.png`, `art-14000.png`, `mobchat-12000.png`).
- **Rails:** the universe rail cuts its last planet and label (`shot106-uni.png`), and so does the full-chat place rail (`full-15000.png`). Rail names are cut off ("BROADCAST MO…").
- **Fix:**
  - `#chatList { -webkit-mask-image: linear-gradient(transparent, #000 20px); mask-image: linear-gradient(transparent, #000 20px); }`
  - `#hRailList, #placeRail { mask-image: linear-gradient(transparent, #000 12px, #000 calc(100% - 32px), transparent); }`
  - `#hRailList small { white-space: normal; text-align: center; line-height: 1.25; }`

### 8. Flag emoji in the interface, and a country column that overflows (S)
- **The rule:** "never emoji in the interface". `flag(cc)` (about line 1214) puts emoji flags next to every name, in the person card, in DMs and in "Here now". On Windows these render as two plain letters.
- **The overflow:** in the full chat's "Here now", the 48 px country column is too narrow. "Australia" runs past the panel edge (x 1431 on a 1440 screen) and "United States" wraps to two lines (`full-15000.png`).
- **Fix:**
  - Show the country as a code in the timestamp style: `<span class="cc">FR</span>` with `.cc { font: 10px var(--mono); letter-spacing: .08em; color: var(--muted) }`.
  - `.people li { grid-template-columns: 24px minmax(0, 1fr) auto; }` (drop the flag column).

### 9. Heights drift away from 44/40/32, and content actions are stretched (S)
- **Heights found in the CSS:** 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 48, 52 and 56.
- **Snap them:**
  - Room chips 30 → 32. They sit next to 32 px tools in the same row.
  - Composer tools (`.ctools .tbtn`) 34 → 32.
  - Flash and person-card buttons 36 → 32.
  - Room finder (`.rfind`), full-chat rooms and DMs 38 → 40.
  - `#fDapp a` 34 → 32.
  - Hero CTAs 52 → 56, to match the plate CTA.
- **Stretched actions:** `#quick button { flex: 1 0 auto }` stretches content actions into 200 px slabs in the full chat (`full-15000.png`) and on Launchpad. They should sit below window controls in the hierarchy. Fix: `flex: none`.
- **CTA wrap:** with a long room name, the plate's CTA row wraps and "Share" ends up alone on a second line (Moon, `moon-9000.png`). Fix: make Follow and Share 56 px round icon buttons (`#fActs .ghost { width: 56px; padding: 0 }`, line icons, label moved to `aria-label`/`title`) and set `#fActs { flex-wrap: nowrap }`.

### 10. Too many type sizes and letter-spacings (M)
- **Sizes:** the CSS uses 31 font sizes, including 9.5, 10.5, 11.5, 12.5, 13.5 and 14.5 px.
- **Letter-spacing:** there are 11 spacing values for capitals, from 0.04 to 0.32 em.
- **Two heading styles on one plate:** sans 12 px at .08 em ("CONNECTED WORLDS") and mono 11 px ("ACTIVITY · LAST 24 H").
- **Weights:** display weights mix 200, 300, 400 and 500.
- **Breadcrumb gap:** the last "›" gets 8 px margin plus the kicker's 8 px gap, so "GAMES ›  DAPP" is wider than the other steps.
- **Fix:**
  - One scale: 10/11/12/13/14/16/20/28/36 plus a display size.
  - Two spacing tokens: .08 em at 11 px and above, .14 em at 10.5 px and below.
  - One heading style for every plate section.
  - `#fCrumbs span:last-child { margin-right: 0 }`.

### 11. Icons are not one system (S–M)
- **Text arrows mixed with SVG:** arrows typed as characters (→ ← ↑ ↓ ↗ ›, drawn by the Geist font at different weights) sit beside SVG line icons. They appear in the hero CTAs, connected worlds (`.go`), the lightbox prev/next buttons, the rail's "↑" and "↓", and the links.
- **Uneven strokes:** SVG strokes range from 1.2 to 1.6 at 13–18 px sizes, so they render between 1.0 and 1.5 px.
- **Filled icons:** the rail tab icons are filled, not line icons.
- **Fix:** add one `icon(name)` helper (16 px box, 1.5 stroke, round caps) for arrow-right, arrow-left, arrow-up, arrow-up-right and chevron, use it everywhere, and switch the rail tabs to outline icons.

### 12. Elements that appear or disappear with no transition (S/M)
- **Popovers:** `.pop` elements appear instantly (room switcher, person card, message menu, reactions). Fix: `@keyframes popin { from { opacity: 0; transform: translateY(4px) scale(.98) } } .pop:not([hidden]) { animation: popin .16s cubic-bezier(.2,.7,.1,1) }`. The existing reduced-motion rule already turns it off.
- **Full-screen chat:** it snaps to full screen and only its children fade in; shrinking back has no animation at all (`chatMode`).
  - Fix: `G.fromTo('#chat', { clipPath: 'inset(98px 24px 24px calc(100% - 384px) round 20px)' }, { clipPath: 'inset(0 0 0 0 round 0px)', duration: .5, ease: 'power3.inOut' })`.
  - On shrink, run the reverse tween before setting the mode to `open`.
- **Loader:** the iris opens from the screen centre, but the logo sits about 80 px higher because of the grid row. Fix: `#loader .lmark { position: absolute; left: 50%; top: 50%; translate: -50% -50%; }`.

---

## Ideas that serve the goal
1. **One arrival sequence.** The flight panel shrinks into the plate's breadcrumb, then the name rises and the chat slides in. The stamp lands as a small mark next to the name instead of a top note. Visiting feels collectible, and one top note disappears.
2. **Live labels.** When a message lands in a world, a short glow runs across that world's label (600 ms, one at a time). The universe looks alive without adding new elements.
3. **Room pins as doors.** Clicking a room pin on the planet switches the chat room, with a brief light trail from the pin to the room chip. This links the planet to the conversation.
4. **Visible comets.** A comet bursts into its target's label, the label glows, and the label's peek shows the message for a few seconds. People find the feature by seeing it used.
5. **Hover holds the sky.** Pause auto-rotation while the pointer is on a label or a peek, then let it ease back (the 2.5 s lerp already exists). Reading becomes easier and the peek stays with its label.
