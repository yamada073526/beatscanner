import { useEffect, useState, useCallback } from 'react';

/**
 * Global ⌘K / Ctrl+K で開閉するコマンドパレット用 state hook.
 * design_recipes.md §C-7 「Modern Pattern Mandate」の Cmd Palette 該当.
 */
export function useCmdPalette() {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);
  const openPalette = useCallback(() => setOpen(true), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    const onKey = (e) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        // capture: true で他の listener (例: JudgmentSearchBar の local ⌘K) より先に発火
        e.stopPropagation();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [toggle]);

  return { open, openPalette, close, toggle };
}
