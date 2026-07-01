// 使い捨て計測用: 本番 /api/scanner/universe を Premium auth で取得し .visual/universe.json へ保存。
// browser 非起動・純 fetch (node egress は本番到達)。auth は frontend/.env の DOGFOOD/VITE_SUPABASE_*。
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'node:fs';

const PROD = 'https://beatscanner-production.up.railway.app';
const url = process.env.VITE_SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_ANON_KEY;
const email = process.env.DOGFOOD_TEST_EMAIL;
const password = process.env.DOGFOOD_TEST_PASSWORD;

const supabase = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error || !data?.session) { console.error('login 失敗:', error?.message); process.exit(1); }
const token = data.session.access_token;
console.error('login OK:', email);

const r = await fetch(`${PROD}/api/scanner/universe?universe_size=3000`, {
  headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
});
if (!r.ok) { console.error('universe fetch 失敗:', r.status); process.exit(1); }
const payload = await r.json();
mkdirSync('.visual', { recursive: true });
writeFileSync('.visual/universe.json', JSON.stringify(payload));
const items = payload.items || [];
console.error(`universe 取得 OK: items=${items.length} freshness=${JSON.stringify(payload.freshness || {})}`);
console.error('sample keys:', Object.keys(items[0] || {}).join(','));
process.exit(0);
