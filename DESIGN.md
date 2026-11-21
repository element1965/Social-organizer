---
name: Social Organizer
description: A network of people you know, lit on a night scene; calm, firm app screens around it.
colors:
  care-teal: "#087f71"
  care-teal-hover: "#08675c"
  care-teal-soft: "#e5f5f3"
  care-teal-bright: "#0d9488"
  care-scene: "#5fd3c6"
  on-care: "#ffffff"
  signal-red: "#c5342c"
  signal-red-hover: "#a32c25"
  signal-red-soft: "#fbeae8"
  lamp-amber: "#f2be68"
  lamp-amber-soft: "#fdf1e3"
  lamp-amber-ink: "#9a5a16"
  link-iris: "#5468d4"
  link-iris-soft: "#eef1fc"
  night-pine: "#0b1513"
  night-pine-2: "#132420"
  night-pine-3: "#1b332e"
  node-near: "#e7eeeb"
  node-mid: "#9fb0aa"
  node-far: "#5f7069"
  canvas: "#f3f6f4"
  surface: "#ffffff"
  surface-2: "#e9eeec"
  ink: "#14211e"
  ink-muted: "#5c6d68"
  ink-subtle: "#5e6d68"
  dark-canvas: "#121917"
  dark-surface: "#1c2622"
  dark-surface-2: "#24302b"
  dark-ink: "#e7eeeb"
  dark-ink-muted: "#93a59f"
  dark-care: "#46a596"
  dark-care-text: "#6cbcaf"
  dark-signal-red: "#e08a82"
typography:
  display:
    fontFamily: "Manrope, Segoe UI, system-ui, sans-serif"
    fontSize: "3.25rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.05em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Manrope, Segoe UI, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.04em"
  headline-sm:
    fontFamily: "Manrope, Segoe UI, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Manrope, Segoe UI, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  body-l:
    fontFamily: "Manrope, Segoe UI, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 650
    lineHeight: 1.35
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Manrope, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "-0.02em"
  caption:
    fontFamily: "Manrope, Segoe UI, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
  label:
    fontFamily: "Manrope, Segoe UI, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.35
  micro:
    fontFamily: "Manrope, Segoe UI, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.3
  site-display:
    fontFamily: "Manrope, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(52px, 7.4vw, 116px)"
    fontWeight: 400
    lineHeight: 0.95
    letterSpacing: "-0.045em"
  site-headline:
    fontFamily: "Manrope, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(38px, 4.6vw, 70px)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.035em"
  site-body:
    fontFamily: "Manrope, Segoe UI, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 450
    lineHeight: 1.55
rounded:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "22px"
  2xl: "30px"
  pill: "999px"
spacing:
  gutter: "16px"
  bar-inset: "28px"
  column: "680px"
  site-gutter: "clamp(20px, 4vw, 56px)"
  site-wrap: "1240px"
components:
  button-primary:
    backgroundColor: "{colors.care-teal}"
    textColor: "{colors.on-care}"
    typography: "{typography.body-l}"
    rounded: "{rounded.lg}"
    height: "56px"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.care-teal-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    height: "48px"
    padding: "0 16px"
  button-danger:
    backgroundColor: "{colors.signal-red}"
    textColor: "{colors.on-care}"
    rounded: "{rounded.lg}"
    height: "56px"
  button-text:
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "0 8px"
  input-text:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    typography: "{typography.body-l}"
    rounded: "{rounded.lg}"
    height: "56px"
    padding: "0 14px"
  chip-ring:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.micro}"
    rounded: "{rounded.md}"
    height: "32px"
    padding: "0 10px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "16px"
  tab-bar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.micro}"
    height: "84px"
  site-button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "17px 26px"
  site-button-care:
    backgroundColor: "{colors.care-teal}"
    textColor: "{colors.on-care}"
    rounded: "{rounded.pill}"
    padding: "17px 26px"
---

# Design System: Social Organizer

## Overview

**Creative North Star: "The Flock at Dusk"**

A starling flock at dusk has no leader. Each bird watches a few neighbours, and a turn passes from neighbour to neighbour until the whole flock moves. Social Organizer is drawn the same way. The network lives on a dark pine-green night scene (Night Pine), its people are pale points of light that dim with each handshake of distance, and a Need travels through it as a signal from the nearest outward. The scene is where the network is shown; it is never decoration.

