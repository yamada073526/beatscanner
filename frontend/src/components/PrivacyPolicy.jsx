/**
 * PrivacyPolicy — /privacy 全画面ページ (v142、 GA4+Clarity 活性化対応)。
 *
 * client-side pathname router (App.jsx が /privacy を検知) で render。
 * backend は @app.get("/privacy") で SPA shell を返す (StaticFiles html=True は未知 path で 404)。
 *
 * 内容 SSOT: docs/privacy_policy_draft.md (公開用 clean 版 = draft 警告/実装メモを除く)。
 * 改正電気通信事業法 外部送信規律 (§4 GA4/Clarity/Sentry 表) + 個人情報保護法対応。
 * ⚠️ 公開済だが専門家レビューでの微修正余地あり (docs draft 参照)。
 *
 * 設計: semantic token のみ (raw hex/shadow なし)、 発光系・card 系不使用の素直な legal 文書。
 */

const EXTERNAL_TRANSMISSION = [
  {
    vendor: 'Google LLC',
    service: 'Google Analytics 4',
    info: 'Cookie 識別子、IP アドレス、閲覧・操作ログ',
    purpose: 'アクセス解析・利用状況の把握',
    link: 'https://policies.google.com/privacy',
    linkLabel: 'policies.google.com/privacy（オプトアウト: tools.google.com/dlpage/gaoptout）',
  },
  {
    vendor: 'Microsoft Corporation',
    service: 'Microsoft Clarity',
    info: 'Cookie 識別子、操作ログ、セッション録画・ヒートマップ',
    purpose: '利用状況の可視化・UI/UX 改善',
    link: 'https://privacy.microsoft.com/privacystatement',
    linkLabel: 'privacy.microsoft.com/privacystatement',
  },
  {
    vendor: 'Functional Software, Inc.（Sentry）',
    service: 'Sentry',
    info: 'エラー情報、端末・ブラウザ情報、操作の文脈',
    purpose: '障害・エラーの検知と対応',
    link: 'https://sentry.io/privacy/',
    linkLabel: 'sentry.io/privacy',
  },
];

const ENTRUSTED = [
  { vendor: 'Supabase Inc.', role: '認証・データベース基盤', info: 'アカウント情報、フィードバック等' },
  { vendor: 'Stripe, Inc.', role: '決済処理', info: '決済・サブスクリプション情報（カード情報は Stripe が管理）' },
  { vendor: 'Resend (Plus Five Five, Inc.)', role: 'メール配信', info: '配信先メールアドレス、配信内容' },
  { vendor: 'Railway Corp.', role: 'アプリケーションホスティング', info: '上記処理に伴うデータ' },
];

const COLLECTED = [
  { type: 'アカウント情報', info: 'メールアドレス（Google アカウント経由のログイン時）', how: '利用者の操作' },
  { type: '決済情報', info: 'サブスクリプション契約状態（カード情報は当方では保持せず決済事業者が管理）', how: '利用者の操作' },
  { type: 'お問い合わせ・フィードバック', info: '利用者が送信した内容、任意で入力されたメールアドレス', how: '利用者の操作' },
  { type: 'アクセス・利用情報', info: 'IP アドレス、ブラウザ・端末情報、閲覧ページ、操作ログ、Cookie 等の識別子、サイト内の操作の記録（セッション録画・ヒートマップを含む）', how: '自動取得（解析ツール経由）' },
];

const thCls = 'border border-[var(--border)] px-3 py-2 text-left font-semibold text-[var(--text-secondary)] bg-[var(--bg-subtle)]';
const tdCls = 'border border-[var(--border)] px-3 py-2 align-top text-[var(--text-secondary)]';

