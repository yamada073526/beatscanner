import { useState } from 'react';

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
