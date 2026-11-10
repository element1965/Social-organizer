/**
 * Design tokens (redesign palette, green-black, from styles/tokens.css).
 *
 * Semantic colors read CSS variables and flip with html.dark, so components
 * do not use a dark: variant or the old gray/blue/teal/red/amber ramps.
 *
 * This file fails the build when a file under apps/web/src (.js, .jsx, .ts,
 * .tsx, .css) or apps/web/index.html contains a hex color, a Tailwind dark:
 * variant, an old color ramp (the default Tailwind palette plus a digit), or a
 * bare white/black utility (bg, text, border, ring, fill, stroke, from, via,
 * to, divide, outline, shadow).
 * Brand marks (components/onboarding/brand.tsx, components/ui/social-icons.tsx)
 * and styles/tokens.css are the only exceptions.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const token = (name) => `rgb(var(--so-${name}) / <alpha-value>)`;
const line = (alpha) => `rgb(var(--so-line) / ${alpha})`;

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(here, 'src');

const lintTargets = [srcRoot, path.join(here, 'index.html')];

/** Brand colors and the token source. Everything else must use semantic tokens. */
const lintSkip = new Set([
  path.join(srcRoot, 'components', 'onboarding', 'brand.tsx'),
  path.join(srcRoot, 'components', 'ui', 'social-icons.tsx'),
  path.join(srcRoot, 'styles', 'tokens.css'),
  // QR codes stay black on white in every theme, or phone cameras do not find them
  path.join(srcRoot, 'components', 'add', 'LiveQr.tsx'),
]);

function walk(entry, out) {
  if (!fs.existsSync(entry)) return;
  const stat = fs.statSync(entry);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(entry)) walk(path.join(entry, name), out);
    return;
  }
  if (/\.(jsx?|tsx?|css|html)$/.test(entry)) out.push(entry);
}

/** Drop comments so a note like #123 is not read as a hex color. Newlines stay so line numbers match. */
function maskComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (match, prefix) => prefix + ' '.repeat(match.length - prefix.length));
}

function lintDesignTokens() {
  const files = [];
  for (const target of lintTargets) walk(target, files);
  const problems = [];
  const hexRe = /#[0-9A-Fa-f]{3,8}\b/;
  const darkRe = /(^|[^A-Za-z0-9_-])dark:/;
  const rampRe = /(^|[^A-Za-z0-9_-])(?:[a-z0-9-]+:)*(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{1,3}(?![A-Za-z0-9_-])/;
  const bareRe = /(^|[^A-Za-z0-9_-])(?:[a-z0-9-]+:)*(?:bg|text|border|ring|fill|stroke|from|via|to|divide|outline|shadow)-(?:white|black)(?![A-Za-z0-9_-])/;
  for (const file of files) {
    if (lintSkip.has(file)) continue;
    const lines = maskComments(fs.readFileSync(file, 'utf8')).split(/\r?\n/);
    lines.forEach((lineText, index) => {
      const where = `${path.relative(here, file)}:${index + 1}`;
      if (hexRe.test(lineText)) problems.push(`${where}: hex color`);
      if (darkRe.test(lineText)) problems.push(`${where}: dark: variant`);
      if (rampRe.test(lineText)) problems.push(`${where}: old color ramp`);
      if (bareRe.test(lineText)) problems.push(`${where}: bare white or black`);
    });
  }
  if (problems.length > 0) {
    throw new Error(`Design-token lint failed (${problems.length}):\n${problems.join('\n')}`);
  }
}

lintDesignTokens();

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: token('canvas'),
        surface: { DEFAULT: token('surface'), 2: token('surface-2') },
        ink: { DEFAULT: token('ink'), muted: token('ink-muted'), subtle: token('ink-subtle') },
        line: { DEFAULT: line('0.14'), soft: line('0.08'), strong: line('0.24') },
        care: {
          DEFAULT: token('care'),
          hover: token('care-hover'),
          soft: token('care-soft'),
          on: token('on-care'),
          bright: token('care-bright'),
          scene: token('care-scene'),
        },
        link: { DEFAULT: token('link'), soft: token('link-soft') },
        sos: { DEFAULT: token('sos'), hover: token('sos-hover'), soft: token('sos-soft'), on: token('on-sos') },
        warm: { DEFAULT: token('warm'), soft: token('warm-soft'), ink: token('warm-ink') },
        scene: { DEFAULT: token('scene'), 2: token('scene-2'), 3: token('scene-3') },
        node: { 1: token('node-1'), 2: token('node-2'), 3: token('node-3') },
        success: token('care'),
        warning: token('warm'),
      },
      // Text uses care-text: in dark it is lighter than the care fill. Deep-merges with colors.care.
      textColor: {
        care: { DEFAULT: token('care-text') },
        success: token('care-text'),
      },
      // Named scale, not `r-*`. `rounded-r-lg` is Tailwind's right-side utility.
      borderRadius: {
        xs: 'var(--r-xs)',
        sm: 'var(--r-sm)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
        '2xl': 'var(--r-2xl)',
        pill: 'var(--r-pill)',
        card: 'var(--r-xl)',
      },
      height: {
        primary: 'var(--h-primary)',
        secondary: 'var(--h-secondary)',
        small: 'var(--h-small)',
        chip: 'var(--h-chip)',
        icon: 'var(--h-icon)',
      },
      minHeight: {
        row: 'var(--h-row)',
        primary: 'var(--h-primary)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        float: 'var(--shadow-float)',
        sheet: 'var(--shadow-sheet)',
        banner: 'var(--shadow-banner)',
      },
      fontFamily: {
        sans: ['Manrope', '"Segoe UI"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        display: ['3.25rem', { lineHeight: '1', letterSpacing: '-0.05em' }],
        h1: ['2rem', { lineHeight: '1.05', letterSpacing: '-0.04em' }],
        h2: ['1.875rem', { lineHeight: '1.02', letterSpacing: '-0.045em' }],
        h3: ['1.5rem', { lineHeight: '1.05', letterSpacing: '-0.04em' }],
        title: ['1.375rem', { lineHeight: '1.15', letterSpacing: '-0.03em' }],
        'body-l': ['1.0625rem', { lineHeight: '1.35', letterSpacing: '-0.01em' }],
        body: ['1rem', { lineHeight: '1.4', letterSpacing: '-0.02em' }],
        'body-s': ['0.9375rem', { lineHeight: '1.4' }],
        caption: ['0.875rem', { lineHeight: '1.4' }],
        label: ['0.8125rem', { lineHeight: '1.35' }],
        micro: ['0.75rem', { lineHeight: '1.3' }],
        tab: ['0.6875rem', { lineHeight: '1', letterSpacing: '-0.01em' }],
      },
      fontWeight: {
        body: '650',
      },
      transitionTimingFunction: {
        so: 'cubic-bezier(0.22, 0.8, 0.24, 1)',
      },
      transitionDuration: {
        fast: '150ms',
        base: '260ms',
        screen: '420ms',
      },
    },
  },
  plugins: [],
};
