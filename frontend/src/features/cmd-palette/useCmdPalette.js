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
      if (!isMod || e.key.toLowerCase() !== 'k') return;
      // macOS IME (Japanese) で Cmd+K は「全角ひらがな → カタカナ変換」のショートカット。
      // IME composition 中 (isComposing=true) や keyCode=229 (IME proxy) のときは
      // パレット開閉を skip して native IME 変換を優先する (handover v68 §2 dogfood fix)。
      if (e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      // capture: true で他の listener (例: JudgmentSearchBar の local ⌘K) より先に発火
      e.stopPropagation();
      toggle();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [toggle]);

  return { open, openPalette, close, toggle };
}
