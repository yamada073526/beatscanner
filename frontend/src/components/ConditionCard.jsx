import { useState } from 'react';
import InfoModal from './InfoModal.jsx';
import FormulaDisplay from './FormulaDisplay.jsx';
import Sparkline from './Sparkline.jsx';

// ── Delta helpers ────────────────────────────────────────────────────────────

function calcDeltaPct(series) {
  const prev = series?.[1];
  const curr = series?.[2];
  if (prev == null || curr == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

const DELTA_LABELS = {
  1: 'CFマージン前回比',
  2: 'EPS前回比',
  3: 'CFPS前回比',
  4: '売上高前回比',
  5: 'CFPS-EPS差前回比',
};

function DeltaRow({ index, series, isPro, onUpgradeClick }) {
  const label = DELTA_LABELS[index];

  if (!isPro) {
    return (
      <button
        onClick={onUpgradeClick}
        className="mt-2 flex w-full items-center gap-1.5 border-t border-slate-100 pt-2 text-left text-xs text-slate-400 opacity-60 transition hover:opacity-100"
      >
        <span>🔒</span>
        <span>{label}（Pro限定）</span>
      </button>
    );
  }

  const delta = calcDeltaPct(series);
  if (delta === null) return null;

  const positive = delta > 0;
  return (
    <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
      <span className="text-xs text-slate-400">{label}</span>
      <span
        className={`text-xs font-semibold tabular-nums ${
          positive ? 'text-green-600' : 'text-red-500'
        }`}
      >
        {positive ? '+' : ''}{delta.toFixed(1)}%
        <span className="ml-1 font-normal opacity-70">
          {positive ? '▲' : '▼'}
        </span>
      </span>
    </div>
  );
}

// ── Condition detail content ─────────────────────────────────────────────────

const CONDITION_DETAILS = {
  1: {
    title: '条件1：営業CFマージン ≥ 15%',
    sections: [
      {
        label: '📌 概要',
        text: '「営業キャッシュフロー・マージン ≥ 15%」という基準は、企業の「真の稼ぐ力」や「財務の健全性」を測る上で極めて重要なチェック項目です。',
      },
      {
        label: '📐 計算方法',
        text: '営業キャッシュフロー・マージンは以下の式で求められます。',
        formula: { items: ['CFPS\n一株あたり営業CF', 'SPS\n一株あたり売上高'], operators: ['÷'] },
        note: 'ここでいう「営業キャッシュフロー」とは、企業が商品やサービスを販売して得た売上高から、原材料費などの実際の支出を引き算して残った「現金収支」のことです。',
      },
      {
        label: '💡 なぜ「利益（EPS）」ではなく「営業キャッシュフロー」なのか',
        text: '**利益は会計上の操作（減価償却費の調整など）でごまかしや粉飾がしやすいのに対し、営業キャッシュフローは実際の銀行口座の現金残高の動きに基づくため、最もごまかしが効かない客観的なデータです。**帳簿上でいくら利益が出ているように見えても、実際に会社に現金が入ってきていなければ意味がありません。',
      },
      {
        label: '📊 なぜ「15%以上」という基準なのか',
        text: 'アメリカの平均的な企業の営業キャッシュフロー・マージンは概ね12〜15%程度とされています。「最低でも15%以上（理想的には15〜35%）」という基準は平均を上回る非常に達成が難しい足切り基準であり、この厳しいハードルを設けることで、最初から不健康な企業を投資対象から除外することができます。',
      },
      {
        label: '💪 15%以上をクリアする企業の強み',
        richBullets: [
          { title: 'バランスシートが綺麗になる', desc: '毎期現金がガンガン入ってくるため、無駄な借金をして資金調達をする必要がありません。自然とバランスシート（貸借対照表）が強固なものになります。' },
          { title: '不況に強く、大失敗しにくい', desc: 'このような「高利益体質」の企業は、景気後退などの厳しい経営環境下でも稼ぐ力が低下しにくく、赤字に転落する心配がほぼありません。' },
          { title: '他の指標を細かく調べなくても済むほど健全', desc: 'このマージンが高い企業は、他の細かい財務指標をいちいち確認しなくても良いほど、健康で血色の良い「美しいプロポーション」を持っていると評価できます。' },
        ],
      },
      {
        label: '📋 まとめ',
        text: '「営業CFマージンが15%以上あるか」という条件は、その企業が偽りなく現金を生み出す力を持っているかを見極める最強のリトマス試験紙です。この基準を満たし、さらに過去3年にわたってEPSやCFPSが着実に右肩上がりで成長している銘柄を選べば、個別株投資において大失敗するリスクを劇的に小さくすることができるとされています。',
      },
    ],
  },
  2: {
    title: '条件2：EPS（一株あたり利益）連続増加',
    sections: [
      {
        label: '📌 概要',
        text: 'EPS（一株あたり利益）の連続増加とは何か、そしてチェックする上での極めて重要な注意点を解説します。',
      },
      {
        label: '📐 EPSの計算方法',
        text: 'EPS（Earnings Per Share）は以下の式で求められます。',
        formula: { items: ['純利益', '希薄化後\n発行済株式数'], operators: ['÷'] },
        note: '売上高から原価・販管費・減価償却費・支払利息・法人税などを差し引いた「純利益」を、希薄化後の株式数で割り算して求めます。このEPSが過去3年にわたり年々右肩上がりで着実に増え続けているかを確認します。',
      },
      {
        label: '💡 なぜ「EPSの連続増加」が重要なのか',
        richBullets: [
          { title: '成功の再現性の証明だから', desc: '良い企業とは、マグレで一度だけ儲かるのではなく、「成功を繰り返し再現できる」企業のことです。長期にわたってEPSを増やし続けている実績は、持続的な収益力を持っている動かぬ証拠となります。' },
          { title: '株価上昇の原動力だから', desc: '株価上昇の大きな原動力は「EPSの伸び」と「PER（株価収益率）の拡大」の掛け算で決まります。着実にEPSを伸ばしている企業は投資家からの評価が高まりやすく、テンバガー（10倍株）へと育つ可能性を秘めています。' },
        ],
      },
      {
        label: '⚠️ 最大の注意点：EPS単独で判断してはいけない',
        warning: {
          title: 'EPS（利益）は会計操作でごまかしや粉飾がしやすい数字です',
          desc: '減価償却費の調整などの会計操作で、見かけ上の利益を大きく見せることが可能なためです。',
        },
        note: '必ずCFPSとクロスチェックを：',
        richBullets: [
          { title: 'CFPSも連続増加しているか', desc: '実際の銀行残高の動きに基づく「ごまかしのきかない」CFPSも、EPSと歩調を合わせて右肩上がりになっているかを確認します。' },
          { title: 'CFPSがEPSよりも大きいか（CFPS ＞ EPS）', desc: '「利益（EPS）は出ているのに、現金（CFPS）が伴っていない」という逆転現象が起きていれば、粉飾決算の危険なサインとなります。' },
        ],
      },
      {
        label: '📋 修正EPS（オペレーティングEPS）を見ること',
        text: '企業の決算には事業構造改革費用・訴訟関連費用・子会社売却益など「一時的・特殊な損益」が含まれることがあります。これらは本業の持続的な収益力とは無関係なノイズです。',
        note: '**過去のEPS推移やアナリスト予想をチェックする際は、こうした一時的要因を除外した「修正EPS（オペレーティングEPS）」をベースに判断することが重要です。**',
      },
      {
        label: '📝 まとめ',
        text: '「EPSの連続増加」は、企業が本業で着実に稼ぎ成長しているかを確認する基本指標です。ただし会計上のごまかしを見抜くために、必ず「営業キャッシュフロー（CFPS）」の推移とセットで分析することが鉄則です。',
      },
    ],
  },
  3: {
    title: '条件3：CFPS（一株あたり営業CF）連続増加',
    sections: [
      {
        label: '📌 概要',
        text: 'CFPSの連続増加は、企業が実質的に稼ぐ力を持っているか、そして業績に「ごまかし（粉飾）」がないかを見抜くための極めて重要なチェック項目です。',
      },
      {
        label: '📐 CFPSの計算方法',
        formula: { items: ['営業CF', '希薄化後\n発行済株式数'], operators: ['÷'] },
        note: '「営業キャッシュフロー」とは、企業が商品やサービスを販売して得た売上高から、原材料費や人件費などの実際の支出を引き算して手元に残った「現金収支」のことです。これを希薄化後の株式数で割ることで、1株あたりの現金創出力が可視化されます。',
      },
      {
        label: '💡 なぜ「利益（EPS）」ではなく「CFPS」が重要なのか',
        richBullets: [
          { title: '利益（EPS）は粉飾・操作しやすい', desc: '会計上の利益は、減価償却費の調整など様々な会計操作を加えることが可能であり、見かけ上の利益を良く見せることができてしまいます。' },
          { title: '営業キャッシュフローは実際の銀行口座の「現金の動き」そのものを示すデータであり、会計的に最もごまかしや粉飾がしにくい、客観的で信頼できる数字です。', desc: null },
        ],
      },
      {
        label: '📊 「連続増加」の判定方法',
        text: '過去3年分のデータを経年で比較し、「一昨年より去年、去年より今年のCFPSの数字が大きければ合格」と判定します。CFPSが右肩上がりで増え続けているということは、企業が本業を通じて実質的に現金を稼ぎ出す力を着実に伸ばしていることを意味します。',
        note: 'EPS（利益）が増えているのにCFPS（現金）が横ばいや減少している場合は、業績の中身に疑問符がつきます。',
      },
      {
        label: '⚠️ 必ずセットで確認：CFPS ＞ EPS のルール',
        warning: {
          title: 'CFPS は必ず EPS より大きくあるべきです',
          desc: 'EPSは出ているのに現金（CFPS）が伴っていない逆転現象（CFPS ＜ EPS）は、粉飾決算の恐れがある危険なサインです。',
        },
        text: '**「一株あたり営業キャッシュフロー（CFPS）は必ずEPSより大きくあるべき」**というルールを合わせて確認してください。',
        note: '帳簿上の利益（EPS）は出ているのに手元に入ってくる現金（CFPS）の方が少ない（CFPS ＜ EPS）という逆転現象が起きている場合、実際には現金が伴っていないことを意味し、粉飾決算の恐れがあります。',
      },
      {
        label: '📝 まとめ',
        text: '「CFPSの連続増加」を確認するプロセスは、見せかけの利益成長に騙されることなく、**「本物の現金を稼ぎ出す力」が着実に成長している健康な企業だけを選別するための、極めて強力なフィルター**です。',
      },
    ],
  },
  4: {
    title: '条件4：売上高 連続増加',
    sections: [
      {
        label: '📌 概要',
        text: '売上高の連続増加は、企業が本業の市場シェアを拡大し、顧客からの強い需要を背景にビジネスを成長させ続けていることを証明する指標です。',
      },
      {
        label: '💡 なぜ「売上高の連続増加」が重要なのか',
        richBullets: [
          { title: 'トップラインの成長はごまかせないから', desc: '売上高は企業の「トップライン」であり、製品やサービスへの需要そのものを示します。利益（EPS）はリストラや自社株買いといった「お化粧」である程度良く見せることが可能ですが、**売上高は顧客が実際にお金を払った総額であるため、ごまかしがききません。**売上が右肩上がりで伸びていることは、ビジネスそのものが順調に拡大していることを示す最も基本的な証拠となります。' },
          { title: '成長の頭打ちを見抜くため', desc: '過去に急成長していた企業でも、市場が飽和すると売上高の成長は止まります。売上高が連続で着実に増えていない企業は、将来の大きな株価上昇（PERの拡大）が期待しにくくなります。' },
          { title: 'グロース投資における「加速度」の確認', desc: '成長株投資においては、単に売上高が増えているだけでなく、**「売上高成長率が期を追うごとに上昇しているか（加速度があるか）」**が極めて重要視されます。成長率に頭打ちの兆しが見られる場合、成長株としての評価は難しくなります。' },
        ],
      },
      {
        label: '📐 チェック手順：SPSで評価する',
        formula: { items: ['売上高', '希薄化後\n発行済株式数'], operators: ['÷'] },
        note: '総売上高をそのまま見るのではなく、株式数の変化（増資や自社株買い）の影響をフラットにするため「SPS（一株あたり売上高）」に直して評価します。過去3年分のSPSを並べ、「一昨年 ＜ 去年 ＜ 今年」と年々着実に数字が大きくなっているかを確認してください。',
      },
      {
        label: '⚠️ 他の指標との「三拍子」が不可欠',
        warning: {
          title: '売上高だけを見て判断してはいけません',
          desc: '「EPS」「CFPS」「売上高」の3つがすべて毎年増えていることが必須条件です。1つだけ良くても、残りが伴っていなければ危険なサインです。',
        },
        richBullets: [
          { title: '売上高だけ増えてEPS・CFPSが伴っていない場合', desc: '無理な安売りや不採算事業の拡大による「見せかけの売上」（利益なき繁忙）の可能性があります。' },
          { title: 'EPSは出ているが売上高が伸びていない場合', desc: 'コスト削減などの一時的な延命措置に過ぎず、持続的な成長力は失われているサインです。' },
        ],
      },
      {
        label: '📝 まとめ',
        text: '「売上高の連続増加」をEPSおよびCFPSの連続増加とセットで確認することで、業績の「お化粧」に騙されることなく、真の成長企業を見つけ出すことができます。',
      },
    ],
  },
  5: {
    title: '条件5：CFPS > EPS（直近期）',
    sections: [
      {
        label: '📌 概要',
        text: '「一株あたり営業キャッシュフロー（CFPS）は、その年の一株あたり利益（EPS）より必ず大きくなければいけない」とされる最大の理由は、**「粉飾決算」や会計上のごまかしを見抜くため**です。',
      },
      {
        label: '💡 利益（EPS）とCFPSの決定的な違い',
        richBullets: [
          {
            title: '利益（EPS）は「会計操作」が可能',
            desc: 'EPSのベースとなる純利益は、あくまで会計上のルールに基づいて計算された概念です。減価償却費の計上・引当金の設定・評価損益の処理など、様々な会計方針や見積もりが介在するため、見かけ上の数字を良く見せることが比較的容易にできてしまいます。',
          },
          {
            title: '営業キャッシュフロー（CFPS）は「客観的な事実」',
            desc: '一方で、営業キャッシュフローは企業が事業を通じて実際に得た「現金の動き（入出金）」そのものを示します。現金の出入りは銀行口座の記録といった第三者による明確な裏付けが存在するため、改ざんや操作をしようとするとすぐに矛盾が露呈します。**架空の売上で利益を水増しすることはできても、実際に存在しない現金の流出入を帳簿上でごまかし続けることは極めて困難です。**',
          },
        ],
      },
      {
        label: '⚠️ 逆転現象（EPS ＞ CFPS）が示す危険なサイン',
        warning: {
          title: 'EPS ＞ CFPS の逆転現象は粉飾決算の疑いサイン',
          desc: '帳簿上は利益が出ているのに、それに見合う現金が入ってきていない状態は極めて不自然です。架空売上による利益水増しの可能性があります。',
        },
        text: '「EPS（利益）のほうがCFPS（現金）よりも大きい」という逆転現象が起きている場合、「帳簿上は利益が出ているように見えるのに、実際にはそれに見合うだけの現金が会社に入ってきていない」という不自然な状態を意味します。',
        note: 'このような場合、架空売上の計上や不適切な会計操作によって利益を水増ししている、すなわち**粉飾決算を行っている恐れが強く疑われます。**',
      },
      {
        label: '📝 まとめ',
        text: '利益単独の数字を鵜呑みにすると、見せかけの好業績に騙される危険があります。企業が実質的な収益力を持ち財務的に健全であることを確かめるためには、必ず利益とキャッシュフローの両方をクロスチェックする必要があります。「CFPSがEPSよりも大きいこと」は、大失敗を避けるための必須ルールです。',
      },
    ],
  },
};

// ── Modal ────────────────────────────────────────────────────────────────────

function renderBold(text) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1
      ? <strong key={i} className="font-semibold text-slate-900">{part}</strong>
      : part
  );
}

