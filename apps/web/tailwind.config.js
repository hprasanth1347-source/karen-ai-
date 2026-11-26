/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: {
          DEFAULT: 'var(--cream)',
          50: 'var(--cream-50)',
          100: 'var(--cream-100)',
          200: 'var(--cream-200)',
        },
        surface: 'var(--surface)',
        coral: { DEFAULT: 'var(--coral)', 400: '#FF8E8E', 500: 'var(--coral)', 600: 'var(--coral-hover)', 700: '#E53E3E' },
        teal: { DEFAULT: 'var(--teal)', 400: '#38C9E8', 500: 'var(--teal)', 600: 'var(--teal-hover)' },
        electric: { DEFAULT: '#7C3AED', 400: '#9A5CF7', 500: '#7C3AED', 600: '#6025D1' },
        yellow: { DEFAULT: 'var(--yellow)', 400: '#FDE68A', 500: 'var(--yellow)', 600: '#F59E0B' },
        magenta: { DEFAULT: '#EC4899', 400: '#F472B6', 500: '#EC4899', 600: '#DB2777' },
        mint: { DEFAULT: 'var(--mint)', 400: '#34D399', 500: 'var(--mint)', 600: '#059669' },
        ink: { DEFAULT: 'var(--ink)', light: '#1A1A1A', muted: 'var(--ink-muted)' },
        danger: 'var(--danger)',
        warning: 'var(--warning)',
        success: 'var(--success)',
        info: 'var(--info)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      boxShadow: {
        brutal: '4px 4px 0px var(--shadow-color)',
        'brutal-sm': '2px 2px 0px var(--shadow-color)',
        'brutal-lg': '6px 6px 0px var(--shadow-color)',
        'brutal-xl': '8px 8px 0px var(--shadow-color)',
        'brutal-coral': '4px 4px 0px var(--coral)',
        'brutal-teal': '4px 4px 0px var(--teal)',
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
