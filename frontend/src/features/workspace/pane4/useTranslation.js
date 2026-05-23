/**
 * useTranslation — Pane 4 タイトル翻訳 hook (v102 Sprint B-D)
 *
 * 抽出元: Pane4Inspector.jsx L45-47, L51, L185-218
 *
 * 機能:
 *   - jpEnabled 状態管理 (default true)
 *   - 可視タイトルを translateTexts() でバッチ翻訳 (上位 30 件)
 *   - AbortController + seqId で race guard (v101 Sprint B-abort 着地済)
 *   - translateUnavailable banner (翻訳サービス一時停止検知)
 *
 * 返り値:
 *   { jpEnabled, setJpEnabled, titleTranslations, translateUnavailable }
 */
import { useEffect, useRef, useState } from 'react';
import { translateTexts } from '../../../api.js';

export function useTranslation(visibleTitles) {
  const [jpEnabled, setJpEnabled] = useState(true);
  const [titleTranslations, setTitleTranslations] = useState({});
  const [translateUnavailable, setTranslateUnavailable] = useState(false);
  const translateSeqRef = useRef(0);

  useEffect(() => {
    if (!jpEnabled) return;
    const pending = visibleTitles.filter((v) => v.url && v.title && !titleTranslations[v.url]);
    if (pending.length === 0) return;
    const seq = ++translateSeqRef.current;
    const ctrl = new AbortController();
    (async () => {
      try {
        // v101 Sprint B-abort: signal pass-through で unmount 時に in-flight fetch を中止
        const out = await translateTexts(pending.map((v) => v.title), { signal: ctrl.signal });
        if (seq !== translateSeqRef.current) return; // race guard
        if (!Array.isArray(out)) {
          setTranslateUnavailable(true);
          return;
        }
        const update = {};
        let any = false;
        pending.forEach((v, i) => { if (out[i]) { update[v.url] = out[i]; any = true; } });
        if (any) {
          setTitleTranslations((prev) => ({ ...prev, ...update }));
          setTranslateUnavailable(false);
        } else {
          setTranslateUnavailable(true);
        }
      } catch (e) {
        if (e?.name === 'AbortError') return;
        setTranslateUnavailable(true);
      }
    })();
    return () => { ctrl.abort(); };
  }, [jpEnabled, visibleTitles, titleTranslations]);

  return { jpEnabled, setJpEnabled, titleTranslations, translateUnavailable };
}
