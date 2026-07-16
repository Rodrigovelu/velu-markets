// api/screener.js
// Screener de acciones castigadas — plan gratuito FMP
// El plan gratuito solo permite UN símbolo por llamada, así que consultamos
// las acciones en paralelo de una en una. Lista reducida para cuidar la cuota diaria.

const UNIVERSE = [
  'AAPL','MSFT','GOOGL','AMZN','META','NVDA','TSLA','AVGO',
  'AMD','INTC','MRVL','QCOM','MU',
  'PYPL','COIN','V','MA',
  'NKE','SBUX','MCD','DIS','TGT',
  'PFE','MRNA','UNH','CVS',
  'BA','GE','XOM',
  'NFLX','JPM','BAC','GS',
];

export default async function handler(req, res) {
  const FMP = process.env.FMP_API_KEY;
  if (!FMP) return res.status(500).json({ error: 'FMP API key not configured' });

  try {
    // Una llamada por símbolo (plan gratuito no permite multi-símbolo)
    const results = await Promise.all(
      UNIVERSE.map(async (sym) => {
        try {
          const r = await fetch(`https://financialmodelingprep.com/stable/quote?symbol=${sym}&apikey=${FMP}`);
          if (!r.ok) return null;
          const arr = await r.json();
          return Array.isArray(arr) ? arr[0] : null;
        } catch {
          return null;
        }
      })
    );

    const quotes = results.filter(q => q && q.price);

    if (quotes.length === 0) {
      return res.status(500).json({ error: 'No market data returned' });
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
      scanned: quotes.length,
      generatedAt: new Date().toISOString()
    });

  } catch (err) {
    console.error('Screener error:', err);
    return res.status(500).json({ error: 'Screener failed', message: err.message });
  }
}
