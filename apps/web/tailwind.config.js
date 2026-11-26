/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cream:   { DEFAULT: '#FAF7F0', 50: '#FDFCF8', 100: '#FAF7F0', 200: '#F5EFE0' },
        surface: '#FFFFFF',
        coral:   { DEFAULT: '#FF6B6B', 400: '#FF8E8E', 500: '#FF6B6B', 600: '#FF4949', 700: '#E53E3E' },
        teal:    { DEFAULT: '#00B4D8', 400: '#38C9E8', 500: '#00B4D8', 600: '#0096B4' },
        electric:{ DEFAULT: '#7C3AED', 400: '#9A5CF7', 500: '#7C3AED', 600: '#6025D1' },
        yellow:  { DEFAULT: '#FCD34D', 400: '#FDE68A', 500: '#FCD34D', 600: '#F59E0B' },
        magenta: { DEFAULT: '#EC4899', 400: '#F472B6', 500: '#EC4899', 600: '#DB2777' },
        mint:    { DEFAULT: '#10B981', 400: '#34D399', 500: '#10B981', 600: '#059669' },
        ink:     { DEFAULT: '#0A0A0A', light: '#1A1A1A', muted: '#6B7280' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      boxShadow: {
        brutal:    '4px 4px 0px #0A0A0A',
        'brutal-sm':'2px 2px 0px #0A0A0A',
        'brutal-lg':'6px 6px 0px #0A0A0A',
        'brutal-xl':'8px 8px 0px #0A0A0A',
        'brutal-coral':'4px 4px 0px #FF6B6B',
        'brutal-teal': '4px 4px 0px #00B4D8',
      },
      borderWidth: { DEFAULT: '2px', '3': '3px', '4': '4px' },
      borderRadius: { brutal: '2px' },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'bounce-subtle': 'bounce 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
