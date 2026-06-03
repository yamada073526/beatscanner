// v162 SPEC_2026-06-04_headless-premium-auth-harness:
// テスト Premium user の Supabase session を取得し、 headless browser の localStorage に
// 注入するための entries ([{key, value}]) を返す。 標準 E2E 認証パターン (bypass flag でなく
// 実セッション = security hole なし)。 production app は不変、 harness 専用 lib。
//
// 必要 env (frontend/.env、 gitignore 済 / または shell export):
//   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (public、 app build と同値)
//   DOGFOOD_TEST_EMAIL / DOGFOOD_TEST_PASSWORD (専用テスト Premium アカウント、 非 commit)
// いずれか欠ければ null を返す → 呼出側は demo (未認証) 検証に graceful fallback。
//
// 仕組み: app と同じ default storageKey (`sb-<ref>-auth-token`) で supabase-js に書かせ、
//   書かれた storage entries を捕捉して返す (supabase-js の version 差に robust)。
import { createClient } from '@supabase/supabase-js';

export async function getAuthInjection() {
  const url = process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  const email = process.env.DOGFOOD_TEST_EMAIL;
  const password = process.env.DOGFOOD_TEST_PASSWORD;
  if (!url || !anon || !email || !password) {
    console.error('[auth-helper] env 未設定 (VITE_SUPABASE_URL/ANON_KEY + DOGFOOD_TEST_EMAIL/PASSWORD) → demo 検証に fallback');
    return null;
  }

  // app (frontend/src/lib/supabase.js) は storageKey 未指定 = default。 ここも default に合わせ、
  // 実際に書かれた key/value をそのまま捕捉する (手で `sb-<ref>-auth-token` を組まない = 堅牢)。
  const captured = {};
  const memStorage = {
    getItem: (k) => (k in captured ? captured[k] : null),
    setItem: (k, v) => { captured[k] = v; },
    removeItem: (k) => { delete captured[k]; },
  };

  const supabase = createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: memStorage,
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data?.session) {
    console.error('[auth-helper] signInWithPassword 失敗:', error?.message || 'no session');
    return null;
  }
  // storage 書込を確実化
  await new Promise((r) => setTimeout(r, 80));
  const entries = Object.entries(captured).map(([key, value]) => ({ key, value }));
  if (entries.length === 0) {
    // 念のための fallback: 捕捉できなければ session を直接 default key で組む
    const ref = (() => { try { return new URL(url).hostname.split('.')[0]; } catch { return 'unknown'; } })();
    entries.push({ key: `sb-${ref}-auth-token`, value: JSON.stringify(data.session) });
  }
  console.error(`[auth-helper] login OK: ${email} (注入 entries=${entries.length}, keys=${entries.map((e) => e.key).join(',')})`);
  return entries;
}