function Section({ n, title, children }) {
  return (
    <section className="mt-8">
      <h2 className="text-base font-bold text-[var(--text-primary)]">
        {n}. {title}
      </h2>
      <div className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPolicy() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:py-14">
      <a
        href="/"
        className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
      >
        ← BeatScanner ホームに戻る
      </a>

      <h1 className="mt-4 text-2xl font-bold text-[var(--text-primary)]">プライバシーポリシー</h1>

      <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">
        BeatScanner 運営者（以下「当方」といいます）は、当方が提供するウェブサービス「BeatScanner」（以下「本サービス」といいます）における利用者の個人情報および利用者情報の取扱いについて、以下のとおりプライバシーポリシー（以下「本ポリシー」といいます）を定めます。
      </p>

      <Section n={1} title="取得する情報">
        <p>当方は、本サービスの提供にあたり、以下の情報を取得します。</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className={thCls}>区分</th>
                <th className={thCls}>取得する情報</th>
                <th className={thCls}>取得方法</th>
              </tr>
            </thead>
            <tbody>
              {COLLECTED.map((r, i) => (
                <tr key={i}>
                  <td className={tdCls}>{r.type}</td>
                  <td className={tdCls}>{r.info}</td>
                  <td className={tdCls}>{r.how}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section n={2} title="利用目的">
        <p>取得した情報は、以下の目的で利用します。</p>
        <ul className="mt-2 list-disc pl-5">
          <li>本サービスの提供・本人確認・認証</li>
          <li>サブスクリプションの提供および課金管理</li>
          <li>お問い合わせ・フィードバックへの対応およびサービス改善</li>
          <li>利用状況の分析によるサービスの品質向上・UI/UX 改善</li>
          <li>不正利用の防止、障害・エラーの検知と対応</li>
          <li>重要なお知らせ・通知の配信（利用者が希望した場合）</li>
        </ul>
      </Section>

      <Section n={3} title="Cookie 及び類似技術の利用">
        <p>
          本サービスは、利用状況の分析や利便性向上のため Cookie 及び類似技術（ローカルストレージ等）を利用します。利用者はブラウザの設定により Cookie の利用を制限・拒否できますが、その場合、本サービスの一部機能が利用できないことがあります。
        </p>
      </Section>

      <Section n={4} title="外部送信（情報の外部送信に関する公表事項）">
        <p>
          本サービスは、利用状況の分析等のため、以下の外部事業者のプログラムを利用しており、利用者の端末から各事業者へ情報が送信されます（電気通信事業法第27条の12に基づく公表）。
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className={thCls}>送信先事業者</th>
                <th className={thCls}>サービス名</th>
                <th className={thCls}>送信される主な情報</th>
                <th className={thCls}>利用目的</th>
                <th className={thCls}>プライバシーポリシー / オプトアウト</th>
              </tr>
            </thead>
            <tbody>
              {EXTERNAL_TRANSMISSION.map((r, i) => (
                <tr key={i}>
                  <td className={tdCls}>{r.vendor}</td>
                  <td className={tdCls}>{r.service}</td>
                  <td className={tdCls}>{r.info}</td>
                  <td className={tdCls}>{r.purpose}</td>
                  <td className={tdCls}>
                    <a
                      href={r.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--color-accent)] hover:underline break-all"
                    >
                      {r.linkLabel}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          ※ Google Analytics / Microsoft Clarity では、入力フォームの値など個人を直接特定する情報を送信しない設定としています。
        </p>
      </Section>

      <Section n={5} title="第三者提供">
        <p>
          当方は、法令に基づく場合を除き、あらかじめ利用者の同意を得ることなく個人情報を第三者に提供しません。ただし、利用目的の達成に必要な範囲で、以下の委託先に取扱いを委託します。
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className={thCls}>委託先</th>
                <th className={thCls}>役割</th>
                <th className={thCls}>取扱う情報</th>
              </tr>
            </thead>
            <tbody>
              {ENTRUSTED.map((r, i) => (
                <tr key={i}>
                  <td className={tdCls}>{r.vendor}</td>
                  <td className={tdCls}>{r.role}</td>
                  <td className={tdCls}>{r.info}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2">
          委託先の一部は日本国外にサーバーを置く場合があります。当方は委託先に対し、適切な安全管理が図られるよう必要かつ適切な監督を行います。
        </p>
      </Section>

      <Section n={6} title="安全管理措置">
        <p>
          当方は、取得した情報の漏えい、滅失またはき損の防止その他の安全管理のために、必要かつ適切な措置を講じます。
        </p>
      </Section>

      <Section n={7} title="保有期間">
        <p>
          取得した情報は、利用目的の達成に必要な期間、または法令で定められた期間保有し、不要となった後は適切に消去します。
        </p>
      </Section>

      <Section n={8} title="利用者の権利（開示・訂正・利用停止等）">
        <p>
          利用者は、当方が保有する自己の個人情報について、開示・訂正・追加・削除・利用停止・第三者提供の停止を請求できます。ご請求は下記のお問い合わせ窓口までご連絡ください。本人確認のうえ、法令に従い対応します。
        </p>
      </Section>

      <Section n={9} title="お問い合わせ窓口">
        <p>本ポリシーに関するお問い合わせ、個人情報の取扱いに関するご請求は、以下までご連絡ください。</p>
        <p className="mt-2">
          連絡先:{' '}
          <a href="mailto:beatscanner.app@gmail.com" className="text-[var(--color-accent)] hover:underline">
            beatscanner.app@gmail.com
          </a>
        </p>
      </Section>

      <Section n={10} title="本ポリシーの変更">
        <p>
          当方は、法令の変更やサービス内容の変更に応じて本ポリシーを改定することがあります。重要な変更を行う場合は、本サービス上で告知します。
        </p>
      </Section>

      <div className="mt-10 border-t border-[var(--border)] pt-4 text-xs text-[var(--text-muted)]">
        <p>制定日: 2026年5月31日</p>
        <p className="mt-1">運営者: BeatScanner 運営者</p>
      </div>
    </div>
  );
}
