/**
 * Design tokens (redesign palette "Ink and teal").
 *
 * 1. Semantic tokens — use these in new and redesigned code:
 *    bg-canvas, bg-surface, bg-surface-2, text-ink, text-ink-muted, text-ink-subtle, border-line,
 *    bg-care / text-care (participation, primary action), text-link / bg-link (connections, links),
 *    bg-sos (SOS only), bg-warm (rare accent), bg-success / bg-warning.
 *    They read CSS variables from src/styles/tokens.css and flip with the dark theme by themselves,
 *    so no dark: variant is needed.
 *
 * 2. Legacy ramps — gray / blue / teal / green / emerald / red / amber / yellow are re-pointed to the
 *    same palette so the existing screens pick up the new look before they are rewritten. Do not use
 *    raw ramps in new code; replace them with semantic tokens as screens are redesigned.
 */

const token = (name) => `rgb(var(--so-${name}) / <alpha-value>)`;

// Cool neutral built on the "ink" navy
const ink = {
  50: '#F4F7FC',
  100: '#EAEFF7',
  200: '#D8E0EC',
  300: '#B8C3D6',
  400: '#8A99B3',
  500: '#5B6B86',
  600: '#43536F',
  700: '#2E3D58',
  800: '#1C2A43',
  900: '#16253F',
  950: '#0E1A2E',
};

// Periwinkle: connections and links (replaces the old blue)
const periwinkle = {
  50: '#EEF1FC',
  100: '#DDE3FA',
  200: '#BCC6F4',
  300: '#9AA8F0',
  400: '#7486E2',
  500: '#5468D4',
  600: '#4557C4',
  700: '#3946A3',
  800: '#2F3A82',
  900: '#283265',
  950: '#1A2042',
};

// Teal: participation, saving, primary action
const teal = {
  50: '#E6F5F2',
  100: '#C6EAE3',
  200: '#93D6CA',
  300: '#5BBFAE',
  400: '#2BA99A',
  500: '#12917F',
  600: '#087F71',
  700: '#08675C',
  800: '#0A524A',
  900: '#0B433D',
  950: '#042824',
};

// SOS red
const sos = {
  50: '#FCEEEE',
  100: '#F8DADA',
  200: '#F0B5B6',
  300: '#E58789',
  400: '#D9575B',
  500: '#CC4549',
  600: '#C43E42',
  700: '#A33236',
  800: '#85292D',
  900: '#6E2427',
  950: '#3C1012',
};

// Warm accent, used sparingly
const warm = {
  50: '#FDF6E9',
  100: '#FBEBCB',
  200: '#F7D9A0',
  300: '#F2BE68',
  400: '#EAA845',
  500: '#D98F2B',
  600: '#B8731F',
  700: '#93591C',
  800: '#77471D',
  900: '#623B1B',
  950: '#381E0B',
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Semantic tokens
        canvas: token('canvas'),
        surface: { DEFAULT: token('surface'), 2: token('surface-2') },
        ink: { DEFAULT: token('ink'), muted: token('ink-muted'), subtle: token('ink-subtle') },
        line: { DEFAULT: token('line'), strong: token('line-strong') },
        care: { DEFAULT: token('care'), hover: token('care-hover'), soft: token('care-soft'), on: token('on-care') },
        link: { DEFAULT: token('link'), soft: token('link-soft') },
        sos: { DEFAULT: token('sos'), hover: token('sos-hover'), soft: token('sos-soft'), on: token('on-sos') },
        warm: { DEFAULT: token('warm'), soft: token('warm-soft') },
        success: token('care'),
        warning: token('warm'),
        // Legacy ramps re-pointed to the palette
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
      borderRadius: {
        card: '1rem',
      },
      // SO-44: short milestone confirmation; used with motion-safe: only
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
