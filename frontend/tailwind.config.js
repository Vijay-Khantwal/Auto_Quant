/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0B1020',
        panel: 'rgba(255,255,255,0.05)',
        border: 'rgba(255,255,255,0.10)',
        text: '#E8ECF5',
        muted: '#8B93A7',
        value: '#34D399',
        risk: '#F87171',
        jev: '#60A5FA',
        gold: '#F5C451',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      backdropBlur: {
        glass: '16px',
      },
    },
  },
  plugins: [],
};