Around the scene, the app's working screens are calm and firm. They sit on a pale green-grey canvas in light theme or a deep green-black one in dark theme, set in heavy Manrope (body at 650, headings at 800) with large touch targets (56 px primary rows and buttons), soft single shadows and one decisive accent. The app is an Operate surface used on inexpensive phones, often in a second language, so legibility, reach and quiet beat expression. The website keeps the same palette and the same font but speaks in a lighter voice: large, thin Manrope (300–450) over the dark scene, pill buttons and scroll-told chapters.

Colour carries meaning, not mood. Care Teal is the person acting (the main action, Participation, confirmation), Signal Red is a Need and nothing else, and Lamp Amber is a warm note, never an alarm.

**Key Characteristics:**
- One dark scene (Night Pine) for the network in every theme of the website and the QR camera; the Circle scene follows the app theme.
- Heavy, tight Manrope in the app; light, large Manrope on the website. One family everywhere.
- Semantic colour only: no raw hex outside `styles/tokens.css`, enforced by the build.
- Large, calm touch targets (56 / 48 / 40 px), one shadow per surface, a 0.96 press.
- Logical properties throughout (`ps-`, `me-`, `start-`), so right-to-left layouts mirror.

## Colors

A green-black palette with one teal accent, one red signal and one warm note. Every colour has a light and a dark value in `apps/web/src/styles/tokens.css`, exposed to Tailwind as semantic names (`care`, `sos`, `warm`, `ink`, `canvas`, `surface`, `scene`, `node`).

### Primary
- **Care Teal** (`care-teal`): the person acting. Primary buttons, Participation, confirmations, the focus ring, active toggles, links in running text that lead somewhere in the app. Chosen dark enough for AA on white; on dark theme it becomes the calmer `dark-care` fill with the lighter `dark-care-text` for small text.
- **Care Teal Bright** (`care-teal-bright`) and **Care Scene** (`care-scene`): the same teal lifted for use on the dark scene only (the graph, on-scene chips, numbers on the landing). Never on the light canvas.

### Secondary
- **Signal Red** (`signal-red`): a Need. The Need mark, the badge on the Circle tab, the Need's progress, destructive actions and error text. Light theme uses the deep red; dark theme uses the softened `dark-signal-red`.

### Tertiary
- **Lamp Amber** (`lamp-amber`): warmth, never urgency. Milestones, gentle highlights, the warm accent on the website. Text on amber backgrounds uses `lamp-amber-ink`.
- **Link Iris** (`link-iris`): external links and the rare informational accent.

### Neutral
- **Night Pine** (`night-pine`, `-2`, `-3`): the scene. The landing, the Circle in dark theme, the QR camera, figures. Three steps from the darkest wash to a raised panel.
- **Node Near / Mid / Far** (`node-near`, `node-mid`, `node-far`): people on the scene by handshake distance, from first (brightest) to third (dimmest).
- **Canvas** (`canvas`): the app background, a pale green-grey; dark theme `dark-canvas`.
- **Surface / Surface 2** (`surface`, `surface-2`): cards, groups, sheets (surface); fields, pressed rows and quiet fills (surface 2).
- **Ink / Ink Muted / Ink Subtle** (`ink`, `ink-muted`, `ink-subtle`): text by importance. Subtle is for placeholders and icons, not for text a person must read.
- **Lines**: the ink colour at 8 %, 14 % and 24 % alpha (soft, default, strong) for dividers, field borders and the sheet handle.

### Named Rules
**The Signal Rule.** Signal Red means a Need (or an irreversible action). It is never used for decoration, emphasis or brand.

**The Token-Only Rule.** No hex colour, Tailwind `dark:` variant, default Tailwind ramp or bare white/black utility in `apps/web/src`. The Tailwind config fails the production build when one appears. Brand marks, social icons, the QR code and the token file are the only exceptions.

**The Scene Rule.** Bright teal and pale node colours live on the dark scene. On the light canvas use Care Teal and Ink.

## Typography

