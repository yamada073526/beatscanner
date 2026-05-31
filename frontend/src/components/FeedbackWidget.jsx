/**
 * FeedbackWidget — pre-release ユーザーの声を集める軽量フィードバック導線.
 *
 * 動画教訓 #2 (3体合議推奨 #1): 最初のユーザーの生声を集めて改善駆動する。
 * 自己完結 (fixed entry button + modal + 状態) で App に 1 行 mount するだけ。
 *
 * 設計方針:
 *   - entry は faint / 控えめ (Aman 級ブランド: 静けさを壊さない、 5 原則 #1 読み手の負担減)
 *   - 色ルール遵守: cyan は使わない (entry は neutral slate)
 *   - category は Chip primitive (自前 div chip 禁止、 chip_primitive_canonical)
 *   - modal shell は既存 QuickAddHoldingModal の idiom 踏襲 (Tailwind slate/white + dark:)
 *   - 過剰実装回避 (MVP): 本文必須 + category 3 種 + 匿名時のみ任意 email
 *   - Trust Cliff: 「必ず反映」 等の過約束をしない (「参考にします」 に留める)
 *
 * Props:
 *   user: Supabase User | null  — 未ログインなら email 任意入力欄を出す
 */
import { useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { submitFeedback } from '../api.js';
import Chip from './ui/Chip.jsx';

const CATEGORIES = [
  { key: 'bug', label: '不具合' },
  { key: 'feature', label: '要望' },
  { key: 'other', label: 'その他' },
];

export default function FeedbackWidget({ user = null }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('feature');
  const [body, setBody] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setCategory('feature');
    setBody('');
    setEmail('');
    setSubmitting(false);
    setDone(false);
    setError('');
  }

  function close() {
    setOpen(false);
    // 閉じアニメーション待たず即 reset (次回 open 時にクリーン)
    reset();
  }

  async function handleSubmit() {
    const msg = body.trim();
    if (!msg) { setError('内容を入力してください'); return; }
    setSubmitting(true);
    setError('');
    try {
      await submitFeedback({
        category,
        body: msg,
        page_path: typeof window !== 'undefined' ? window.location.pathname : null,
        email: !user && email.trim() ? email.trim() : null,
      });
      setDone(true);
    } catch (e) {
      setError(e?.message || '送信に失敗しました。時間をおいて再試行してください');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Entry: faint fixed pill (bottom-right)。 modal (z-50) より下の z-40。 */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="フィードバックを送る"
          className="fixed bottom-5 right-5 z-40 flex items-center gap-1.5 rounded-full border border-slate-300/70 bg-white/80 px-3 py-2 text-xs font-medium text-slate-500 shadow-sm backdrop-blur transition hover:text-slate-800 hover:border-slate-400 dark:border-slate-600/70 dark:bg-slate-800/80 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <MessageSquare size={14} strokeWidth={1.75} aria-hidden />
          <span className="hidden sm:inline">ご意見</span>
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800"
            style={{ maxHeight: '92dvh', overflowY: 'auto' }}
          >
            {/* Header */}
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="feedback-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  ご意見・ご要望
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  気づいたこと・改善してほしい点をお聞かせください
                </p>
              </div>
              <button
                onClick={close}
                aria-label="閉じる"
                className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
              >
                <X size={18} strokeWidth={1.75} aria-hidden />
              </button>
            </div>

            {done ? (
              /* 成功状態: 過約束しない (Trust Cliff) */
              <div className="py-6 text-center">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  ありがとうございます
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  いただいた声は今後の改善の参考にします。
                </p>
                <button
                  onClick={close}
                  className="mt-5 rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                  閉じる
                </button>
              </div>
            ) : (
              <>
                {/* Category */}
                <div className="mb-3">
                  <span className="mb-2 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    種類
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {CATEGORIES.map((c) => (
                      <Chip
                        key={c.key}
                        size="sm"
                        variant="segmented"
                        tone={category === c.key ? 'accent' : 'muted'}
                        pressed={category === c.key}
                        onClick={() => setCategory(c.key)}
                      >
                        {c.label}
                      </Chip>
                    ))}
                  </div>
                </div>

                {/* Body */}
                <div className="mb-3">
                  <label htmlFor="feedback-body" className="mb-2 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    内容
                  </label>
                  <textarea
                    id="feedback-body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={4}
                    maxLength={2000}
                    autoFocus
                    placeholder="例: ○○の画面で△△が分かりにくい / □□の機能が欲しい"
                    className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>

                {/* 匿名時のみ: 返信先メール (任意) */}
                {!user && (
                  <div className="mb-3">
                    <label htmlFor="feedback-email" className="mb-2 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      返信先メール <span className="text-slate-400">(任意)</span>
                    </label>
                    <input
                      id="feedback-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="返信が必要な場合のみ"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                )}

                {error && (
                  <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300">
                    {error}
                  </div>
                )}

                {/* Footer */}
                <div className="flex gap-3">
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !body.trim()}
                    className="flex-1 rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                  >
                    {submitting ? '送信中...' : '送信する'}
                  </button>
                  <button
                    onClick={close}
                    disabled={submitting}
                    className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200"
                  >
                    キャンセル
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
