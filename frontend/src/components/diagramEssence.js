/**
 * diagramEssence.js — Pane3 図解の「詳しく見る」累進開示 flag。
 *
 * 経緯: 当初は図解最上段に「一言で言うと」essence hero を出す flag だったが、会社概要セクションと
 * 内容が重複し劣化コピーになっていたため essence hero は撤去 (2026-06-14 user feedback)。
 * 現在は flag `?diagram_essence=1` で「下層 L3 (成長トレンド/アナリスト予想/強み 等) を『詳しく見る』で畳む」
 * 累進開示のみを制御する (DiagramCard.jsx の l3Enabled が本 flag を参照)。default OFF・完全可逆。
 */

// flag: ?diagram_essence=1 で有効・default OFF (pane3_v2 と同型の URL→storage 永続化)。
// URL param を最優先で読み、見たら localStorage に persist する (app 内 navigation で param が
// 書き換わっても維持)。=0 で即 OFF (storage も削除)、param 無しは storage 値を引き継ぐ。完全可逆。
export function isDiagramEssence() {
  if (typeof window === 'undefined') return false;
  try {
    const urlParam = new URLSearchParams(window.location.search).get('diagram_essence');
    if (urlParam === '1') {
      try { window.localStorage.setItem('diagram_essence', '1'); } catch { /* private mode 等は silent */ }
      return true;
    }
    if (urlParam === '0') {
      try { window.localStorage.removeItem('diagram_essence'); } catch { /* silent */ }
      return false;
    }
    return window.localStorage?.getItem('diagram_essence') === '1';
  } catch {
    return false;
  }
}
