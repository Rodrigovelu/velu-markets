// api/screener.js
// Screener de acciones castigadas — versión plan gratuito FMP
// Usa el endpoint stable/quote sobre una lista fija de ~50 acciones importantes

const UNIVERSE = [
  'AAPL','MSFT','GOOGL','AMZN','META','NVDA','TSLA','AVGO','ORCL','CRM',
  'AMD','INTC','MRVL','QCOM','MU','TXN','ADI','NXPI',
  'PYPL','SQ','COIN','V','MA','AXP',
  'NKE','SBUX','MCD','DIS','TGT','LULU','CMG',
  'PFE','JNJ','MRNA','UNH','CVS','ABBV',
  'BA','CAT','GE','XOM','CVX',
  'NFLX','CMCSA','T','VZ',
  'JPM','BAC','GS','MS',
];

export default async function handler(req, res) {
  const FMP = process.env.FMP_API_KEY;
  if (!FMP) return res.status(500).json({ error: 'FMP API key not configured' });

  try {
    const symbols = UNIVERSE.join(',');
    const url = `https://financialmodelingprep.com/stable/quote?symbol=${symbols}&apikey=${FMP}`;

    const resp = await fetch(url);
    if (!resp.ok) {
      const txt = await resp.text();
      console.error('FMP quote error:', txt);
      return res.status(500).json({ error: 'Market data unavailable', detail: txt.slice(0, 200) });
    }

    const quotes = await resp.json();
    if (!Array.isArray(quotes)) {
      return res.status(500).json({ error: 'Unexpected data format', detail: quotes });
    }

    const analyzed = quotes.map(q => {
      const from52High = q.yearHigh ? ((q.yearHigh - q.price) / q.yearHigh) * 100 : 0;
      const belowMA50 = q.priceAvg50 ? ((q.priceAvg50 - q.price) / q.priceAvg50) * 100 : 0;
      const belowMA200 = q.priceAvg200 ? ((q.priceAvg200 - q.price) / q.priceAvg200) * 100 : 0;

      const punishmentScore = Math.round(
        (from52High * 0.5) + (Math.max(0, belowMA50) * 0.25) + (Math.max(0, belowMA200) * 0.25)
      );

      return {
        symbol: q.symbol,
        name: q.name,
        price: q.price,
        change: q.change,
        changePct: q.changePercentage,
        marketCap: q.marketCap,
        yearHigh: q.yearHigh,
        yearLow: q.yearLow,
        from52High: Math.round(from52High * 10) / 10,
        belowMA50: Math.round(belowMA50 * 10) / 10,
        belowMA200: Math.round(belowMA200 * 10) / 10,
        punishmentScore,
        volume: q.volume
      };
    });

    const punished = analyzed
      .filter(s => s.from52High >= 15 && s.price > 5)
      .sort((a, b) => b.punishmentScore - a.punishmentScore)
      .slice(0, 15);

    return res.status(200).json({
      count: punished.length,
      stocks: punished,
      universe: UNIVERSE.length,
      generatedAt: new Date().toISOString()
    });

  } catch (err) {
    console.error('Screener error:', err);
    return res.status(500).json({ error: 'Screener failed', message: err.message });
  }
}
