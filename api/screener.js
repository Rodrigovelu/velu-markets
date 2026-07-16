// api/screener.js
// Encuentra acciones "castigadas" — oversold técnicamente pero con fundamentales sólidos
// Este es el edge de Velu Markets

export default async function handler(req, res) {
  const FMP = process.env.FMP_API_KEY;
  if (!FMP) return res.status(500).json({ error: 'FMP API key not configured' });

  try {
    // 1. Screener base: empresas grandes, con P/E razonable, cerca de mínimos
    // FMP stock-screener filtra por múltiples criterios
    const screenerUrl = `https://financialmodelingprep.com/api/v3/stock-screener?` +
      `marketCapMoreThan=2000000000&` +      // Market cap > $2B (evita micro-caps)
      `betaMoreThan=0.5&` +
      `volumeMoreThan=1000000&` +            // Líquidas
      `exchange=NASDAQ,NYSE&` +
      `isActivelyTrading=true&` +
      `limit=100&` +
      `apikey=${FMP}`;

    const screenerRes = await fetch(screenerUrl);
    const candidates = await screenerRes.json();

    if (!Array.isArray(candidates)) {
      return res.status(500).json({ error: 'Screener failed', detail: candidates });
    }

    // 2. Para cada candidato, obtener quote con métricas técnicas
    // Limitamos a los primeros 30 para no agotar el rate limit
    const symbols = candidates.slice(0, 30).map(c => c.symbol).join(',');

    const quoteUrl = `https://financialmodelingprep.com/api/v3/quote/${symbols}?apikey=${FMP}`;
    const quoteRes = await fetch(quoteUrl);
    const quotes = await quoteRes.json();

    if (!Array.isArray(quotes)) {
      return res.status(500).json({ error: 'Quote fetch failed' });
    }

    // 3. Calcular el "punishment score" para cada acción
    const analyzed = quotes.map(q => {
      // Distancia del precio actual al máximo de 52 semanas (qué tan castigada está)
      const from52High = q.yearHigh ? ((q.yearHigh - q.price) / q.yearHigh) * 100 : 0;
      // Distancia del mínimo de 52 semanas (qué tan cerca del fondo)
      const from52Low = q.yearLow ? ((q.price - q.yearLow) / q.yearLow) * 100 : 0;
      // Precio vs media móvil de 50 y 200 días
      const belowMA50 = q.priceAvg50 ? ((q.priceAvg50 - q.price) / q.priceAvg50) * 100 : 0;
      const belowMA200 = q.priceAvg200 ? ((q.priceAvg200 - q.price) / q.priceAvg200) * 100 : 0;

      // Punishment score: qué tan castigada (mayor = más castigada)
      // Combina distancia del máximo + por debajo de medias móviles
      const punishmentScore = Math.round(
        (from52High * 0.5) + (belowMA50 * 0.25) + (belowMA200 * 0.25)
      );

      return {
        symbol: q.symbol,
        name: q.name,
        price: q.price,
        change: q.change,
        changePct: q.changesPercentage,
        pe: q.pe,
        eps: q.eps,
        marketCap: q.marketCap,
        yearHigh: q.yearHigh,
        yearLow: q.yearLow,
        from52High: Math.round(from52High * 10) / 10,
        from52Low: Math.round(from52Low * 10) / 10,
        belowMA50: Math.round(belowMA50 * 10) / 10,
        belowMA200: Math.round(belowMA200 * 10) / 10,
        punishmentScore,
        volume: q.volume,
        avgVolume: q.avgVolume
      };
    });

    // 4. Filtrar: solo las castigadas (más de 20% del máximo) CON fundamentales sanos
    // El edge está donde el mercado castigó pero el P/E sigue siendo razonable
    const punished = analyzed
      .filter(s =>
        s.from52High >= 20 &&           // Castigada: 20%+ abajo del máximo
        s.pe > 0 && s.pe < 40 &&        // P/E razonable (no burbuja, no pérdidas)
        s.price > 5                      // Evita penny stocks
      )
      .sort((a, b) => b.punishmentScore - a.punishmentScore)
      .slice(0, 15);

    return res.status(200).json({
      count: punished.length,
      stocks: punished,
      generatedAt: new Date().toISOString()
    });

  } catch (err) {
    console.error('Screener error:', err);
    return res.status(500).json({ error: 'Screener failed', message: err.message });
  }
}