**Display Font:** Manrope (with Segoe UI, system-ui, sans-serif)
**Body Font:** Manrope, the same variable family (200–800), self-hosted with Latin, Latin Extended, Cyrillic and Vietnamese subsets.

**Character:** One geometric-humanist sans in two voices. In the app it is heavy and tight, so small text stays readable on cheap screens. On the website it is light and large, so the story reads like a calm voice over the night scene.

### Hierarchy
- **Display** (800, 3.25rem, 1): the big numbers of the app, such as the amount being entered and the network's declared participation. Tabular figures.
- **Headline** (800, 2rem / 1.875rem / 1.5rem, 1.02–1.05): screen titles (`h1`–`h3`). The main bar uses the 1.5rem step.
- **Title** (700–800, 1.375rem, 1.15): sheet and card titles.
- **Body** (650, 1rem / 1.0625rem, 1.35–1.4): rows, buttons, running text. Body-s (0.9375rem) for secondary buttons and dense rows.
- **Label** (600–700, 0.875 / 0.8125 / 0.75rem, 1.3–1.4): captions, field labels, group titles, tab labels, badges. No uppercase in the app.
- **Site display and headline** (400, clamp 52–116 px and 38–70 px, 0.95–1): the website's chapter headings. Site body is 450, 18 px, 1.55; leads run 18–22 px.

### Named Rules
**The Weight Floor Rule.** App text never goes below weight 600, and running text sits at 650. Thin weights belong to the website's large type only.

**The Tabular Money Rule.** Amounts and counts use tabular figures and the "300 $" format: number, space, sign after.

## Layout

The app is a single centred column of 680 px with a 16 px gutter inside, used the same way by the main bar and the screen body so edges line up. On phones the tab bar sits at the bottom (84 px high, four tabs: Circle, Need (route `/ask`), Add, Profile; the wider shells add People). From 768 px it becomes a side rail, and from 1024 px a sidebar with labels; sheets turn into centred dialogs on wide screens. Rows are at least 56 px high and grouped into rounded lists with soft dividers. Spacing follows a 4 px base with 12, 16 and 20 px as the common steps. Safe-area insets (`--sa-top`) are respected by sticky bars.

The Circle is the exception: a full-screen 3D scene with a scrim behind the header numbers, ring chips on top and an event sheet that collapses into a pill.

The website uses a 1240 px wrap with a fluid gutter (20–56 px) and full-viewport chapters (`100svh`) over a fixed 3D flock, with a two-column grid on desktop that stacks on phones.

## Elevation & Depth

A hybrid: tonal layering first (canvas, surface, surface 2), with one soft shadow per raised surface. Shadows are ambient, low and green-tinted from the ink colour, never grey-blue. On the scene, depth comes from the 3D graph itself and from scrims, not from shadows.

### Shadow Vocabulary
- **Card** (`box-shadow: 0 10px 28px rgba(20, 33, 30, 0.06)`): cards and grouped lists on the canvas.
- **Float** (`box-shadow: 0 6px 16px rgba(20, 33, 30, 0.1), inset 0 0 0 1px rgba(20, 33, 30, 0.08)`): chips and small controls that sit over content or the scene.
- **Banner** (`box-shadow: 0 16px 36px rgba(20, 33, 30, 0.16), 0 0 0 1px rgba(20, 33, 30, 0.06)`): top banners and live notices.
- **Sheet** (`box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4)`): bottom sheets and dialogs.

### Named Rules
**The One Shadow Rule.** A surface carries one shadow from the vocabulary above. Selected states drop the shadow and change the fill instead.

## Shapes

Gently rounded rectangles in the app, pills on the website. Controls use 12–16 px corners (fields and primary buttons 16 px, small buttons and chips 12 px), cards and grouped lists 22 px, sheets 30 px at the top. Badges, avatars and the sheet handle are fully round. The brand mark is the white fish on a Care Teal tile with corners at 29 % of its size and the fish at 68 %. Website buttons are full pills (999 px) and numbered steps sit in thin teal circles.

## Components

