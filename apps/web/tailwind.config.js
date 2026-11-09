/**
 * Design tokens (redesign palette, green-black, from styles/tokens.css).
 *
 * Semantic colors read CSS variables and flip with html.dark, so new code
 * does not use a dark: variant. Legacy gray/blue/teal/red/amber ramps stay
 * mapped onto the same palette until WP9 removes them.
 *
 * This file also fails the build when redesign files in apps/web/src contain
 * a hex color or a Tailwind dark: variant. tokens.css is the only exception.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const token = (name) => `rgb(var(--so-${name}) / <alpha-value>)`;
const line = (alpha) => `rgb(var(--so-line) / ${alpha})`;

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(here, 'src');

const lintTargets = [
  path.join(srcRoot, 'components', 'ui2'),
  path.join(srcRoot, 'components', 'Layout.tsx'),
  path.join(srcRoot, 'App.tsx'),
  path.join(srcRoot, 'index.css'),
  path.join(srcRoot, 'styles', 'typography.css'),
];

function walk(entry, out) {
  if (!fs.existsSync(entry)) return;
  const stat = fs.statSync(entry);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(entry)) walk(path.join(entry, name), out);
    return;
  }
  if (/\.(tsx?|css)$/.test(entry)) out.push(entry);
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
  for (const file of files) {
    const lines = maskComments(fs.readFileSync(file, 'utf8')).split(/\r?\n/);
    lines.forEach((lineText, index) => {
      if (hexRe.test(lineText)) problems.push(`${path.relative(here, file)}:${index + 1}: hex color`);
      if (darkRe.test(lineText)) problems.push(`${path.relative(here, file)}:${index + 1}: dark: variant`);
    });
  }
  if (problems.length > 0) {
    throw new Error(`Design-token lint failed (${problems.length}):\n${problems.join('\n')}`);
  }
}

lintDesignTokens();

const ink = {
  50: '#f3f6f4',
  100: '#e9eeec',
  200: '#d5deda',
  300: '#b7c4bf',
  400: '#8a9a95',
  500: '#5c6d68',
  600: '#3d524c',
  700: '#2c3d38',
  800: '#1c2622',
  900: '#14211e',
  950: '#121917',
};

const periwinkle = {
  50: '#eef1fc',
  100: '#dde3fa',
  200: '#bcc6f4',
  300: '#9aa8f0',
  400: '#7486e2',
  500: '#5468d4',
  600: '#4557c4',
  700: '#3946a3',
  800: '#2f3a82',
  900: '#283265',
  950: '#1a2042',
};

const teal = {
  50: '#e5f5f3',
  100: '#c6eae3',
  200: '#93d6ca',
  300: '#5bbfae',
  400: '#2bb3a4',
  500: '#12917f',
  600: '#087f71',
  700: '#08675c',
  800: '#0a524a',
  900: '#0b433d',
  950: '#042824',
};

const sos = {
  50: '#fbeae8',
  100: '#f6d4d1',
  200: '#eeada8',
  300: '#e08a82',
  400: '#d2655c',
  500: '#cc4d44',
  600: '#c5342c',
  700: '#a32c25',
  800: '#7d241f',
  900: '#5c1d19',
  950: '#3c1012',
};

const warm = {
  50: '#fdf1e3',
  100: '#fbebcb',
  200: '#f7d9a0',
  300: '#f2be68',
  400: '#eaa845',
  500: '#d98f2b',
  600: '#b8731f',
  700: '#9a5a16',
  800: '#77471d',
  900: '#623b1b',
  950: '#3a2a12',
};

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
        gray: ink,
        slate: ink,
        blue: periwinkle,
        indigo: periwinkle,
        teal,
        green: teal,
        emerald: teal,
        red: sos,
        amber: warm,
        yellow: warm,
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
      keyframes: {
        'milestone-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'milestone-in': 'milestone-in 0.35s ease-out',
      },
    },
  },
  plugins: [],
};
