/** @type {import('tailwindcss').Config} */
export default {
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