### Buttons
Calm and firm: full-width where they end a task, bold label, a small press.
- **Shape:** 16 px corners for large and medium (`rounded.lg`), 12 px for small and icon buttons.
- **Primary:** Care Teal fill, white label, 56 px high, bold 1.0625rem. One per screen.
- **Secondary:** surface fill with a 1 px line, ink label, 48 px. **Ghost:** canvas fill. **Danger:** Signal Red fill. **Text:** muted label, no fill, 40 px touch height.
- **Hover / Focus / Press:** fill steps to the hover token in 150 ms on the `so` curve; a 2 px Care Teal focus ring with 2 px offset; press scales to 0.96. Disabled is 45 % opacity. Loading keeps the size and swaps the label for a spinner.

### Chips
- **Ring chips:** surface fill, float shadow, a coloured dot for the handshake ring, a bold count; 32 px high.
- **Preset chips** (amount presets): 40 px; selected inverts to an ink fill with canvas text and drops the shadow.
- **On-scene chips:** translucent Night Pine with a pale hairline; selected turns Care Teal Bright with scene-coloured text.

### Cards / Containers
- **Corner Style:** 22 px.
- **Background:** surface on canvas.
- **Shadow Strategy:** Card shadow (see Elevation).
- **Internal Padding:** 16 px; a title at Title size, a muted caption under it.
- **Groups:** settings-style lists in one rounded surface with soft dividers, a small muted label above, 56 px rows with an optional icon, value and chevron.

### Inputs / Fields
- **Style:** surface 2 fill, 1 px line, 16 px corners, 56 px high, semibold 1.0625rem; search fields 48 px with a leading icon on the start side.
- **Focus:** the border turns Care Teal.
- **Error:** the border turns Signal Red and the error text fades in under the field in red at label size.
- **Money field:** the amount at Display size with the dollar sign after it, no box, a red underline on error.
- **Code field:** six 48 px cells for the sign-in code, paste fills all of them.

### Navigation
- **Tab bar (phones):** four tabs with 24 px icons (the Need tab shows a thin progress ring until a Need can be reported) over a 12 px label; the active tab is ink and bumps once; the Circle tab carries a Signal Red count badge (9+ cap).
- **Rail and sidebar (768 px and up):** 22 px icons, labels from 1024 px, tooltips on the rail.
- **Main bar:** sticky, canvas-coloured, 64 px; a Care Teal back crumb, a 1.5rem extrabold title, actions at the end.

### Sheets
Bottom sheets with a 36 px handle, a Title-size heading, optional leading avatar, and stacked full-width actions; on wide screens a centred dialog with actions side by side. They enter with a 16 px rise in 320 ms and leave faster (200 ms).

### The Circle Scene (signature)
The person's network as a 3D graph on Night Pine (`packages/graph-3d`): the person at the centre, people as points by handshake distance (Node Near, Mid, Far), labels and avatars only near the camera. Over it: the header numbers on a scrim, ring chips, a "back to me" control and the event sheet that collapses into a pill. In light theme the scene turns pale with ink nodes.

## Do's and Don'ts

### Do:
- **Do** use the semantic tokens (`bg-care`, `text-ink-muted`, `bg-surface-2`) and let html.dark flip them.
- **Do** keep primary actions 56 px high and every touch target at least 44 px.
- **Do** use one easing curve, `cubic-bezier(0.22, 0.8, 0.24, 1)`, at 150 ms for presses, 220–260 ms for things that appear and 320 ms for sheets, and turn it all off under reduced motion.
- **Do** write layout with logical properties (`ps`, `pe`, `ms`, `me`, `start`, `end`) so Arabic and Hebrew mirror.
- **Do** show amounts with tabular figures in the "300 $" format.
- **Do** start every marketing page from the real brand mark and the scene palette.

### Don't:
- **Don't** put a hex colour, a `dark:` variant or a default Tailwind ramp in `apps/web/src`; the build fails.
- **Don't** use Signal Red for anything that is not a Need, an error or a destructive action.
- **Don't** use Ink Subtle for text a person needs to read.
- **Don't** replace the 3D network with a flat or 2.5D graph.
- **Don't** add a lock icon to gated actions; show progress towards them instead.
- **Don't** use thin weights (below 600) inside the app.
- **Don't** stack shadows or add a shadow to a selected state.
