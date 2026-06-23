import js from "@eslint/js";
import globals from "globals";

export default [
  // js.configs.recommended は .js のみ対象なので files で JSX も明示
  {
    ...js.configs.recommended,
    files: ["src/**/*.{js,jsx,mjs,cjs}"],
  },
  {
    // React JSX + ブラウザ環境向け設定
    files: ["src/**/*.{js,jsx,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.es2021,
        // Vite の import.meta.env / Node scripts で使われる process を認識
        process: "readonly",
      },
    },
    rules: {
      // ─── Dead code 検出 (このルール追加の目的) ──────────────────────
      // 定義したが一度も呼ばれない関数・変数を warn にして既存コードを壊さない。
      // pre-commit hook (scripts/pre-commit) 内で変更ファイルのみ error 扱いで再検査する
      // ことで、新規の dead code をコミット前に弾く（段階導入方式）。
      // 将来: 既存 162 件を修正し切ったら "error" に昇格する。
      "no-unused-vars": [
        "warn",
        {
          vars: "all",
          args: "after-used",
          ignoreRestSiblings: true,
          destructuredArrayIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // ─── 既存コードとの共存 (ノイズ抑制) ───────────────────────────
      // react-hooks は未インストールのため off
      "react-hooks/exhaustive-deps": "off",
      // no-undef は globals で補いきれない Node 系シンボルが多いため warn
      "no-undef": "warn",
      // useless-escape は warn に留める
      "no-useless-escape": "warn",
    },
  },
];
