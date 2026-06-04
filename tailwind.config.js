/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx,html}', './*.html'],
  // media = 自动跟随系统深浅色，无需手动切换 class
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        accent:         '#FF6B4A',
        'accent-hover': '#e85a3a',
        ok:             '#3FB950',
        warn:           '#F0A030',
        error:          '#F85149',

        // 深色模式颜色（通过 CSS 变量实现双主题，见 index.css）
        'bg-deep':    'var(--bg-deep)',
        'bg-card':    'var(--bg-card)',
        'bg-item':    'var(--bg-item)',
        'border-dim': 'var(--border-dim)',
        'text-pri':   'var(--text-pri)',
        'text-sec':   'var(--text-sec)',
      },
      fontFamily: {
        mono: ['"SF Mono"', '"Fira Code"', 'Consolas', 'monospace'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      boxShadow: {
        'gm':    '0 8px 24px -4px var(--shadow)',
        'gm-sm': '0 4px 12px -2px var(--shadow)',
      },
      animation: {
        'fade-up':   'fadeUp 0.25s ease-out',
        'fade-in':   'fadeIn 0.2s ease-out',
        'spin-slow': 'spin 1.4s linear infinite',
      },
      keyframes: {
        fadeUp: { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
      },
    },
  },
  plugins: [],
};
