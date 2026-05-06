import { useEffect, useState } from 'react';
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

  // ESC で閉じる
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

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
      <div className="modal-panel notif-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🔔 通知設定</h2>
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

              {/* ── Email チャネル ── */}
              <fieldset className="notif-fieldset">
                <legend>📧 Email</legend>
                <label className="notif-toggle">
                  <input
                    type="checkbox"
                    checked={prefs.email_enabled}
                    onChange={(e) => setField('email_enabled', e.target.checked)}
                  />
                  <span className="notif-toggle-text">
                    <span className="notif-toggle-title">Email 通知を有効にする</span>
                    <span className="notif-toggle-desc">Phase B で Resend 経由の実送信を有効化予定</span>
                  </span>
                </label>
                {prefs.email_enabled && (
                  <>
                    <input
                      type="email"
                      className="notif-input"
                      value={prefs.email_address}
                      onChange={(e) => setField('email_address', e.target.value)}
                      placeholder="例: you@example.com"
                    />
                    {errors.email_address && <p className="notif-err">{errors.email_address}</p>}
                    <button
                      type="button"
                      className="btn-ghost notif-test-btn"
                      onClick={() => handleTest('email')}
                      disabled={testingChannel === 'email'}
                    >
                      {testingChannel === 'email' ? '送信中...' : 'テスト送信 (ログのみ)'}
                    </button>
                  </>
                )}
              </fieldset>

              {/* ── Webhook チャネル ── */}
              <fieldset className="notif-fieldset">
                <legend>🔗 Webhook (Slack / Discord)</legend>
                <label className="notif-toggle">
                  <input
                    type="checkbox"
                    checked={prefs.webhook_enabled}
                    onChange={(e) => setField('webhook_enabled', e.target.checked)}
                  />
                  <span className="notif-toggle-text">
                    <span className="notif-toggle-title">Webhook 通知を有効にする</span>
                    <span className="notif-toggle-desc">Slack / Discord の incoming webhook URL に POST。Phase D で実送信</span>
                  </span>
                </label>
                {prefs.webhook_enabled && (
                  <>
                    <select
                      className="notif-input"
                      value={prefs.webhook_type}
                      onChange={(e) => setField('webhook_type', e.target.value)}
                    >
                      <option value="slack">Slack</option>
                      <option value="discord">Discord</option>
                      <option value="generic">汎用 (JSON POST)</option>
                    </select>
                    <input
                      type="url"
                      className="notif-input"
                      value={prefs.webhook_url}
                      onChange={(e) => setField('webhook_url', e.target.value)}
                      placeholder="https://hooks.slack.com/services/..."
                    />
                    {errors.webhook_url && <p className="notif-err">{errors.webhook_url}</p>}
                    <button
                      type="button"
                      className="btn-ghost notif-test-btn"
                      onClick={() => handleTest('webhook')}
                      disabled={testingChannel === 'webhook'}
                    >
                      {testingChannel === 'webhook' ? '送信中...' : 'テスト送信 (ログのみ)'}
                    </button>
                  </>
                )}
              </fieldset>

              {/* ── LINE チャネル ── */}
              <fieldset className="notif-fieldset">
                <legend>💚 LINE</legend>
                <label className="notif-toggle">
                  <input
                    type="checkbox"
                    checked={prefs.line_enabled}
                    onChange={(e) => setField('line_enabled', e.target.checked)}
                  />
                  <span className="notif-toggle-text">
                    <span className="notif-toggle-title">LINE 通知を有効にする</span>
                    <span className="notif-toggle-desc">
                      Phase C で LINE Bot 経由 (LINE Notify は 2025-03 終了済) で実送信予定
                    </span>
                  </span>
                </label>
                {prefs.line_enabled && (
                  <>
                    <input
                      type="text"
                      className="notif-input"
                      value={prefs.line_user_id}
                      onChange={(e) => setField('line_user_id', e.target.value)}
                      placeholder="LINE userId (Phase C で連携手順を提供)"
                    />
                    {errors.line_user_id && <p className="notif-err">{errors.line_user_id}</p>}
                    <button
                      type="button"
                      className="btn-ghost notif-test-btn"
                      onClick={() => handleTest('line')}
                      disabled={testingChannel === 'line'}
                    >
                      {testingChannel === 'line' ? '送信中...' : 'テスト送信 (ログのみ)'}
                    </button>
                  </>
                )}
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
