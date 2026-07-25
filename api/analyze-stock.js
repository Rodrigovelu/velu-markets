// api/analyze-stock.js
// Análisis en vivo de una acción con 3 agentes de Velu + veredicto Buy/Hold/Sell

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
    // Rango de 1 año para el historial de precios
    const _today = new Date();
    const _yearAgo = new Date(_today.getTime() - 365 * 24 * 60 * 60 * 1000);
    const toDate = _today.toISOString().slice(0, 10);
    const fromDate = _yearAgo.toISOString().slice(0, 10);

    const [quoteRes, ratiosRes, consensusRes, newsRes, historyRes, incomeRes] = await Promise.all([
      fetch(`https://financialmodelingprep.com/stable/quote?symbol=${ticker}&apikey=${FMP}`),
      fetch(`https://financialmodelingprep.com/stable/ratios-ttm?symbol=${ticker}&apikey=${FMP}`),
      fetch(`https://financialmodelingprep.com/stable/price-target-consensus?symbol=${ticker}&apikey=${FMP}`),
      fetch(`https://financialmodelingprep.com/stable/news/stock?symbols=${ticker}&limit=6&apikey=${FMP}`),
      fetch(`https://financialmodelingprep.com/stable/historical-price-eod/light?symbol=${ticker}&from=${fromDate}&to=${toDate}&apikey=${FMP}`),
      fetch(`https://financialmodelingprep.com/stable/income-statement?symbol=${ticker}&period=annual&limit=5&apikey=${FMP}`)
    ]);

    const quoteArr = await quoteRes.json();
    const ratiosArr = await ratiosRes.json();

    const quote = Array.isArray(quoteArr) ? quoteArr[0] : null;
    const ratios = Array.isArray(ratiosArr) ? ratiosArr[0] : {};
    let consensus = null;
    try {
      const consensusArr = await consensusRes.json();
      consensus = Array.isArray(consensusArr) && consensusArr[0] ? consensusArr[0] : null;
    } catch (e) { consensus = null; }

    let news = [];
    try {
      const newsArr = await newsRes.json();
      news = Array.isArray(newsArr) ? newsArr.slice(0, 6) : [];
    } catch (e) { news = []; }

    // Historial de precios — reducido a ~130 puntos para un payload ligero
    let history = [];
    try {
      const histArr = await historyRes.json();
      if (Array.isArray(histArr) && histArr.length > 0) {
        const step = Math.max(1, Math.floor(histArr.length / 130));
        history = histArr
          .filter((_, i) => i % step === 0)
          .map(h => ({ d: h.date, p: h.price }));
      }
    } catch (e) { history = []; }

    // Fundamentales anuales (5 años) — para que los agentes razonen sobre trayectoria
    let fundamentals = null;
    try {
      const incArr = await incomeRes.json();
      if (Array.isArray(incArr) && incArr.length >= 2) {
        // Ordenar del mas antiguo al mas reciente
        const rows = incArr
          .filter(r => r && typeof r.revenue === 'number' && r.revenue > 0)
          .sort((a, b) => String(a.fiscalYear).localeCompare(String(b.fiscalYear)));

        if (rows.length >= 2) {
          const years = rows.map(r => ({
            year: r.fiscalYear,
            revenue: r.revenue,
            netIncome: r.netIncome,
            eps: r.epsDiluted != null ? r.epsDiluted : r.eps,
            grossMargin: r.revenue ? r.grossProfit / r.revenue : null,
            operatingMargin: r.revenue ? r.operatingIncome / r.revenue : null,
            netMargin: r.revenue ? r.netIncome / r.revenue : null
          }));

          const first = years[0];
          const last = years[years.length - 1];
          const nYears = years.length - 1;

          const cagr = (endVal, startVal, n) => {
            if (!startVal || startVal <= 0 || !endVal || endVal <= 0 || n <= 0) return null;
            return (Math.pow(endVal / startVal, 1 / n) - 1) * 100;
          };

          const marginDelta = (last.netMargin != null && first.netMargin != null)
            ? (last.netMargin - first.netMargin) * 100
            : null;

          fundamentals = {
            years,
            revenueCagr: cagr(last.revenue, first.revenue, nYears),
            epsCagr: cagr(last.eps, first.eps, nYears),
            netIncomeCagr: cagr(last.netIncome, first.netIncome, nYears),
            marginDeltaPp: marginDelta,
            marginTrend: marginDelta == null ? 'unknown'
              : marginDelta > 1.5 ? 'expanding'
              : marginDelta < -1.5 ? 'compressing'
              : 'stable',
            spanYears: nYears
          };
        }
      }
    } catch (e) { fundamentals = null; }

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
      eps: ratios.netIncomePerShareTTM,
      wallStreetTarget: consensus ? consensus.targetConsensus : null,
      wallStreetHigh: consensus ? consensus.targetHigh : null,
      wallStreetLow: consensus ? consensus.targetLow : null,
      wallStreetMedian: consensus ? consensus.targetMedian : null
    };

    const fmt = (v, d = 1) => (typeof v === 'number' ? v.toFixed(d) : 'N/A');
    const pct = (v) => (typeof v === 'number' ? (v * 100).toFixed(1) + '%' : 'N/A');

    const prompt = `You are Velu, an equity analysis engine with 3 specialized agents analyzing ${ticker} (${stockData.name}).

LIVE DATA:
- Price: $${stockData.price} (${stockData.changePct > 0 ? '+' : ''}${fmt(stockData.changePct, 2)}% today)
- 52-week range: $${stockData.yearLow} - $${stockData.yearHigh}
- Down ${stockData.from52High}% from 52-week high
- P/E: ${fmt(stockData.pe)} | P/B: ${fmt(stockData.pb)} | P/S: ${fmt(stockData.ps)}
- EPS (TTM): $${fmt(stockData.eps, 2)}
- Market cap: $${fmt(stockData.marketCap / 1e9)}B
- Net margin: ${pct(stockData.netMargin)} | Gross margin: ${pct(stockData.grossMargin)}
- Debt/Equity: ${fmt(stockData.debtToEquity, 2)}
- 50-day MA: $${stockData.priceAvg50} | 200-day MA: $${stockData.priceAvg200}

5-YEAR FUNDAMENTAL TRAJECTORY:
${fundamentals ? (
  fundamentals.years.map(y =>
    `FY${y.year}: Revenue $${(y.revenue/1e9).toFixed(1)}B | Net income $${(y.netIncome/1e9).toFixed(1)}B | Net margin ${(y.netMargin*100).toFixed(1)}% | EPS $${y.eps != null ? y.eps.toFixed(2) : 'N/A'}`
  ).join('\n') +
  `\nRevenue CAGR (${fundamentals.spanYears}y): ${fundamentals.revenueCagr != null ? (fundamentals.revenueCagr > 0 ? '+' : '') + fundamentals.revenueCagr.toFixed(1) + '%' : 'N/A'}` +
  `\nEPS CAGR (${fundamentals.spanYears}y): ${fundamentals.epsCagr != null ? (fundamentals.epsCagr > 0 ? '+' : '') + fundamentals.epsCagr.toFixed(1) + '%' : 'N/A'}` +
  `\nNet margin trend: ${fundamentals.marginTrend}${fundamentals.marginDeltaPp != null ? ' (' + (fundamentals.marginDeltaPp > 0 ? '+' : '') + fundamentals.marginDeltaPp.toFixed(1) + 'pp over period)' : ''}`
) : 'Annual fundamentals not available for this ticker.'}

CRITICAL QUESTION: Compare the fundamental trajectory above against the ${stockData.from52High}% price decline. If the business is growing while the stock fell, that gap is the edge. If the business is deteriorating, the selloff may be justified. Your agents must address this directly.

RECENT NEWS HEADLINES (most recent first):
${news.length > 0 ? news.map((n, i) => `${i+1}. [${n.publishedDate?.slice(0,10)}] ${n.title} — ${n.text?.slice(0, 150)}`).join('\n') : 'No recent news available.'}

Respond with ONLY a raw JSON object. No markdown, no code fences, no text before or after. Start your response with { and end with }.

{
  "verdict": "BUY or HOLD or SELL",
  "conviction": "HIGH or MODERATE or LOW",
  "targetPrice": 0,
  "upside": 0,
  "thesis": "2-3 sentence core thesis",
  "isPunished": true,
  "edge": "1 sentence on the edge",
  "whyPunished": "2-3 sentences explaining WHY this stock has sold off, citing the specific recent news/catalysts above. If no clear catalyst, explain the likely reason from the data (sector rotation, earnings miss, valuation reset, etc.)",
  "whyPunishedShort": "1 short sentence summary of the main reason for the selloff",
  "agents": [
    { "name": "Macro Structuralist", "stance": "BULLISH or BEARISH or NEUTRAL", "reasoning": "2-3 sentences" },
    { "name": "Quantitative", "stance": "BULLISH or BEARISH or NEUTRAL", "reasoning": "2-3 sentences" },
    { "name": "Tail Risk", "stance": "BULLISH or BEARISH or NEUTRAL", "reasoning": "2-3 sentences" }
  ],
  "bull": { "prob": 0, "scenario": "1 sentence + price" },
  "base": { "prob": 0, "scenario": "1 sentence + price" },
  "bear": { "prob": 0, "scenario": "1 sentence + price" },
  "watchItems": ["catalyst 1", "catalyst 2", "catalyst 3"]
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

    const claudeJson = await claudeRes.json();

    if (!claudeRes.ok) {
      console.error('Claude API error:', JSON.stringify(claudeJson));
      return res.status(500).json({ error: 'Analysis engine error', detail: claudeJson.error?.message || 'unknown' });
    }

    if (!claudeJson.content || !claudeJson.content[0] || !claudeJson.content[0].text) {
      console.error('Unexpected Claude response:', JSON.stringify(claudeJson));
      return res.status(500).json({ error: 'Empty analysis response' });
    }

    let text = claudeJson.content[0].text.trim();

    // Limpiar posibles code fences
    text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    let analysis;
    try {
      analysis = JSON.parse(text);
    } catch (parseErr) {
      // Intentar extraer el objeto JSON
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          analysis = JSON.parse(match[0]);
        } catch (e2) {
          console.error('JSON parse failed. Raw text:', text.slice(0, 500));
          return res.status(500).json({ error: 'Could not parse analysis', raw: text.slice(0, 200) });
        }
      } else {
        console.error('No JSON found. Raw text:', text.slice(0, 500));
        return res.status(500).json({ error: 'No analysis returned', raw: text.slice(0, 200) });
      }
    }

    // Guardar la llamada de Velu en el track record
    // IMPORTANTE: hay que esperar (await) el guardado. En serverless, la funcion
    // se congela al devolver la respuesta y mataria un fetch en vuelo.
    if (analysis.verdict === 'BUY' || analysis.verdict === 'SELL') {
      try {
        const SUPABASE_URL = 'https://osrjmchajyrgdlucniid.supabase.co';
        const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_uL4sQ_T3HiCD6ZZ20D5thw_sc_gTK5F';

        const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/velu_calls`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            ticker: stockData.symbol,
            company: stockData.name,
            verdict: analysis.verdict,
            conviction: analysis.conviction,
            entry_price: stockData.price,
            target_price: analysis.targetPrice,
            upside: analysis.upside,
            current_price: stockData.price,
            status: 'open'
          })
        });

        if (!saveRes.ok) {
          const errTxt = await saveRes.text();
          console.error('Call save failed:', saveRes.status, errTxt);
        }
      } catch (e) {
        console.error('Track record save error:', e.message);
      }
    }

    return res.status(200).json({ stockData, analysis, news, history, fundamentals });

  } catch (err) {
    console.error('Analyze error:', err.message, err.stack);
    return res.status(500).json({ error: 'Analysis failed', message: err.message });
  }
}
