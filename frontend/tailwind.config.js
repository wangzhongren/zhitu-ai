/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary:   '#3b82f6',
        'primary-dark': '#2563eb',
        danger:    '#ef4444',
        success:   '#10b981',
        warning:   '#f59e0b',
      },
      animation: {
        'settle-in': 'settleIn 0.4s ease-out forwards',
        'throb': 'throb 2s infinite ease-in-out',
      },
      keyframes: {
        settleIn: {
          from: { transform: 'translateY(8px)', opacity: '0' },
          to:   { transform: 'translateY(0)', opacity: '1' },
        },
        throb: {
          '0%, 100%': { opacity: '0.4' },
          '50%':      { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
