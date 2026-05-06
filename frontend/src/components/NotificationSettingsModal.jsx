import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import {
  fetchPreferences,
  savePreferences,
  validatePreferences,
  getDefaultPreferences,
} from '../lib/notifications.js';
import { sendNotificationTest, fetchRecentNotificationLog } from '../api.js';

/**
 * Y-3 Phase A: 通知設定モーダル
 *
 * - Email / LINE / Webhook の 3 チャネルを ON/OFF
 * - 通知トリガ (保有銘柄の決算 / 毎朝のブリーフ) を選択
 * - テスト送信ボタンで設定の保存確認 (Phase A は実送信せず log のみ)
 *
 * Phase B (Email/Resend) / C (LINE) / D (Webhook 配信) で実送信を有効化する前提。
 * 各チャネルには「Phase X で実装予定」の注意文言を表示し、ユーザーの誤期待を防ぐ。
 */
export default function NotificationSettingsModal({ isOpen, user, onClose }) {
  const [prefs, setPrefs] = useState(() => getDefaultPreferences());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState(null);
  const [recentLog, setRecentLog] = useState([]);
  const [testingChannel, setTestingChannel] = useState(null);
  // レビュー指摘 (Web 設計 #4): focus trap.
  // 親 (App) が onClose をインライン生成するため、dep に入れると毎レンダで
  // effect cleanup が走り「focus 復元 → モーダル外」が暴発する。
  // → onClose は ref 経由で参照、focus 管理 effect は isOpen のみに依存させる。
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // 初回ロード
  useEffect(() => {
    if (!isOpen || !user?.id) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const data = await fetchPreferences(supabase, user.id);
      if (cancelled) return;
      if (data) {
        setPrefs({
          email_enabled: !!data.email_enabled,
          email_address: data.email_address || user.email || '',
          line_enabled: !!data.line_enabled,
          line_user_id: data.line_user_id || '',
          webhook_enabled: !!data.webhook_enabled,
          webhook_url: data.webhook_url || '',
          webhook_type: data.webhook_type || 'slack',
          earnings_alerts: data.earnings_alerts ?? true,
          daily_brief: !!data.daily_brief,
        });
      } else {
        // 初回はデフォルト + ログイン Email を email_address に prefill
        setPrefs({ ...getDefaultPreferences(), email_address: user.email || '' });
      }
      setLoading(false);
      // 直近ログも取得
      const log = await fetchRecentNotificationLog(supabase, 5);
      if (!cancelled) setRecentLog(log?.logs || []);
    })();
    return () => { cancelled = true; };
  }, [isOpen, user?.id, user?.email]);

  // ── Focus 管理: open 時に最初の focusable へ移動、close 時に開く前の要素へ復帰
  //    `onClose` を dep に入れると親再レンダ毎に cleanup→focus 復元が暴発するため、
  //    isOpen のみを dep にして真の open/close 遷移時だけ走らせる。
  useEffect(() => {
    if (!isOpen) return;

    // クロージャで保持 → 再レンダで上書きされない
    const previouslyFocused = (typeof document !== 'undefined') ? document.activeElement : null;

    // lazy chunk + Suspense で DOM 確定が遅れることがあるので 50ms 後に focus
    const focusTimer = setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const els = panel.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (els[0]) {
        try { els[0].focus({ preventScroll: true }); } catch { /* noop */ }
      }
    }, 50);

    return () => {
      clearTimeout(focusTimer);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        try { previouslyFocused.focus({ preventScroll: true }); } catch { /* noop */ }
      }
    };
  }, [isOpen]);

  // ── キー操作: ESC で閉じる + Tab/Shift+Tab で focus trap
  //    onClose は ref 経由で参照するので dep から外せる。
  //    keydown リスナーは isOpen=true の間だけ登録し、親再レンダで剥がれない。
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(
        panel.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  if (!isOpen) return null;

  const setField = (k, v) => {
    setPrefs((p) => ({ ...p, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined, _global: undefined }));
  };

  const handleSave = async () => {
    const v = validatePreferences(prefs);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setSaving(true);
    try {
      await savePreferences(supabase, user.id, prefs);
      setToast({ type: 'success', text: '通知設定を保存しました' });
      // 保存成功 → 0.8 秒後に自動クローズ (toast を読む時間を確保)
      setTimeout(() => onClose?.(), 800);
    } catch (e) {
      setToast({ type: 'error', text: e?.message || '保存に失敗しました' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (channel) => {
    setTestingChannel(channel);
    try {
      const res = await sendNotificationTest(supabase, channel);
      setToast({ type: 'success', text: res?.message || `${channel} のテスト送信を記録しました` });
      const log = await fetchRecentNotificationLog(supabase, 5);
      setRecentLog(log?.logs || []);
    } catch (e) {
      setToast({ type: 'error', text: e?.message || 'テスト送信に失敗しました' });
    } finally {
      setTestingChannel(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel notif-modal"
        onClick={(e) => e.stopPropagation()}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="notif-modal-title"
      >
        <div className="modal-header">
          <h2 id="notif-modal-title">🔔 通知設定</h2>
          <button onClick={onClose} className="modal-close" aria-label="閉じる">×</button>
        </div>

        <div className="modal-body notif-body">
          {loading ? (
            <p className="notif-loading">読込中...</p>
          ) : (
            <>
              {/* ── Phase 案内バナー ── */}
              <div className="notif-phase-banner" role="note">
                <strong>Phase A:</strong> 設定の保存とテスト送信ログ記録のみ動作します。
                実送信 (Email / LINE / Webhook) は Phase B/C/D で順次有効化予定。
              </div>

              {/* ── 通知トリガ ── */}
              <fieldset className="notif-fieldset">
                <legend>通知トリガ</legend>
                <label className="notif-toggle">
                  <input
                    type="checkbox"
                    checked={prefs.earnings_alerts}
                    onChange={(e) => setField('earnings_alerts', e.target.checked)}
                  />
                  <span className="notif-toggle-text">
                    <span className="notif-toggle-title">保有銘柄の決算リリース</span>
                    <span className="notif-toggle-desc">保有中の銘柄が決算を発表したら通知</span>
                  </span>
                </label>
                <label className="notif-toggle">
                  <input
                    type="checkbox"
                    checked={prefs.daily_brief}
                    onChange={(e) => setField('daily_brief', e.target.checked)}
                  />
                  <span className="notif-toggle-text">
                    <span className="notif-toggle-title">毎朝のブリーフ</span>
                    <span className="notif-toggle-desc">今日の経済指標 + 保有銘柄の動きをまとめて配信</span>
                  </span>
                </label>
                {errors._global && <p className="notif-err">{errors._global}</p>}
              </fieldset>

              {/* ── Email チャネル (Trust Cliff 対策で disabled) ── */}
              <fieldset className="notif-fieldset notif-fieldset-disabled">
                <legend>
                  📧 Email
                  <span className="notif-coming-soon" aria-label="準備中">準備中</span>
                </legend>
                <label className="notif-toggle">
                  <input
                    type="checkbox"
                    checked={false}
                    disabled
                  />
                  <span className="notif-toggle-text">
                    <span className="notif-toggle-title">Email 通知</span>
                    <span className="notif-toggle-desc">Resend 経由の実送信を準備中。リリース後に有効化されます。</span>
                  </span>
                </label>
              </fieldset>

              {/* ── Webhook チャネル (Trust Cliff 対策で disabled) ── */}
              <fieldset className="notif-fieldset notif-fieldset-disabled">
                <legend>
                  🔗 Webhook (Slack / Discord)
                  <span className="notif-coming-soon" aria-label="準備中">準備中</span>
                </legend>
                <label className="notif-toggle">
                  <input
                    type="checkbox"
                    checked={false}
                    disabled
                  />
                  <span className="notif-toggle-text">
                    <span className="notif-toggle-title">Webhook 通知</span>
                    <span className="notif-toggle-desc">Slack / Discord の incoming webhook に POST。リリース後に有効化されます。</span>
                  </span>
                </label>
              </fieldset>

              {/* ── LINE チャネル (Trust Cliff 対策で disabled) ── */}
              <fieldset className="notif-fieldset notif-fieldset-disabled">
                <legend>
                  💚 LINE
                  <span className="notif-coming-soon" aria-label="準備中">準備中</span>
                </legend>
                <label className="notif-toggle">
                  <input
                    type="checkbox"
                    checked={false}
                    disabled
                  />
                  <span className="notif-toggle-text">
                    <span className="notif-toggle-title">LINE 通知</span>
                    <span className="notif-toggle-desc">
                      LINE Bot 経由で実送信を準備中。LINE Notify は 2025-03 終了済のため Bot 連携が必要です。
                    </span>
                  </span>
                </label>
              </fieldset>

              {/* ── 直近のテスト履歴 ── */}
              {recentLog.length > 0 && (
                <fieldset className="notif-fieldset">
                  <legend>直近のテスト履歴</legend>
                  <ul className="notif-log-list">
                    {recentLog.map((l) => (
                      <li key={l.id} className="notif-log-row">
                        <span className="notif-log-time">{(l.sent_at || '').slice(0, 19).replace('T', ' ')}</span>
                        <span className="notif-log-channel">[{l.channel}]</span>
                        <span className="notif-log-status">{l.status}</span>
                        <span className="notif-log-trigger">{l.trigger}</span>
                      </li>
                    ))}
                  </ul>
                </fieldset>
              )}

              {/* ── トースト ── */}
              {toast && (
                <div className={`notif-toast notif-toast-${toast.type}`}>
                  {toast.text}
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn-ghost" disabled={saving}>
            閉じる
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={handleSave} className="btn-primary" disabled={saving || loading}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
