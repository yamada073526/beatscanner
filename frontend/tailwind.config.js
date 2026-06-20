/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "media",
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // content scanner が JS コメント内の Python slice 記法 (例: volumes[-51:-1] /
  // prices[-50:]) を arbitrary-property クラスと誤抽出し、無効な CSS (`-51: -1`) を
  // 生成して build warning を出す。該当コメントは backend `_detect_breakout` との
  // grep 物理一致が目的でトークンを崩したくないため、ここで誤抽出クラスを除外する。
  blocklist: ['[-51:-1]', '[-50:]'],
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
