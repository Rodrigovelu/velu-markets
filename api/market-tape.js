// api/market-tape.js
// Precios reales para la cinta del home. Usa ETFs y pares que funcionan
// en el plan Starter; si alguno falla, esa entrada simplemente se omite.

export const maxDuration = 20;

// label: lo que ve el usuario | symbol: lo que pedimos a FMP
const TAPE = [
  { label: 'S&P 500',  symbol: 'SPY'    },
  { label: 'NASDAQ',   symbol: 'QQQ'    },
  { label: 'DOW',      symbol: 'DIA'    },
  { label: 'RUSSELL',  symbol: 'IWM'    },
  { label: 'GOLD',     symbol: 'GLD'    },
  { label: 'OIL',      symbol: 'USO'    },
  { label: 'BTC',      symbol: 'BTCUSD' },
  { label: 'ETH',      symbol: 'ETHUSD' },
  { label: 'NVDA',     symbol: 'NVDA'   },
  { label: 'AAPL',     symbol: 'AAPL'   },
  { label: 'MSFT',     symbol: 'MSFT'   },
  { label: 'TSLA',     symbol: 'TSLA'   },
];

function fmtPrice(v) {
  if (v == null) return null;
  if (v >= 10000) return Math.round(v).toLocaleString('en-US');
  if (v >= 1000)  return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (v >= 100)   return v.toFixed(2);
  if (v >= 1)     return v.toFixed(2);
  return v.toFixed(4);
}

export default async function handler(req, res) {
  const FMP = process.env.FMP_API_KEY;
  if (!FMP) return res.status(500).json({ error: 'FMP API key not configured' });

  try {
    const results = await Promise.all(TAPE.map(async (item) => {
      try {
        const r = await fetch(
          `https://financialmodelingprep.com/stable/quote?symbol=${item.symbol}&apikey=${FMP}`
        );
        if (!r.ok) return null;
        const arr = await r.json();
        const q = Array.isArray(arr) ? arr[0] : null;
        if (!q || typeof q.price !== 'number') return null;

        const pct = typeof q.changePercentage === 'number' ? q.changePercentage : null;
        return {
          label: item.label,
          symbol: item.symbol,
          price: fmtPrice(q.price),
          pct: pct != null ? Math.round(pct * 100) / 100 : null,
          up: pct != null ? pct >= 0 : null
        };
      } catch {
        return null;
      }
    }));

    const ticks = results.filter(Boolean);
    if (ticks.length === 0) {
      return res.status(200).json({ ticks: [], stale: true });
    }

    // Cache en el borde: la cinta no necesita ser al segundo
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
    return res.status(200).json({ ticks, updatedAt: new Date().toISOString() });

  } catch (err) {
    console.error('Tape error:', err);
    return res.status(500).json({ error: 'Tape failed' });
  }
}
