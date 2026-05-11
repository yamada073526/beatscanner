/**
 * Pane 4 / Reading Room 共有の formatting / category helpers.
 * v65 §C-3 で Pane4Inspector.jsx から分離 (pure helpers のみ).
 */
import { TrendingUp, Globe, BarChart3 } from 'lucide-react';

export const CATEGORY_ICON = {
  'マクロ': TrendingUp,
  '地政学': Globe,
  '市場全体': BarChart3,
};

export function getNewsColors(importance, category) {
  if (category === '地政学') {
    return { fg: 'rgb(168, 85, 247)', bg: 'rgba(168, 85, 247, 0.14)', bar: 'rgb(168, 85, 247)' };
  }
  if (importance === 'HIGH') {
    return { fg: 'rgb(245, 158, 11)', bg: 'rgba(245, 158, 11, 0.14)', bar: 'rgb(245, 158, 11)' };
  }
  return { fg: 'rgb(6, 182, 212)', bg: 'rgba(6, 182, 212, 0.14)', bar: 'rgb(6, 182, 212)' };
}

export function pickPrimaryCategory(item) {
  return (Array.isArray(item.tags) && item.tags[0]) || item.category || null;
}

/** 二重防御: backend が SDK 生エラーを取りこぼした場合に friendly 文言へ置換. */
export function sanitizeArticleError(raw) {
  const s = String(raw || '');
  if (!s) return '記事の表示に失敗しました。元記事リンクからご確認ください。';
  const lower = s.toLowerCase();
  if (s.includes('credit_balance') || s.includes('invalid_request_error') || s.includes('Error code:')) {
    return '翻訳サービスが一時的に利用できません。元記事リンクからご確認ください。';
  }
  if (lower.includes('rate_limit') || lower.includes('overloaded') || lower.includes('429')) {
    return 'アクセスが集中しています。少し時間をおいて再試行してください。';
  }
  if (/^[　-鿿＀-￯\s]/.test(s) || s.startsWith('記事') || s.startsWith('本文') || s.startsWith('翻訳') || s.startsWith('アクセス') || s.startsWith('この記事')) {
    return s;
  }
  return '記事の表示に失敗しました。元記事リンクからご確認ください。';
}

export function fmtRelative(iso) {
  if (!iso) return '';
  try {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t) || t <= 0) return '';
    const diff = Math.max(0, Date.now() - t);
    const m = Math.floor(diff / 60_000);
    if (m < 1) return '今';
    if (m < 60) return `${m} 分前`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} 時間前`;
    const d = Math.floor(h / 24);
    return `${d} 日前`;
  } catch { return ''; }
}

/** §round20 鮮度段階表示 (LIVE / fresh / normal / stale). */
export function freshnessStatus(iso) {
  if (!iso) return { label: '', tone: 'muted' };
  try {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t) || t <= 0) return { label: '', tone: 'muted' };
    const diff = Math.max(0, Date.now() - t);
    const m = Math.floor(diff / 60_000);
    if (m < 5) return { label: 'LIVE', tone: 'live' };
    if (m < 30) return { label: `${m} 分前`, tone: 'fresh' };
    if (m < 180) {
      const h = Math.floor(m / 60);
      return { label: h >= 1 ? `${h} 時間前` : `${m} 分前`, tone: 'normal' };
    }
    const h = Math.floor(m / 60);
    if (h < 24) return { label: `${h} 時間前`, tone: 'stale' };
    const d = Math.floor(h / 24);
    return { label: `${d} 日前`, tone: 'stale' };
  } catch { return { label: '', tone: 'muted' }; }
}

/** §round17 attention 量子化 (cluster_size → 24/48/72/100%). */
export function attentionLevel(clusterSize) {
  const cs = Number(clusterSize) || 1;
  if (cs >= 6) return 1.0;
  if (cs >= 4) return 0.75;
  if (cs >= 2) return 0.5;
  return 0.25;
}
