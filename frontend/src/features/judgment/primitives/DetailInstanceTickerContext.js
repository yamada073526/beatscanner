import { createContext } from 'react';

/**
 * DetailInstanceTickerContext — C-3 keep-mounted (v198、 user dogfood 2026-06-10)
 *
 * DetailStack は競合ナビの各 ticker ごとに <JudgmentDetail> を mount し続け (keep-mounted)、
 * active な 1 つだけ表示する。 この構造下で各 instance 配下の AccordionSection が
 * 「自 instance の ticker」 を知るための context。
 *
 * 真因 (本 context が解決するバグ): AccordionSection の C-3 開閉永続化は GLOBAL workspaceStore.activeTicker
 *   を key/effect dep に使っていた。 keep-mounted では activeTicker が別 ticker (競合 B) に変わると、
 *   hidden 側の instance (元銘柄 A) の accordion まで effect が発火し loadAccOpen(B) で「B の状態 (既定 false)」
 *   を読んで閉じてしまう。 戻ると reopen → framer-motion の height:0→auto が ProfileCard 描画途中の
 *   短い高さを測定して lock → 会社概要が clip され、 下のチャート等を push (user 報告「チャートが伸びる」)。
 *
 * 解決: JudgmentDetail がこの context に「自 instance の固定 ticker (tickerOverride 解決済 selectedTicker)」
 *   を流す。 AccordionSection はこれを優先し (未提供時のみ activeTicker に fallback) loadAccOpen/saveAccOpen/
 *   effect dep に使う。 keep-mounted instance の ticker は固定なので、 別 ticker への遷移で effect が
 *   spurious 発火せず accordion が閉じない → reopen による height 誤測定 clip が消える。
 *
 * 未提供 (単一 JudgmentDetail path = screener/indices 等) では null → 従来どおり activeTicker fallback (無回帰)。
 */
export const DetailInstanceTickerContext = createContext(null);
