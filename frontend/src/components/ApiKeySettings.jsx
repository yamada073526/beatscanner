import { useState } from 'react';
import { getFmpKey, setFmpKey, getMaskedKey } from '../lib/fmpKey.js';
import { validateFmpKey } from '../api.js';

function StepDot({ index, current }) {
  const done = index < current;
  const active = index === current;
  return (
    <div className="flex items-center">
      <div
        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
          done
            ? 'bg-green-500 text-white'
            : active
            ? 'bg-slate-900 text-white'
            : 'bg-slate-200 text-slate-400'
        }`}
      >
        {done ? '✓' : index + 1}
      </div>
    </div>
  );
}

function StepConnector({ done }) {
  return (
    <div className={`h-0.5 flex-1 transition-colors ${done ? 'bg-green-400' : 'bg-slate-200'}`} />
  );
}

export default function ApiKeySettings({ onClose, onSaved, onDeleted }) {
  const [step, setStep] = useState(0); // 0, 1, 2
  const [inputKey, setInputKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const masked = getMaskedKey();

  const STEPS = ['FMP登録', 'キーをコピー', '貼り付けて完了'];

  async function handleSave() {
    const key = inputKey.trim();
    if (!key) {
      setError('APIキーを入力してください');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await validateFmpKey(key);
      if (result.valid) {
        setFmpKey(key);
        setSavedSuccess(true);
        setInputKey('');
        onSaved?.();
      } else {
        setError(result.error || '無効なAPIキーです');
      }
    } catch {
      setError('検証に失敗しました。しばらく待ってから再試行してください。');
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    setFmpKey('');
    setSavedSuccess(false);
    setStep(0);
    onSaved?.();
    onDeleted?.();  // triggers toast + modal close in parent
  }

  function handleDeleteWithConfirm() {
    if (window.confirm('APIキーを削除するとデモモードに戻ります。よろしいですか？')) {
      handleDelete();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">FMP APIキーの設定</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-0 px-6 py-4">
          {STEPS.map((label, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full items-center">
                {i > 0 && <StepConnector done={i <= step} />}
                <StepDot index={i} current={step} />
                {i < STEPS.length - 1 && <StepConnector done={i < step} />}
              </div>
              <span className={`text-[10px] font-medium ${step === i ? 'text-slate-700' : 'text-slate-400'}`}>
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Delete link — visible in all steps when a key is already stored */}
        {masked && !savedSuccess && (
          <div className="flex items-center justify-between border-t border-slate-100 px-6 py-2">
            <span className="text-xs text-slate-400">現在のキー: {masked}</span>
            <button
              onClick={handleDeleteWithConfirm}
              className="text-xs text-slate-400 hover:text-red-500 transition-colors"
            >
              APIキーを削除してデモモードに戻る
            </button>
          </div>
        )}

        {/* Step content */}
        <div className="px-6 pb-6">

          {/* ── Step 0: FMP登録 ── */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <h3 className="mb-1 text-sm font-semibold text-slate-900">
                  ステップ1: FMPに無料登録
                </h3>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
                  <p className="mb-2">
                    FMP（Financial Modeling Prep）は米国株の財務データを提供する無料サービスです。
                  </p>
                  <ul className="space-y-1 text-xs text-slate-500">
                    <li>✅ 登録はメールアドレスのみ</li>
                    <li>✅ クレジットカード不要</li>
                    <li>✅ 無料プランで全機能を利用可能</li>
                  </ul>
                </div>
              </div>
              <a
                href="https://financialmodelingprep.com/register"
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 py-3 text-sm font-medium text-blue-700 hover:bg-blue-100"
              >
                FMPに無料登録する ↗
              </a>
              <div className="flex items-center justify-between">
                <button
                  onClick={onClose}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  あとでスキップ
                </button>
                <button
                  onClick={() => setStep(1)}
                  className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700"
                >
                  登録が完了したら → 次へ
                </button>
              </div>
            </div>
          )}

          {/* ── Step 1: APIキーをコピー ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="mb-1 text-sm font-semibold text-slate-900">
                  ステップ2: APIキーをコピー
                </h3>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <p className="mb-3 text-sm text-slate-600">
                    FMPにログイン後、以下の手順でAPIキーをコピーしてください。
                  </p>
                  <ol className="space-y-2 text-xs text-slate-500">
                    <li className="flex gap-2">
                      <span className="font-semibold text-slate-700">①</span>
                      <span>右上のアカウントアイコンをクリック</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-semibold text-slate-700">②</span>
                      <span>「Dashboard」または「API Key」を選択</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="font-semibold text-slate-700">③</span>
                      <span>表示されたAPIキー（英数字の文字列）をコピー</span>
                    </li>
                  </ol>
                  <a
                    href="https://financialmodelingprep.com/developer/docs/dashboard"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center text-xs text-blue-600 hover:underline"
                  >
                    FMP Dashboardを開く ↗
                  </a>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setStep(0)}
                  className="text-sm text-slate-400 hover:text-slate-600"
                >
                  ← 戻る
                </button>
                <button
                  onClick={() => setStep(2)}
                  className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700"
                >
                  コピーできた → 次へ
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: 貼り付けて保存 ── */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="mb-1 text-sm font-semibold text-slate-900">
                  ステップ3: APIキーを貼り付けて完了
                </h3>
                {savedSuccess ? (
                  <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
                    <p className="text-2xl mb-1">✅</p>
                    <p className="font-medium text-green-700">設定完了！</p>
                    <p className="mt-1 text-sm text-green-600">
                      接続済み ({getMaskedKey()})
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={inputKey}
                        onChange={(e) => setInputKey(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                        placeholder="コピーしたAPIキーを貼り付け..."
                        className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                        autoFocus
                      />
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                      >
                        {saving ? '検証中...' : '保存'}
                      </button>
                    </div>
                    {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
                    <p className="mt-2 flex items-center gap-1 text-xs text-slate-400">
                      🔒 キーはお使いのブラウザにのみ保存されます。外部に共有されることはありません。
                    </p>
                  </div>
                )}
              </div>

              {/* 現在のキー表示（削除は下部の共通リンクから） */}
              {(masked && !savedSuccess) && (
                <div className="rounded-lg bg-green-50 px-4 py-2.5">
                  <span className="text-sm text-green-700">✅ 現在のキー: {masked}</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                {!savedSuccess && (
                  <button
                    onClick={() => setStep(1)}
                    className="text-sm text-slate-400 hover:text-slate-600"
                  >
                    ← 戻る
                  </button>
                )}
                {savedSuccess && (
                  <div className="flex w-full justify-center">
                    <button
                      onClick={onClose}
                      className="rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
                    >
                      使い始める →
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
