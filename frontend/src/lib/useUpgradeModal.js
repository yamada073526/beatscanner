import { useState } from 'react';
import { trackEvent } from './analytics.js';

/**
 * Centralised upgrade-modal state.
 * Use this hook once in a top-level component and pass the returned handlers down.
 *
 * Usage:
 *   const upgrade = useUpgradeModal();
 *   <button onClick={() => upgrade.open('AI詳細レポート')}>...</button>
 *   <UpgradeModal {...upgrade.props} onOpenSettings={...} />
 */
export function useUpgradeModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [featureName, setFeatureName] = useState('');

  function open(name) {
    setFeatureName(name);
    setIsOpen(true);
    // v142 計測: どの機能 lock が paywall を呼ぶか (= tier 配分の答え合わせ、 CRO verdict)。
    // 全 UpgradeModal 表示の単一集約点。 env 未設定なら no-op。
    trackEvent('paywall_view', { feature_name: name || '' });
  }

  function close() {
    setIsOpen(false);
  }

  return {
    open,
    close,
    // Spread these directly onto <UpgradeModal />
    props: { isOpen, featureName, onClose: close },
  };
}
