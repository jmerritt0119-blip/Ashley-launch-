/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        reactor: {
          core: '#7df9ff',
          glow: '#39c7ff',
          deep: '#0a1f2e',
        },
      },
      fontFamily: {
        display: ['var(--font-orbitron)', 'monospace'],
        hud: ['var(--font-rajdhani)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
