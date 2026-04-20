export default function ResultBadge({ result }) {
  const pass = result.overallPass;
  const dots = result.conditions ?? [];

  return (
    <div>
      <section
        className={`rounded-3xl px-8 py-8 shadow-lg ${
          pass ? 'bg-pass' : 'bg-fail'
        } text-white`}
      >
        <div className="flex items-center justify-between gap-6">
          {/* 左: 会社名 → ティッカー（最大） → 期間 → 条件ドット */}
          <div className="min-w-0">
            <div className="text-sm opacity-80 truncate">
              {result.companyName ?? ''}
            </div>
            <h2 className="text-5xl font-black tracking-tight leading-none mt-0.5 md:text-6xl">
              {result.ticker}
            </h2>
            <div className="mt-2 text-sm opacity-80">
              対象期間: FY{result.latestPeriod}（{result.latestDate}）
            </div>
            {dots.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {dots.map((c, i) => (
                  <div
                    key={i}
                    title={c.name}
                    className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition ${
                      c.passed
                        ? 'border-white/40 bg-white/20 text-white'
                        : 'border-white/20 bg-white/5 text-white/40'
                    }`}
                  >
                    <span>{c.passed ? '✓' : '✕'}</span>
                    <span className="hidden sm:inline">条件{i + 1}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 右: アイコン + PASS/FAIL + 条件クリア数 */}
          <div className="flex-shrink-0 text-right">
            <div className="text-6xl leading-none md:text-7xl">
              {pass ? '✅' : '❌'}
            </div>
            <div className="text-4xl font-black tracking-tighter mt-1 md:text-5xl">
              {pass ? 'PASS' : 'FAIL'}
            </div>
            <div className="mt-1 text-sm font-semibold opacity-90">
              {result.passedCount} / {result.totalCount} 条件クリア
            </div>
          </div>
        </div>
      </section>
      {result.dataSource === 'yfinance' && (
        <p className="text-xs text-slate-400 mt-1">※一部データ: Yahoo Finance</p>
      )}
    </div>
  );
}
