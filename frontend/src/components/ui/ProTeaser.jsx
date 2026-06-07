/**
 * ProTeaser — Premium 限定機能の訴求 hint card (Phase 3 Sub-3、 2026-05-16)
 *
 * 用途: BacktestPage / Judgment / Pane 4 等で「**Premium で更に見れる**」 を示す
 * tier teaser。 lock UI (blur + disable) ではなく、 「ここに更にデータがある」 という
 * 入り口を控えめに匂わせる Aman 級 luxury 演出。
 *
 * 設計判断:
 * - blur lock ではなく hint card (Free user に「壊れた」 感を与えない)
 * - Premium tier の amber/gold ではなく、 cyan brand 色で統一 (Premium tier の
 *   gold UI 完全実装は別タスク、 現状は brand 色で十分訴求)
 * - 「気になる銘柄を 5 条件チェック」 と同様のシンプル outlined CTA pattern
 * - 価格 (¥980/月) は CTA hover で表示 (情報の階層化、 Pro 限定 eyebrow と整合)
 *
 * Props:
 *   title       string  - 訴求機能名 (例: 「銘柄別 α 貢献度」)
 *   description string  - 補足文 (例: 「20 件の trade を 1 銘柄ごとに分解」)
 *   features    string[] - 含まれる機能のリスト (3-5 件まで、 一行で短く)
 *   onUpgrade   () => void - CTA クリック (Stripe checkout) 通常 useSubscription.startCheckout
 *   variant     'cyan' | 'gold' - 視覚的差別化 (default 'cyan'、 gold は将来 Premium tier UI 用)
 *   icon        ReactNode - title 左に添える lucide アイコン (任意、 S5c near_high Pro ロックの Lock 等)
 *   secondaryAction { label, onClick } - 主 CTA 下の控えめ副リンク (「横の出口」、 Trust Cliff の行き止まり回避)
 */
import { useState } from 'react';

export default function ProTeaser({
  title,
  description,
  features = [],
  onUpgrade,
  variant = 'cyan',
  icon = null,
  secondaryAction = null,
}) {
  const [hover, setHover] = useState(false);

  const baseColor = variant === 'gold' ? '245, 158, 11' : '56, 189, 248'; // amber or cyan

  return (
    <section
      // v138.7 Phase 2.1 (user dogfood): scroll/hover 発光が他 pricing カード (panel-card) と不揃い
      // だった。 panel-card クラスを追加して arrival spotlight + hover glow を統一。
      // glow host (= panel-card) には overflow:hidden を付けられない (box-shadow glow が clip される、
      // design_recipes §C / CLAUDE.md「発光系」)。 旧 overflow:hidden は内部 ambient gradient を角丸内に
      // 収めるためだったので、 gradient を専用 clip 層 (子 div、 glow host ではない) で囲って両立させる。
      className="panel-card bs-pro-teaser"
      style={{
        marginTop: 24,
        padding: '24px 28px',
        border: `1px solid rgba(${baseColor}, 0.22)`,
        borderRadius: 14,
        background: `rgba(${baseColor}, 0.04)`,
        position: 'relative',
      }}
    >
      {/* ambient gradient 専用 clip 層 (borderRadius + overflow hidden を子側に持たせ、 glow host を汚さない) */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 14,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        {/* 微 ambient gradient (LP hero と同 pattern、 Aman luxury) */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            right: '-10%',
            width: '320px',
            height: '180px',
            transform: 'translateY(-50%)',
            background: `radial-gradient(ellipse, rgba(${baseColor}, 0.06) 0%, transparent 70%)`,
            WebkitMaskImage: 'radial-gradient(ellipse, black 30%, transparent 70%)',
            maskImage: 'radial-gradient(ellipse, black 30%, transparent 70%)',
          }}
        />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* eyebrow: PRO 限定 (v100 LP Trust Cliff 監査 fix: 「Premium」 → 「Pro」 統一) */}
        <span
          style={{
            display: 'inline-block',
            padding: '2px 10px',
            border: `1px solid rgba(${baseColor}, 0.55)`,
            borderRadius: 999,
            color: `rgb(${baseColor})`,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          Pro 限定
        </span>

        <h3
          style={{
            margin: '0 0 6px',
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '0.01em',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {icon}
          {title}
        </h3>

        {description && (
          <p
            style={{
              margin: '0 0 14px',
              fontSize: 13,
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
            }}
          >
            {description}
          </p>
        )}

        {features.length > 0 && (
          <ul
            style={{
              margin: '0 0 18px',
              padding: 0,
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {features.map((f, i) => (
              <li
                key={i}
                style={{
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  paddingLeft: 18,
                  position: 'relative',
                  lineHeight: 1.55,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    color: `rgb(${baseColor})`,
                    fontWeight: 700,
                  }}
                >
                  ✓
                </span>
                {f}
              </li>
            ))}
          </ul>
        )}

        {onUpgrade && (
          <button
            type="button"
            onClick={onUpgrade}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 22px',
              borderRadius: 999,
              border: `1px solid rgba(${baseColor}, ${hover ? 0.70 : 0.45})`,
              background: `rgba(${baseColor}, ${hover ? 0.16 : 0.10})`,
              color: 'var(--text-primary)',
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: '0.02em',
              cursor: 'pointer',
              transform: hover ? 'translateY(-1px)' : 'translateY(0)',
              boxShadow: hover ? `0 0 14px rgba(${baseColor}, 0.25), 0 4px 14px rgba(${baseColor}, 0.15)` : 'none',
              transition: 'all 0.18s ease',
            }}
          >
            Pro で解放する
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                fontWeight: 400,
                marginLeft: 4,
              }}
            >
              ¥980/月
            </span>
            <span style={{ fontSize: 14, lineHeight: 1 }}>→</span>
          </button>
        )}

        {/* 副リンク (「横の出口」): 主 CTA を選ばないユーザーに無料の道を必ず残す = Trust Cliff の行き止まり回避 */}
        {secondaryAction && (
          <div style={{ marginTop: onUpgrade ? 12 : 0 }}>
            <button
              type="button"
              onClick={secondaryAction.onClick}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'var(--text-muted)',
                fontSize: 12,
                textDecoration: 'underline',
                textUnderlineOffset: 2,
              }}
            >
              {secondaryAction.label}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
