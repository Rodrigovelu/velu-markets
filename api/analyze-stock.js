// api/analyze-stock.js
// Análisis en vivo de una acción con los 3 agentes de Velu + veredicto Buy/Hold/Sell

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
    // 1. Fetch datos en vivo de FMP en paralelo
    const [quoteRes, profileRes, ratiosRes, metricsRes] = await Promise.all([
      fetch(`https://financialmodelingprep.com/api/v3/quote/${ticker}?apikey=${FMP}`),
      fetch(`https://financialmodelingprep.com/api/v3/profile/${ticker}?apikey=${FMP}`),
      fetch(`https://financialmodelingprep.com/api/v3/ratios-ttm/${ticker}?apikey=${FMP}`),
      fetch(`https://financialmodelingprep.com/api/v3/key-metrics-ttm/${ticker}?apikey=${FMP}`)
    ]);

    const quote = (await quoteRes.json())[0];
    const profile = (await profileRes.json())[0];
    const ratios = (await ratiosRes.json())[0] || {};
    const metrics = (await metricsRes.json())[0] || {};

    if (!quote) return res.status(404).json({ error: `Ticker ${ticker} not found` });

    // 2. Construir el contexto de datos
    const from52High = quote.yearHigh ? ((quote.yearHigh - quote.price) / quote.yearHigh) * 100 : 0;
    const stockData = {
      symbol: ticker,
      name: quote.name,
      price: quote.price,
      change: quote.change,
      changePct: quote.changesPercentage,
      pe: quote.pe,
      eps: quote.eps,
      marketCap: quote.marketCap,
      yearHigh: quote.yearHigh,
      yearLow: quote.yearLow,
      from52High: Math.round(from52High * 10) / 10,
      priceAvg50: quote.priceAvg50,
      priceAvg200: quote.priceAvg200,
      sector: profile?.sector,
      industry: profile?.industry,
      beta: profile?.beta,
      pb: ratios?.priceToBookRatioTTM,
      roe: ratios?.returnOnEquityTTM,
      debtToEquity: ratios?.debtEquityRatioTTM,
      grossMargin: ratios?.grossProfitMarginTTM,
      netMargin: ratios?.netProfitMarginTTM,
      description: profile?.description?.slice(0, 500)
    };

    // 3. Prompt para los 3 agentes
    const prompt = `You are Velu, an equity analysis engine with 3 specialized agents. Analyze ${ticker} (${stockData.name}) and return ONLY valid JSON.

LIVE DATA:
- Price: $${stockData.price} (${stockData.changePct > 0 ? '+' : ''}${stockData.changePct}% today)
- 52-week range: $${stockData.yearLow} - $${stockData.yearHigh}
- Down ${stockData.from52High}% from 52-week high
- P/E: ${stockData.pe} | EPS: $${stockData.eps} | P/B: ${stockData.pb?.toFixed(2)}
- Market cap: $${(stockData.marketCap / 1e9).toFixed(1)}B
- Sector: ${stockData.sector} | Industry: ${stockData.industry}
- Beta: ${stockData.beta}
- ROE: ${(stockData.roe * 100)?.toFixed(1)}% | Net margin: ${(stockData.netMargin * 100)?.toFixed(1)}%
- Debt/Equity: ${stockData.debtToEquity?.toFixed(2)}
- 50-day MA: $${stockData.priceAvg50} | 200-day MA: $${stockData.priceAvg200}

Business: ${stockData.description}

Return ONLY this JSON structure, no other text:
{
  "verdict": "BUY | HOLD | SELL",
  "conviction": "HIGH | MODERATE | LOW",
  "targetPrice": <number, 12-month price target>,
  "upside": <number, % upside/downside from current price>,
  "thesis": "2-3 sentence core thesis",
  "isPunished": <boolean, is this stock unfairly punished by the market?>,
  "edge": "1 sentence: where is the edge, if any",
  "agents": [
    {
      "name": "Macro Structuralist",
      "stance": "BULLISH | BEARISH | NEUTRAL",
      "reasoning": "2-3 sentences on macro/sector positioning and structural trends"
    },
    {
      "name": "Quantitative",
      "stance": "BULLISH | BEARISH | NEUTRAL",
      "reasoning": "2-3 sentences on valuation multiples, financial metrics vs historical/sector norms"
    },
    {
      "name": "Tail Risk",
      "stance": "BULLISH | BEARISH | NEUTRAL",
      "reasoning": "2-3 sentences on downside risks, what could go wrong, and asymmetry"
    }
  ],
  "bull": { "prob": <number 0-100>, "scenario": "1 sentence bull case + price" },
  "base": { "prob": <number 0-100>, "scenario": "1 sentence base case + price" },
  "bear": { "prob": <number 0-100>, "scenario": "1 sentence bear case + price" },
  "watchItems": ["3 specific catalysts or data points to watch"]
}`;

    // 4. Llamar a Claude
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
