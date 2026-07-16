// api/analyze-stock.js
// Análisis en vivo de una acción con 3 agentes de Velu + veredicto Buy/Hold/Sell
// Versión plan gratuito FMP (endpoints stable/quote + stable/ratios-ttm)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const FMP = process.env.FMP_API_KEY;
  const ANTHROPIC = process.env.ANTHROPIC_API_KEY;
  if (!FMP || !ANTHROPIC) {
    return res.status(500).json({ error: 'API keys not configured' });
  }

  const { symbol } = req.body;
  if (!symbol) return res.status(400).json({ error: 'Symbol required' });

  const ticker = symbol.toUpperCase().trim();

  try {
    // Fetch en paralelo: quote + ratios (ambos funcionan en plan gratuito)
    const [quoteRes, ratiosRes] = await Promise.all([
      fetch(`https://financialmodelingprep.com/stable/quote?symbol=${ticker}&apikey=${FMP}`),
      fetch(`https://financialmodelingprep.com/stable/ratios-ttm?symbol=${ticker}&apikey=${FMP}`)
    ]);

    const quoteArr = await quoteRes.json();
    const ratiosArr = await ratiosRes.json();

    const quote = Array.isArray(quoteArr) ? quoteArr[0] : null;
    const ratios = Array.isArray(ratiosArr) ? ratiosArr[0] : {};

    if (!quote) return res.status(404).json({ error: `Ticker ${ticker} not found` });

    const from52High = quote.yearHigh ? ((quote.yearHigh - quote.price) / quote.yearHigh) * 100 : 0;

    const stockData = {
      symbol: ticker,
      name: quote.name,
      price: quote.price,
      change: quote.change,
      changePct: quote.changePercentage,
      marketCap: quote.marketCap,
      yearHigh: quote.yearHigh,
      yearLow: quote.yearLow,
      from52High: Math.round(from52High * 10) / 10,
      priceAvg50: quote.priceAvg50,
      priceAvg200: quote.priceAvg200,
      exchange: quote.exchange,
      pe: ratios.priceToEarningsRatioTTM,
      pb: ratios.priceToBookRatioTTM,
      ps: ratios.priceToSalesRatioTTM,
      roe: ratios.returnOnEquityTTM,
      netMargin: ratios.netProfitMarginTTM,
      grossMargin: ratios.grossProfitMarginTTM,
      debtToEquity: ratios.debtToEquityRatioTTM,
      dividendYield: ratios.dividendYieldTTM,
      eps: ratios.netIncomePerShareTTM
    };

    const prompt = `You are Velu, an equity analysis engine with 3 specialized agents. Analyze ${ticker} (${stockData.name}) and return ONLY valid JSON.

LIVE DATA:
- Price: $${stockData.price} (${stockData.changePct > 0 ? '+' : ''}${stockData.changePct?.toFixed(2)}% today)
- 52-week range: $${stockData.yearLow} - $${stockData.yearHigh}
- Down ${stockData.from52High}% from 52-week high
- P/E: ${stockData.pe?.toFixed(1)} | P/B: ${stockData.pb?.toFixed(1)} | P/S: ${stockData.ps?.toFixed(1)}
- EPS (TTM): $${stockData.eps?.toFixed(2)}
- Market cap: $${(stockData.marketCap / 1e9).toFixed(1)}B
- Exchange: ${stockData.exchange}
- Net margin: ${(stockData.netMargin * 100)?.toFixed(1)}% | Gross margin: ${(stockData.grossMargin * 100)?.toFixed(1)}%
- Debt/Equity: ${stockData.debtToEquity?.toFixed(2)}
- 50-day MA: $${stockData.priceAvg50} | 200-day MA: $${stockData.priceAvg200}

Return ONLY this JSON, no other text:
{
  "verdict": "BUY | HOLD | SELL",
  "conviction": "HIGH | MODERATE | LOW",
  "targetPrice": <number, 12-month target>,
  "upside": <number, % from current price>,
  "thesis": "2-3 sentence core thesis",
  "isPunished": <boolean, is this stock unfairly punished?>,
  "edge": "1 sentence: where is the edge",
  "agents": [
    { "name": "Macro Structuralist", "stance": "BULLISH | BEARISH | NEUTRAL", "reasoning": "2-3 sentences on macro/sector positioning" },
    { "name": "Quantitative", "stance": "BULLISH | BEARISH | NEUTRAL", "reasoning": "2-3 sentences on valuation multiples vs history/sector" },
    { "name": "Tail Risk", "stance": "BULLISH | BEARISH | NEUTRAL", "reasoning": "2-3 sentences on downside risks and asymmetry" }
  ],
  "bull": { "prob": <0-100>, "scenario": "1 sentence + price" },
  "base": { "prob": <0-100>, "scenario": "1 sentence + price" },
  "bear": { "prob": <0-100>, "scenario": "1 sentence + price" },
  "watchItems": ["3 specific catalysts to watch"]
}`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.error('Claude error:', err);
      return res.status(500).json({ error: 'Analysis engine error' });
    }

    const claudeData = await claudeRes.json();
    let text = claudeData.content[0].text.trim();

    let analysis;
    try {
      analysis = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) analysis = JSON.parse(match[0]);
      else throw new Error('Could not parse analysis');
    }

    return res.status(200).json({ stockData, analysis });

  } catch (err) {
    console.error('Analyze error:', err);
    return res.status(500).json({ error: 'Analysis failed', message: err.message });
  }
}
