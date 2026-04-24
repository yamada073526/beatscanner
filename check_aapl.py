import yfinance as yf
t = yf.Ticker('AAPL')

print('=== analyst_price_targets ===')
print(t.analyst_price_targets)

print('\n=== recommendations (tail 5) ===')
print(t.recommendations.tail(5) if t.recommendations is not None else 'None')

print('\n=== upgrades_downgrades (head 5) ===')
print(t.upgrades_downgrades.head(5) if t.upgrades_downgrades is not None else 'None')
