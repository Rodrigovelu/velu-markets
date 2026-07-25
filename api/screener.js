// api/screener.js
// Screener de acciones castigadas — versión expandida (FMP Starter)
// Escanea ~150 acciones en lotes, calcula el "punishment score",
// y enriquece las mejores con P/E real.

const UNIVERSE = [
  // Mega-cap tech & software
  { s: 'AAPL',  sec: 'Technology' },  { s: 'MSFT',  sec: 'Technology' },
  { s: 'GOOGL', sec: 'Technology' },  { s: 'AMZN',  sec: 'Consumer Discretionary' },
  { s: 'META',  sec: 'Communication' }, { s: 'NFLX', sec: 'Communication' },
  { s: 'CRM',   sec: 'Technology' },  { s: 'ORCL',  sec: 'Technology' },
  { s: 'ADBE',  sec: 'Technology' },  { s: 'NOW',   sec: 'Technology' },
  { s: 'INTU',  sec: 'Technology' },  { s: 'SNOW',  sec: 'Technology' },
  { s: 'DDOG',  sec: 'Technology' },  { s: 'MDB',   sec: 'Technology' },
  { s: 'TEAM',  sec: 'Technology' },  { s: 'OKTA',  sec: 'Technology' },
  { s: 'TWLO',  sec: 'Technology' },  { s: 'NET',   sec: 'Technology' },
  { s: 'CRWD',  sec: 'Technology' },  { s: 'PANW',  sec: 'Technology' },
  { s: 'ZS',    sec: 'Technology' },  { s: 'PLTR',  sec: 'Technology' },
  { s: 'SHOP',  sec: 'Technology' },  { s: 'ZM',    sec: 'Technology' },
  { s: 'DOCU',  sec: 'Technology' },  { s: 'U',     sec: 'Technology' },
  { s: 'RBLX',  sec: 'Communication' },

  // Semiconductores
  { s: 'NVDA',  sec: 'Semiconductors' }, { s: 'AMD',  sec: 'Semiconductors' },
  { s: 'INTC',  sec: 'Semiconductors' }, { s: 'AVGO', sec: 'Semiconductors' },
  { s: 'QCOM',  sec: 'Semiconductors' }, { s: 'TXN',  sec: 'Semiconductors' },
  { s: 'MU',    sec: 'Semiconductors' }, { s: 'ADI',  sec: 'Semiconductors' },
  { s: 'NXPI',  sec: 'Semiconductors' }, { s: 'MRVL', sec: 'Semiconductors' },
  { s: 'ON',    sec: 'Semiconductors' }, { s: 'SWKS', sec: 'Semiconductors' },
  { s: 'MCHP',  sec: 'Semiconductors' }, { s: 'LRCX', sec: 'Semiconductors' },
  { s: 'AMAT',  sec: 'Semiconductors' }, { s: 'KLAC', sec: 'Semiconductors' },
  { s: 'TSM',   sec: 'Semiconductors' }, { s: 'ARM',  sec: 'Semiconductors' },

  // Fintech y pagos
  { s: 'V',     sec: 'Financials' },  { s: 'MA',    sec: 'Financials' },
  { s: 'PYPL',  sec: 'Financials' },  { s: 'SQ',    sec: 'Financials' },
  { s: 'COIN',  sec: 'Financials' },  { s: 'HOOD',  sec: 'Financials' },
  { s: 'AXP',   sec: 'Financials' },  { s: 'SCHW',  sec: 'Financials' },

  // Bancos y financieras
  { s: 'JPM',   sec: 'Financials' },  { s: 'BAC',   sec: 'Financials' },
  { s: 'WFC',   sec: 'Financials' },  { s: 'GS',    sec: 'Financials' },
  { s: 'MS',    sec: 'Financials' },  { s: 'C',     sec: 'Financials' },
  { s: 'BLK',   sec: 'Financials' },  { s: 'COF',   sec: 'Financials' },
  { s: 'USB',   sec: 'Financials' },  { s: 'PNC',   sec: 'Financials' },

  // Consumo discrecional
  { s: 'TSLA',  sec: 'Consumer Discretionary' }, { s: 'HD',   sec: 'Consumer Discretionary' },
  { s: 'LOW',   sec: 'Consumer Discretionary' }, { s: 'NKE',  sec: 'Consumer Discretionary' },
  { s: 'SBUX',  sec: 'Consumer Discretionary' }, { s: 'MCD',  sec: 'Consumer Discretionary' },
  { s: 'CMG',   sec: 'Consumer Discretionary' }, { s: 'LULU', sec: 'Consumer Discretionary' },
  { s: 'TGT',   sec: 'Consumer Discretionary' }, { s: 'TJX',  sec: 'Consumer Discretionary' },
  { s: 'ROST',  sec: 'Consumer Discretionary' }, { s: 'BKNG', sec: 'Consumer Discretionary' },
  { s: 'MAR',   sec: 'Consumer Discretionary' }, { s: 'HLT',  sec: 'Consumer Discretionary' },
  { s: 'RCL',   sec: 'Consumer Discretionary' }, { s: 'CCL',  sec: 'Consumer Discretionary' },
  { s: 'F',     sec: 'Consumer Discretionary' }, { s: 'GM',   sec: 'Consumer Discretionary' },
  { s: 'RIVN',  sec: 'Consumer Discretionary' }, { s: 'ABNB', sec: 'Consumer Discretionary' },
  { s: 'UBER',  sec: 'Consumer Discretionary' }, { s: 'DASH', sec: 'Consumer Discretionary' },

  // Consumo básico
  { s: 'PG',    sec: 'Consumer Staples' }, { s: 'KO',   sec: 'Consumer Staples' },
  { s: 'PEP',   sec: 'Consumer Staples' }, { s: 'COST', sec: 'Consumer Staples' },
  { s: 'WMT',   sec: 'Consumer Staples' }, { s: 'CL',   sec: 'Consumer Staples' },
  { s: 'KMB',   sec: 'Consumer Staples' }, { s: 'GIS',  sec: 'Consumer Staples' },
  { s: 'HSY',   sec: 'Consumer Staples' }, { s: 'MDLZ', sec: 'Consumer Staples' },
  { s: 'STZ',   sec: 'Consumer Staples' }, { s: 'KHC',  sec: 'Consumer Staples' },

  // Salud y farma
  { s: 'JNJ',   sec: 'Healthcare' },  { s: 'UNH',   sec: 'Healthcare' },
  { s: 'PFE',   sec: 'Healthcare' },  { s: 'MRK',   sec: 'Healthcare' },
  { s: 'ABBV',  sec: 'Healthcare' },  { s: 'LLY',   sec: 'Healthcare' },
  { s: 'TMO',   sec: 'Healthcare' },  { s: 'ABT',   sec: 'Healthcare' },
  { s: 'DHR',   sec: 'Healthcare' },  { s: 'BMY',   sec: 'Healthcare' },
  { s: 'AMGN',  sec: 'Healthcare' },  { s: 'GILD',  sec: 'Healthcare' },
  { s: 'CVS',   sec: 'Healthcare' },  { s: 'CI',    sec: 'Healthcare' },
  { s: 'HUM',   sec: 'Healthcare' },  { s: 'MRNA',  sec: 'Healthcare' },
  { s: 'BNTX',  sec: 'Healthcare' },  { s: 'REGN',  sec: 'Healthcare' },
  { s: 'VRTX',  sec: 'Healthcare' },  { s: 'BIIB',  sec: 'Healthcare' },
  { s: 'ISRG',  sec: 'Healthcare' },  { s: 'MDT',   sec: 'Healthcare' },
  { s: 'SYK',   sec: 'Healthcare' },  { s: 'BSX',   sec: 'Healthcare' },

  // Energía
  { s: 'XOM',   sec: 'Energy' },  { s: 'CVX',   sec: 'Energy' },
  { s: 'COP',   sec: 'Energy' },  { s: 'EOG',   sec: 'Energy' },
  { s: 'SLB',   sec: 'Energy' },  { s: 'PSX',   sec: 'Energy' },
  { s: 'VLO',   sec: 'Energy' },  { s: 'MPC',   sec: 'Energy' },
  { s: 'OXY',   sec: 'Energy' },  { s: 'DVN',   sec: 'Energy' },
  { s: 'HAL',   sec: 'Energy' },  { s: 'KMI',   sec: 'Energy' },

  // Industriales
  { s: 'BA',    sec: 'Industrials' },  { s: 'CAT',   sec: 'Industrials' },
  { s: 'DE',    sec: 'Industrials' },  { s: 'GE',    sec: 'Industrials' },
  { s: 'HON',   sec: 'Industrials' },  { s: 'LMT',   sec: 'Industrials' },
  { s: 'RTX',   sec: 'Industrials' },  { s: 'NOC',   sec: 'Industrials' },
  { s: 'GD',    sec: 'Industrials' },  { s: 'MMM',   sec: 'Industrials' },
  { s: 'UPS',   sec: 'Industrials' },  { s: 'FDX',   sec: 'Industrials' },
  { s: 'UNP',   sec: 'Industrials' },  { s: 'CSX',   sec: 'Industrials' },
  { s: 'EMR',   sec: 'Industrials' },  { s: 'ETN',   sec: 'Industrials' },

  // Comunicación y medios
  { s: 'DIS',   sec: 'Communication' },  { s: 'CMCSA', sec: 'Communication' },
  { s: 'T',     sec: 'Communication' },  { s: 'VZ',    sec: 'Communication' },
  { s: 'TMUS',  sec: 'Communication' },  { s: 'WBD',   sec: 'Communication' },
  { s: 'PARA',  sec: 'Communication' },  { s: 'EA',    sec: 'Communication' },
  { s: 'TTWO',  sec: 'Communication' },  { s: 'ROKU',  sec: 'Communication' },
  { s: 'SPOT',  sec: 'Communication' },  { s: 'PINS',  sec: 'Communication' },
  { s: 'SNAP',  sec: 'Communication' },

  // Inmobiliario, materiales y utilities
  { s: 'AMT',   sec: 'Real Estate' },  { s: 'PLD',   sec: 'Real Estate' },
  { s: 'CCI',   sec: 'Real Estate' },  { s: 'EQIX',  sec: 'Real Estate' },
  { s: 'SPG',   sec: 'Real Estate' },  { s: 'O',     sec: 'Real Estate' },
  { s: 'LIN',   sec: 'Materials' },    { s: 'APD',   sec: 'Materials' },
  { s: 'SHW',   sec: 'Materials' },    { s: 'FCX',   sec: 'Materials' },
  { s: 'NEM',   sec: 'Materials' },    { s: 'NEE',   sec: 'Utilities' },
  { s: 'DUK',   sec: 'Utilities' },    { s: 'SO',    sec: 'Utilities' },
];

