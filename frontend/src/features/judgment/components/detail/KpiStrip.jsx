import React, { useEffect, useRef } from 'react';
import Card from '../../primitives/Card.jsx';
import Stat from '../../primitives/Stat.jsx';
import { useCountUp } from '../../../../hooks/useCountUp.js';
import SectionFade from '../../primitives/SectionFade.jsx';

/**
 * Sticky KPI strip. position: sticky で Hero の直下に貼り付く.
 * design_recipes.md §C-9 数値フォーマット遵守:
 *  - bare % 禁止 → 「YTD」等の時間窓 suffix
 *  - 欠損は `—`
 *  - 正は先頭 `+` (符号は Stat 側で trend に従い色付け)
 *
 * Sprint 1 (Phase 2): wrapper に pane3-numeric class を付与。
 *   Stat プリミティブの .ds-stat__value が tabular-nums を担うが、
 *   wrapper 側でも明示して cascading の二重防御を確保する。
 *
 * Sprint 4 (Phase 2): 案2 number count-up
 *   - $X.XX 形式 (現在値) と +XX.XX% YTD 形式 (リターン) を検出し count-up
 *   - 欠損 (—) はそのまま表示
 *   - useCountUp hook (hooks/useCountUp.js) を活用 (既存実装)
 *   - prefers-reduced-motion: useReducedMotion() true なら即 final value (useCountUp 内で対応済)
 *
 * 案1 section in-view fade-in: SectionFade wrapper を適用
 */

/**
 * 数値文字列をパースして count-up 可能な数値と書式情報を返す。
 * 対応フォーマット:
 *   "$123.45"  → { num: 123.45, prefix: '$', suffix: '', sign: '' }
 *   "+12.34% YTD" → { num: 12.34, prefix: '', suffix: '% YTD', sign: '+' }
 *   "-5.67% YTD" → { num: 5.67, prefix: '', suffix: '% YTD', sign: '-' }
 *   "3/5"     → null (count-up 不可)
 *   "—"       → null (欠損)
 *
 * @param {string} val
 * @returns {{ num: number, prefix: string, suffix: string, sign: string }|null}
 */
function parseKpiValue(val) {
  if (!val || typeof val !== 'string') return null;
  if (val === '—') return null;

  // $X.XX 形式
  const dollarMatch = val.match(/^\$(\d+(?:\.\d+)?)$/);
  if (dollarMatch) {
    const num = parseFloat(dollarMatch[1]);
    if (Number.isFinite(num)) return { num, prefix: '$', suffix: '', sign: '' };
  }

  // +/-XX.XX% YTD / +/-XX.XX% / XX% 形式 (配当性向 / 自社株買い 含む)
  const pctMatch = val.match(/^([+-]?)(\d+(?:\.\d+)?)(%.*)$/);
  if (pctMatch) {
    const num = parseFloat(pctMatch[2]);
    if (Number.isFinite(num)) {
      return { num, prefix: '', suffix: pctMatch[3], sign: pctMatch[1] };
    }
  }

  // v111 UI/UX verdict (議題 2): plain decimal (Forward P/E 17.4 / PEG 0.30 等) count-up 対応
  //   既存 pctMatch / dollarMatch に該当しない純小数を拾う、 必ず数値のみ (整数 or 小数)
  const plainDecimalMatch = val.match(/^(\d+(?:\.\d+)?)$/);
  if (plainDecimalMatch) {
    const num = parseFloat(plainDecimalMatch[1]);
    if (Number.isFinite(num)) return { num, prefix: '', suffix: '', sign: '' };
  }

  return null;
}

/**
 * AnimatedStat — KpiStrip 内の 1 つの KPI を count-up animation で表示する。
 * parseKpiValue が null の場合 (— / 3/5 等) は元の value をそのまま表示する。
 */
function AnimatedStat({ stat }) {
  const parsed = parseKpiValue(stat.value);
  // v111-2 fix: initial mount のみ forceFromZero=true で 0 → target の count-up 確実発火。
  //   現在値 ($X.XX) は initial mount 時に price prefetched 済 → fromRef = target で
  //   useCountUp の同値判定 (Math.abs(from-target)<0.001) で animation skip していた。
  //   subsequent updates (chip 切替 / data update) は forceFromZero=false で natural transition。
  const initialMountRef = useRef(true);
  useEffect(() => {
    initialMountRef.current = false;
  }, []);
  const countedNum = useCountUp(parsed ? parsed.num : null, {
    duration: 600,
    digits: 2,
    forceFromZero: initialMountRef.current,
  });

  let displayValue = stat.value;
  if (parsed && countedNum != null) {
    const absVal = Math.abs(countedNum);
    // v111 UI/UX verdict (議題 2): count-up 中の表示桁を原値の表示桁に合わせる。
    //   17.4 (1 桁) / 0.30 (2 桁) / 98.00 (2 桁) を区別、 final value で原表示と一致。
    const originalDecimals = (() => {
      const m = stat.value?.match(/\.(\d+)/);
      return m ? Math.min(m[1].length, 2) : 0;
    })();
    const formatted = absVal >= 100 && originalDecimals === 0
      ? absVal.toFixed(0)
      : absVal.toFixed(originalDecimals);
    displayValue = `${parsed.prefix}${parsed.sign}${formatted}${parsed.suffix}`;
  }

  return (
    <Stat
      value={displayValue}
      label={stat.label}
      trend={stat.trend}
      verdict={stat.verdict}
      hint={stat.hint}
    />
  );
}

export default function KpiStrip({ stats = [], frameless = false }) {
  return (
    <SectionFade>
      <Card frameless={frameless}>
        {/* v97 Phase H: KpiStrip 大型 number display 刷新
            - padding 16/24 → 24/28 (luxury 余白、 大型数値とのバランス)
            - gridTemplateColumns minmax 120 → 140 (大型数値の確保)
            - 真鍮 accent: 上端に 1px gold hairline (Sprint H1 idiom 統一、 全 panel で brand 一貫性)
            - sticky 維持 (top 56 で SearchBar 直下)
            Phase G Phase 2: frameless mode で sticky / border / background を抑制
              (unified section 内で sticky + bg-card は冗長、 外枠と相互干渉) */}
        {/* v99 dogfood feedback C (3 巡目): 旧 inner pane3-numeric は bg-card + padding 24px の
            「内側 dark box」 が Card 外側 24px padding と二重 stacking、 user 体感「下半分空欄」 主因。
            修正: inner dark box の bg/border/padding を完全削除、 Card padding 24px のみ使用。
            grid layout は維持、 sticky も維持 (KpiStrip の浮遊 idiom を保つ)。 */}
        <div
          className="pane3-numeric"
          style={{
            padding: 0,
            display: 'grid',
            // v111 UI/UX verdict (議題 1): 140 → 130px に微調整、 7 chip × 130 = 910px で
            //   一般的なラップトップ幅 (1280px) で 1 行収容、 Buyback (= 自社株買い) 改行解消。
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: 'var(--space-5, 20px)',
            position: frameless ? 'static' : 'sticky',
            top: frameless ? undefined : 56,
            zIndex: frameless ? undefined : 'var(--z-base, 1)',
            background: 'transparent',
            borderTop: 'none',
          }}
        >
          {stats.length === 0 ? (
            <Stat value="—" label="N/A" trend="neutral" />
          ) : (
            stats.map((s, i) => (
              <AnimatedStat key={i} stat={s} />
            ))
          )}
        </div>
      </Card>
    </SectionFade>
  );
}
