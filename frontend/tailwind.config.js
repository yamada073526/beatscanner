/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "media",
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        pass: '#22c55e',
        fail: '#ef4444',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