const BATCH_SIZE = 40;

// Permite mas tiempo de ejecucion en Vercel para escanear todo el universo
export const maxDuration = 60;

async function fetchQuote(symbol, FMP) {
  try {
    const r = await fetch(`https://financialmodelingprep.com/stable/quote?symbol=${symbol}&apikey=${FMP}`);
    if (!r.ok) return null;
    const arr = await r.json();
    return Array.isArray(arr) ? arr[0] : null;
  } catch {
    return null;
  }
}

async function fetchPE(symbol, FMP) {
  try {
    const r = await fetch(`https://financialmodelingprep.com/stable/ratios-ttm?symbol=${symbol}&apikey=${FMP}`);
    if (!r.ok) return null;
    const arr = await r.json();
    const row = Array.isArray(arr) ? arr[0] : null;
    return row ? row.priceToEarningsRatioTTM : null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const FMP = process.env.FMP_API_KEY;
  if (!FMP) return res.status(500).json({ error: 'FMP API key not configured' });

  try {
    // 1. Traer quotes en lotes (respeta el límite de 300 llamadas/minuto)
    const quotes = [];
    for (let i = 0; i < UNIVERSE.length; i += BATCH_SIZE) {
      const batch = UNIVERSE.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map(u => fetchQuote(u.s, FMP)));
      results.forEach((q, idx) => {
        if (q && q.price) {
          q.__sector = batch[idx].sec;
          quotes.push(q);
        }
      });
    }

    if (quotes.length === 0) {
      return res.status(500).json({ error: 'No market data returned' });
    }

    // 2. Calcular el punishment score
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
        sector: q.__sector,
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

    // 3. Filtrar las castigadas y quedarnos con las top 15
    const punished = analyzed
      .filter(s => s.from52High >= 15 && s.price > 5)
      .sort((a, b) => b.punishmentScore - a.punishmentScore)
      .slice(0, 15);

    // 4. Enriquecer solo las top 15 con P/E real (15 llamadas extra)
    const peValues = await Promise.all(punished.map(s => fetchPE(s.symbol, FMP)));
    punished.forEach((s, i) => {
      const pe = peValues[i];
      s.pe = (typeof pe === 'number' && pe > 0) ? Math.round(pe * 10) / 10 : null;
    });

    // 5. Resumen por sector (para contexto)
    const sectorCounts = {};
    punished.forEach(s => {
      sectorCounts[s.sector] = (sectorCounts[s.sector] || 0) + 1;
    });

    return res.status(200).json({
      count: punished.length,
      stocks: punished,
      scanned: quotes.length,
      universe: UNIVERSE.length,
      sectorBreakdown: sectorCounts,
      generatedAt: new Date().toISOString()
    });

  } catch (err) {
    console.error('Screener error:', err);
    return res.status(500).json({ error: 'Screener failed', message: err.message });
  }
}