function ConditionModal({ detail, onClose }) {
  return (
    <InfoModal title={detail.title} onClose={onClose}>
      {detail.sections ? (
        detail.sections.map((s, i) => (
          <div key={i} className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="mb-1 text-xs font-semibold tracking-wider text-slate-400">{s.label}</p>
            {s.warning && (
              <div className="mb-3 rounded-r-lg border-l-4 border-amber-400 bg-amber-50 p-3">
                <p className="text-sm font-bold text-amber-800">⚠️ {s.warning.title}</p>
                <p className="mt-1 text-sm text-amber-700">{s.warning.desc}</p>
              </div>
            )}
            {s.text && (
              <p className="text-sm leading-relaxed text-slate-700">{renderBold(s.text)}</p>
            )}
            {s.formula && (
              <FormulaDisplay items={s.formula.items} operators={s.formula.operators} />
            )}
            {s.note && (
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{renderBold(s.note)}</p>
            )}
            {s.richBullets && (
              <ul className="mt-1 space-y-2 text-sm text-slate-700">
                {s.richBullets.map((b, j) => (
                  <li key={j}>
                    <span className="font-semibold text-slate-900">・{b.title}</span>
                    {b.desc && <><br />{renderBold(b.desc)}</>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))
      ) : (
        <>
          <div className="mb-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">📌 概要</p>
            <p className="text-sm leading-relaxed text-slate-700">{detail.summary}</p>
          </div>
          <div className="mb-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">💡 なぜ必要か</p>
            <p className="text-sm leading-relaxed text-slate-700">{detail.reason}</p>
          </div>
        </>
      )}
    </InfoModal>
  );
}

// ── ConditionCard ─────────────────────────────────────────────────────────────

export default function ConditionCard({ index, condition, isPro = true, onUpgradeClick }) {
  const [showModal, setShowModal] = useState(false);
  const passed = condition.passed;
  const color = passed ? '#22c55e' : '#ef4444';
  const detail = CONDITION_DETAILS[index];

  return (
    <>
      <div
        className={`panel-card flex flex-col gap-3 rounded-2xl border-2 bg-white p-5 shadow-sm transition ${
          passed ? 'border-pass/40' : 'border-fail/40'
        }`}
      >
        <div className="flex items-start justify-between">
          <div className="min-w-0 pr-2">
            <div className="text-xs font-medium text-slate-500">条件 {index}</div>
            <div className="mt-1 flex items-center gap-1 text-sm font-semibold leading-snug text-slate-900">
              <span>{condition.name}</span>
              {detail && (
                <button
                  onClick={() => setShowModal(true)}
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-500 hover:bg-slate-300 hover:text-slate-700"
                  aria-label={`${condition.name}の説明を表示`}
                >
                  ？
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-col items-center gap-0.5 shrink-0">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-full text-xl font-bold text-white ${
                passed ? 'bg-pass' : 'bg-fail'
              }`}
              aria-hidden="true"
            >
              {passed ? '✓' : '✕'}
            </div>
            <span
              className={`text-[9px] font-bold uppercase tracking-wider ${
                passed ? 'text-pass' : 'text-fail'
              }`}
              aria-label={passed ? 'PASS' : 'FAIL'}
            >
              {passed ? 'PASS' : 'FAIL'}
            </span>
          </div>
        </div>
        <div className="text-2xl font-bold tracking-tight text-slate-900">
          {condition.detail}
        </div>
        <Sparkline data={condition.series} color={color} />
        <DeltaRow
          index={index}
          series={condition.series}
          isPro={isPro}
          onUpgradeClick={onUpgradeClick}
        />
      </div>

      {showModal && detail && (
        <ConditionModal detail={detail} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}
