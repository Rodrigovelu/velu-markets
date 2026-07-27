// api/radar.js
// RADAR — detecta empresas en temas estructurales que apenas estan inflexionando,
// ANTES de que el movimiento sea obvio. Penaliza explicitamente las que ya corrieron.
//
// El patron que busca (inspirado en casos como SanDisk pre-rally):
//   1. Tema con viento estructural a favor
//   2. Fundamentales acelerando (no solo creciendo)
//   3. Barata contra su propio crecimiento
//   4. Fuera del radar (cap chico suma, pero no excluye a las grandes)
//   5. TEMPRANO en el movimiento (lo mas importante)

export const maxDuration = 60;

const THEMES = {
  'AI Infrastructure & Memory': ['MU','SNDK','WDC','STX','MRVL','AVGO','VRT','SMCI','ANET','CRDO','ALAB','PSTG','NTAP'],
  'Power & Grid for AI':        ['VST','CEG','NRG','TLN','GEV','PWR','ETN','EMR','AES','NEE'],
  'Nuclear & Uranium':          ['CCJ','LEU','SMR','OKLO','BWXT','UEC','DNN'],
  'Defense & Aerospace':        ['LMT','RTX','NOC','GD','LHX','HII','AVAV','KTOS','LDOS'],
  'Cybersecurity':              ['PANW','CRWD','ZS','FTNT','S','CYBR','TENB','OKTA'],
  'Robotics & Automation':      ['ISRG','ROK','TER','SYM','PATH','CGNX','ZBRA'],
  'Space & Satellites':         ['RKLB','ASTS','PL','LUNR','RDW','IRDM'],
  'Metabolic & Biotech':        ['LLY','VKTX','AMGN','REGN','VRTX','MDGL','ALNY'],
  'Quantum Computing':          ['IONQ','RGTI','QBTS'],
  'Critical Materials':         ['MP','ALB','LAC','FCX','TROX','NEM'],
};

const BATCH = 50;

function themeOf(sym) {
  for (const t in THEMES) if (THEMES[t].indexOf(sym) !== -1) return t;
  return null;
}

