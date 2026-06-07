// BeatScanner ブランドマーク (EKG 心拍波形 + シグナルアーク)。
// public/favicon.svg と同一意匠を React component 化したもの。
// 「鼓動 (Beat) をスキャンする」 ブランド世界観を視覚で表す primitive で、
// ロード表示等で「テキストだけで寂しい」 を解消する (Aman/Ritz 級の品格、 emoji 不使用)。
//
// 色は CSS `currentColor` で受け、 .brand-pulse 既定 color = var(--color-accent) (raw hex 禁止遵守)。
// animated=true で波形が左から描かれ→終端からシグナルが発信されるループ (index.css §brand-pulse)。
// 装飾要素のため aria-hidden、 ラベルが要る場合は親が aria-label を付与する。
export default function BrandPulse({ size = 56, className = '', animated = true }) {
  return (
    <svg
      className={`brand-pulse${animated ? ' brand-pulse--animated' : ''}${className ? ` ${className}` : ''}`}
      viewBox="0 0 96 96"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* EKG QRS 波形：左から心拍スパイクを描画 */}
      <path
        className="brand-pulse__wave"
        d="M10,52 L22,52 L27,67 L35,17 L43,67 L49,52"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* ジャンクションドット：EKG 終端 兼 シグナル発信源 */}
      <circle className="brand-pulse__dot" cx="49" cy="52" r="5" fill="currentColor" />
      {/* シグナルアーク（内側）：フル opacity */}
      <path
        className="brand-pulse__arc brand-pulse__arc--inner"
        d="M56,46 A7 7 0 0 1 56,58"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* シグナルアーク（外側）：減衰を表現 */}
      <path
        className="brand-pulse__arc brand-pulse__arc--outer"
        d="M64,40 A13 13 0 0 1 64,64"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
