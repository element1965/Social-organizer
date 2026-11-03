/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
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