async function fmp(path, FMP) {
  try {
    const r = await fetch(`https://financialmodelingprep.com/stable/${path}&apikey=${FMP}`);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// Que tan temprano esta el movimiento. Este es el factor decisivo:
// una accion que ya subio 500% pierde casi todos los puntos aqui.
function timingScore(price, ma200) {
  if (!price || !ma200 || ma200 <= 0) return 8;
  const r = price / ma200;
  if (r < 0.85) return 12;   // muy por debajo — puede estar rota, no girando
  if (r < 1.05) return 25;   // apenas cruzando — el punto ideal
  if (r < 1.25) return 23;   // tendencia temprana
  if (r < 1.55) return 16;   // tendencia establecida
  if (r < 2.10) return 8;    // extendida
  if (r < 3.00) return 3;    // muy extendida
  return 1;                  // el movimiento ya ocurrio
}

function capScore(mc) {
  if (!mc) return 6;
  const b = mc / 1e9;
  if (b < 3)   return 15;
  if (b < 15)  return 13;
  if (b < 60)  return 10;
  if (b < 200) return 6;
  if (b < 800) return 3;
  return 2;
}

export default async function handler(req, res) {
  const FMP = process.env.FMP_API_KEY;
  if (!FMP) return res.status(500).json({ error: 'FMP API key not configured' });

  const ALL = [];
  for (const t in THEMES) THEMES[t].forEach(s => { if (ALL.indexOf(s) === -1) ALL.push(s); });

  try {
    // FASE 1 — quotes de todo el universo tematico
    const quotes = [];
    for (let i = 0; i < ALL.length; i += BATCH) {
      const slice = ALL.slice(i, i + BATCH);
      const rs = await Promise.all(slice.map(s => fmp(`quote?symbol=${s}`, FMP)));
      rs.forEach(arr => {
        const q = Array.isArray(arr) ? arr[0] : null;
        // Exigir datos completos: si le falta cualquiera de estos, el analisis
        // posterior fallaria, asi que mejor no listarla.
        if (q && q.symbol && q.name && q.price > 2 &&
            typeof q.yearHigh === 'number' && q.yearHigh > 0 &&
            typeof q.priceAvg200 === 'number' && q.priceAvg200 > 0 &&
            typeof q.marketCap === 'number' && q.marketCap > 0) {
          quotes.push(q);
        }
      });
    }
    if (quotes.length === 0) return res.status(500).json({ error: 'No market data' });

    // Pre-ranking barato: timing + tamano. Nos quedamos con los mejores 26
    // para gastar las llaamadas caras (fundamentales) solo donde importa.
    const pre = quotes.map(q => ({
      q,
      pre: timingScore(q.price, q.priceAvg200) + capScore(q.marketCap)
    })).sort((a, b) => b.pre - a.pre).slice(0, 18);

    // FASE 2 — fundamentales solo de los finalistas
    const enriched = [];
    for (let i = 0; i < pre.length; i += BATCH) {
      const slice = pre.slice(i, i + BATCH);
      const results = await Promise.all(slice.map(async (item) => {
        const sym = item.q.symbol;
        const [ratios, income] = await Promise.all([
          fmp(`ratios-ttm?symbol=${sym}`, FMP),
          fmp(`income-statement?symbol=${sym}&period=annual&limit=4`, FMP)
        ]);
        return { item, ratios: Array.isArray(ratios) ? ratios[0] : null,
                 income: Array.isArray(income) ? income : null };
      }));
      results.forEach(r => enriched.push(r));
    }

    // FASE 3 — puntaje compuesto
    const scored = enriched.map(({ item, ratios, income }) => {
      const q = item.q;
      const sym = q.symbol;

      // --- Inflexion fundamental (35 pts) ---
      let inflection = 0, revYoY = null, revAccel = null, marginDelta = null;
      if (income && income.length >= 2) {
        const rows = income
          .filter(r => r && typeof r.revenue === 'number' && r.revenue > 0)
          .sort((a, b) => String(a.fiscalYear).localeCompare(String(b.fiscalYear)));
        if (rows.length >= 2) {
          const n = rows.length;
          revYoY = ((rows[n-1].revenue - rows[n-2].revenue) / rows[n-2].revenue) * 100;
          if (rows.length >= 3) {
            const prevYoY = ((rows[n-2].revenue - rows[n-3].revenue) / rows[n-3].revenue) * 100;
            revAccel = revYoY - prevYoY;   // positivo = acelerando
          }
          const m1 = rows[n-1].revenue ? rows[n-1].netIncome / rows[n-1].revenue : null;
          const m0 = rows[n-2].revenue ? rows[n-2].netIncome / rows[n-2].revenue : null;
          if (m1 != null && m0 != null) marginDelta = (m1 - m0) * 100;

          // Crecimiento — y castigo si los ingresos caen
          if (revYoY >= 40) inflection += 18;
          else if (revYoY >= 20) inflection += 14;
          else if (revYoY >= 10) inflection += 9;
          else if (revYoY >= 3)  inflection += 5;
          else if (revYoY < 0)   inflection -= 10;

          // Aceleracion — lo que distingue "creciendo" de "despegando".
          // Una empresa que crece pero cada vez MENOS no es una inflexion.
          if (revAccel != null) {
            if (revAccel >= 15) inflection += 12;
            else if (revAccel >= 5) inflection += 8;
            else if (revAccel > 0)  inflection += 4;
            else if (revAccel <= -30) inflection -= 12;
            else if (revAccel <= -10) inflection -= 6;
          }

          // Margenes: expansion suma, colapso resta
          if (marginDelta != null) {
            if (marginDelta >= 3) inflection += 5;
            else if (marginDelta > 0.5) inflection += 3;
            else if (marginDelta <= -15) inflection -= 10;
            else if (marginDelta <= -3)  inflection -= 5;
          }
        }
      }

      // --- Valuacion contra crecimiento (25 pts) ---
      let valuation = 4, pe = null, pegLike = null;
      if (ratios && typeof ratios.priceToEarningsRatioTTM === 'number') {
        pe = ratios.priceToEarningsRatioTTM;
        if (pe < 0) {
          // Sin utilidades: no hay valuacion que sostenga la tesis todavia
          valuation = -6;
        } else if (pe > 0 && revYoY != null && revYoY > 0) {
          pegLike = pe / revYoY;
          if (pegLike < 0.3) valuation = 25;
          else if (pegLike < 0.6) valuation = 21;
          else if (pegLike < 1.0) valuation = 16;
          else if (pegLike < 2.0) valuation = 10;
          else if (pegLike < 4.0) valuation = 5;
          else valuation = 0;
        } else if (pe > 0 && pe < 20) {
          valuation = 12;
        }
      }

      const timing = timingScore(q.price, q.priceAvg200);
      const radarCap = capScore(q.marketCap);

      // Puerta de calidad: solo premia cuando las tres piezas apuntan igual
      // (crece, acelera y expande margenes) y cuando ya hay utilidades.
      let quality = 0;
      if (revYoY != null && revYoY > 0 &&
          revAccel != null && revAccel > 0 &&
          marginDelta != null && marginDelta > 0) quality += 10;
      if (pe != null && pe > 0) quality += 5;

      const total = Math.round(inflection + valuation + timing + radarCap + quality);

      const from52High = q.yearHigh ? ((q.yearHigh - q.price) / q.yearHigh) * 100 : null;
      const vsMA200 = q.priceAvg200 ? ((q.price - q.priceAvg200) / q.priceAvg200) * 100 : null;

      // Etiqueta de en que momento del movimiento esta
      let stage;
      const r = q.priceAvg200 ? q.price / q.priceAvg200 : 1;
      if (r < 0.85) stage = 'Basing';
      else if (r < 1.05) stage = 'Just turning';
      else if (r < 1.25) stage = 'Early trend';
      else if (r < 1.55) stage = 'In trend';
      else if (r < 2.10) stage = 'Extended';
      else stage = 'Late';

      return {
        symbol: sym,
        name: q.name,
        theme: themeOf(sym),
        price: q.price,
        changePct: q.changePercentage,
        marketCap: q.marketCap,
        pe: pe != null ? Math.round(pe * 10) / 10 : null,
        revYoY: revYoY != null ? Math.round(revYoY * 10) / 10 : null,
        revAccel: revAccel != null ? Math.round(revAccel * 10) / 10 : null,
        marginDelta: marginDelta != null ? Math.round(marginDelta * 10) / 10 : null,
        pegLike: pegLike != null ? Math.round(pegLike * 100) / 100 : null,
        vsMA200: vsMA200 != null ? Math.round(vsMA200 * 10) / 10 : null,
        from52High: from52High != null ? Math.round(from52High * 10) / 10 : null,
        stage,
        scores: { inflection, valuation, timing, radar: radarCap, quality },
        radarScore: total
      };
    });

    const ranked = scored
      // Sin datos de ingresos no hay tesis de inflexion que evaluar
      .filter(s => s.revYoY !== null)
      .filter(s => s.radarScore >= 35)
      .sort((a, b) => b.radarScore - a.radarScore)
      .slice(0, 20);

    const themeCounts = {};
    ranked.forEach(s => { if (s.theme) themeCounts[s.theme] = (themeCounts[s.theme] || 0) + 1; });

    return res.status(200).json({
      count: ranked.length,
      stocks: ranked,
      scanned: quotes.length,
      universe: ALL.length,
      themeBreakdown: themeCounts,
      generatedAt: new Date().toISOString()
    });

  } catch (err) {
    console.error('Radar error:', err);
    return res.status(500).json({ error: 'Radar failed', message: err.message });
  }
}
