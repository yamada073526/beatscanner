import React from 'react';
import { Info, Lightbulb, Ruler, FileText } from 'lucide-react';
import InfoModal from '../../../../components/InfoModal.jsx';

/**
 * FiveConditionsOverviewModal — 「ファンダメンタル 5 条件」全体の評価ロジック解説モーダル
 *
 * 各条件の個別 deep dive は ConditionRow expand 内の「この条件の解説」リンクから別 modal で開く。
 * 本モーダルは「なぜ 5 条件で判定するのか」「5 条件をまとめた哲学」を 1 枚で説明する。
 *
 * 3 体合議 (UI/UX / マーケター / 金融、2026-05-12) で converge: タイトル横 ? chip 配置に統一。
 */
export default function FiveConditionsOverviewModal({ onClose }) {
  return (
    <InfoModal title="ファンダメンタル 5 条件とは" onClose={onClose}>
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-slate-400"><Info size={13} strokeWidth={2} aria-hidden="true" /> 概要</p>
        <p className="text-sm leading-relaxed text-slate-700">
          独自プロトコルに基づく、米国株決算の質を見極めるための 5 つの基準です。
          <strong>「単年だけ良い銘柄」ではなく「持続的に稼ぐ力を持つ銘柄」</strong>を見抜くための足切りチェックリストとして使います。
        </p>
      </div>

      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-slate-400"><Ruler size={13} strokeWidth={2} aria-hidden="true" /> 5 条件の構成</p>
        <ul className="mt-1 space-y-2 text-sm text-slate-700">
          <li>
            <span className="font-semibold text-slate-900">・条件 1: 営業 CF マージン ≥ 15%</span>
            <br />
            企業が事業から現金を生み出す力 (収益体質) の足切り基準。
          </li>
          <li>
            <span className="font-semibold text-slate-900">・条件 2: EPS 連続増加</span>
            <br />
            一株あたり利益が 3 年連続で増加していることで、業績成長の継続性を確認。
          </li>
          <li>
            <span className="font-semibold text-slate-900">・条件 3: CFPS 連続増加</span>
            <br />
            一株あたり営業 CF が 3 年連続で増加していることで、現金収益力の継続性を確認。
          </li>
          <li>
            <span className="font-semibold text-slate-900">・条件 4: 売上高 連続増加</span>
            <br />
            事業規模そのものが拡大していることで、本物の成長企業を選別。
          </li>
          <li>
            <span className="font-semibold text-slate-900">・条件 5: CFPS &gt; EPS (直近期)</span>
            <br />
            利益 (会計操作可) と現金 (会計操作不可) のクロスチェックで、粉飾耐性を確認。
          </li>
        </ul>
      </div>

      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-slate-400"><Lightbulb size={13} strokeWidth={2} aria-hidden="true" /> 5 条件すべて満たす意味</p>
        <p className="text-sm leading-relaxed text-slate-700">
          5 条件すべて PASS の企業は、<strong>「持続的に現金を稼ぎ、会計操作に頼らず、規模も拡大している」</strong>という、
          投資対象として非常に厳しい足切りを通過した銘柄です。一つでも FAIL があれば、その背景を深掘り検討する材料になります。
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          各条件の詳しい背景は、その条件の row を展開して「この条件の解説」リンクから確認できます。
        </p>
      </div>

      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-slate-400"><FileText size={13} strokeWidth={2} aria-hidden="true" /> まとめ</p>
        <p className="text-sm leading-relaxed text-slate-700">
          5 条件は<strong>「大失敗を避ける」ためのリスク回避フィルター</strong>であり、上昇銘柄を保証するものではありません。
          ただし、このフィルターを通過した銘柄から選別することで、投資判断の精度を大きく上げることができます。
        </p>
      </div>
    </InfoModal>
  );
}
