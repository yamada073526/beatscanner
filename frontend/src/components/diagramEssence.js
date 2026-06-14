/**
 * diagramEssence.js — Pane3 図解の「詳しく見る」累進開示 flag。
 *
 * 経緯: 当初は図解最上段に「一言で言うと」essence hero を出す flag だったが、会社概要セクションと
 * 内容が重複し劣化コピーになっていたため essence hero は撤去 (2026-06-14 user feedback)。
 * 現在は flag で「下層 L3 (成長トレンド/アナリスト予想/強み 等) を『詳しく見る』で畳む」累進開示のみを
 * 制御する (DiagramCard.jsx の l3Enabled が本 flag を参照)。
 * 2026-06-15 user 要望「図解が長いので途中で畳めるように」で **default ON 昇格**。`?diagram_essence=0` が
 * kill switch (storage に '0' を永続)。完全可逆。
 */

// flag: default ON。`?diagram_essence=0` で kill (pane3_v2 と同型の URL→storage 永続化)。
// URL param を最優先で読み persist。=1/=0 で明示制御、param 無しは storage 値を引き継ぐ
// (storage='0' のときだけ OFF、それ以外=未設定/'1' は default ON)。完全可逆。
export function isDiagramEssence() {
  if (typeof window === 'undefined') return true;  // default ON
  try {
    const urlParam = new URLSearchParams(window.location.search).get('diagram_essence');
    if (urlParam === '1') {
      try { window.localStorage.setItem('diagram_essence', '1'); } catch { /* private mode 等は silent */ }
      return true;
    }
    if (urlParam === '0') {
      try { window.localStorage.setItem('diagram_essence', '0'); } catch { /* silent */ }
      return false;
    }
    return window.localStorage?.getItem('diagram_essence') !== '0';  // default ON、'0' 永続時のみ OFF
  } catch {
    return true;
  }
}
