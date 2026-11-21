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

<!-- impeccable:design-map -->
Name: Social Organizer
Colors: primary: care-teal #087f71; secondary: signal-red #c5342c; tertiary: lamp-amber #f2be68; neutral: night-pine #0b1513; tertiary: link-iris #5468d4; neutral: canvas #f3f6f4; neutral: ink #14211e (+1 more in the sidecar)
Fonts: Manrope (display, headline, headline-sm, title, body-l, body, caption, label, micro, site-display, site-headline, site-body)
Spacing: gutter 16px, bar-inset 28px, column 680px, site-gutter clamp(20px, 4vw, 56px), site-wrap 1240px
Radius: xs 4px, sm 8px, md 12px, lg 16px, xl 22px, 2xl 30px, pill 999px
North Star: "The Flock at Dusk"
Rules:
- The Signal Rule. Signal Red means a Need (or an irreversible action).
- The Token-Only Rule. No hex colour, Tailwind `dark:` variant, default Tailwind ramp or bare white/black utility in `apps/web/src`.
- The Scene Rule. Bright teal and pale node colours live on the dark scene.
- The Weight Floor Rule. App text never goes below weight 600, and running text sits at 650.
- The Tabular Money Rule. Amounts and counts use tabular figures and the "300 $" format: number, space, sign after.
- The One Shadow Rule. A surface carries one shadow from the vocabulary above.
Elevation:
- Card: 0 10px 28px rgba(20, 33, 30, 0.06)
- Float: 0 6px 16px rgba(20, 33, 30, 0.1), inset 0 0 0 1px rgba(20, 33, 30, 0.08)
- Banner: 0 16px 36px rgba(20, 33, 30, 0.16), 0 0 0 1px rgba(20, 33, 30, 0.06)
- Sheet: 0 20px 50px rgba(0, 0, 0, 0.4)
Don't:
- Don't put a hex colour, a `dark:` variant or a default Tailwind ramp in `apps/web/src`; the build fails.
- Don't use Signal Red for anything that is not a Need, an error or a destructive action.
- Don't use Ink Subtle for text a person needs to read.
- Don't replace the 3D network with a flat or 2.5D graph.
- Don't add a lock icon to gated actions; show progress towards them instead.
- Don't use thin weights (below 600) inside the app.
- Don't stack shadows or add a shadow to a selected state.
Do:
- Do use the semantic tokens (`bg-care`, `text-ink-muted`, `bg-surface-2`) and let html.dark flip them.
- Do keep primary actions 56 px high and every touch target at least 44 px.
- (+4 more)
Map: apps/web/src/styles/tokens.css
Map: apps/web/src
Map: packages/graph-3d
Full: .impeccable/design-full.md (read a section when you need its detail)
