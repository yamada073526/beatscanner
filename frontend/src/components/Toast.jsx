/**
 * Toast — handover v82 Phase 5.5 (営業利益増 condition の全 step fallback)
 *
 * @no-llm — このコンポーネントは LLM SDK を一切呼ばない。
 *
 * multi-review UI/UX verdict: 営業利益増 (condition 4) は businessFlowSteps 全体に該当するため
 * 個別 step pulse は visual ノイズ最大化 (全 step pulse = 何も pulse してないのと同じ視覚効果)。
 * 代わりに toast「営業利益増は全工程に影響します」 を 2.8s 表示する fallback (UI/UX verdict)。
 *
 * minimal custom 実装 (sonner / react-hot-toast の依存追加なし)。 視認性最優先で:
 * - position: fixed bottom-center
 * - opacity transition (transform 一切触らない、 feedback_press_feedback_delta.md 厳守)
 * - 2.8s 自動消去 (UI/UX cadence 1.8s × 1.5 周期相当)
 *
 * memory:
 *   - feedback_press_feedback_delta.md (transform 禁止、 opacity のみ)
 *   - feedback_brand_aspiration.md (Aman 級「呼吸」 cadence)
 */
import { useEffect, useState } from 'react';

/**
 * @param {object} props
 * @param {string|null} props.message - null なら非表示、 string なら表示
 * @param {number} [props.duration=2800] - 自動消去までの ms
 * @param {() => void} [props.onDismiss] - 消去時 callback
 */
export default function Toast({ message, duration = 2800, onDismiss }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return undefined;
    }
    // mount 直後に opacity 0 → 1 (1 frame 遅らせて transition trigger)
    const showT = setTimeout(() => setVisible(true), 10);
    const hideT = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, duration);
    return () => {
      clearTimeout(showT);
      clearTimeout(hideT);
    };
  }, [message, duration, onDismiss]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bs-toast"
      data-visible={visible ? 'true' : undefined}
    >
      {message}
    </div>
  );
}
