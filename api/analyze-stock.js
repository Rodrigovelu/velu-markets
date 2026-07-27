// api/analyze-stock.js

// Mapa de sectores para comparar cada accion contra sus pares
const SECTOR_PEERS = {
  'Communication': [
    'CMCSA', 'DIS', 'EA', 'IRDM', 'META', 'NFLX', 'PARA', 'PINS', 'RBLX', 'ROKU',
    'SNAP', 'SPOT', 'T', 'TMUS', 'TTWO', 'VZ', 'WBD'
  ],
  'Consumer Discretionary': [
    'ABNB', 'AMZN', 'BKNG', 'CCL', 'CMG', 'DASH', 'F', 'GM', 'HD', 'HLT',
    'LOW', 'LULU', 'MAR', 'MCD', 'NKE', 'RCL', 'RIVN', 'ROST', 'SBUX', 'TGT',
    'TJX', 'TSLA', 'UBER'
  ],
  'Consumer Staples': [
    'CL', 'COST', 'GIS', 'HSY', 'KHC', 'KMB', 'KO', 'MDLZ', 'PEP', 'PG',
    'STZ', 'WMT'
  ],
  'Energy': [
    'ASPI', 'BWXT', 'CCJ', 'COP', 'CVX', 'DNN', 'DVN', 'EOG', 'HAL', 'KMI',
    'LEU', 'LTBR', 'MPC', 'NXE', 'OKLO', 'OXY', 'PSX', 'SLB', 'SMR', 'UEC',
    'URG', 'UUUU', 'VLO', 'XOM'
  ],
  'Financials': [
    'AFRM', 'AXP', 'BAC', 'BITF', 'BLK', 'C', 'CIFR', 'CLSK', 'COF', 'COIN',
    'GLXY', 'GS', 'HOOD', 'HUT', 'JPM', 'MA', 'MARA', 'MS', 'PNC', 'PYPL',
    'RIOT', 'SCHW', 'SOFI', 'SQ', 'UPST', 'USB', 'V', 'WFC'
  ],
  'Healthcare': [
    'A', 'ABBV', 'ABT', 'ALHC', 'ALNY', 'AMGN', 'AXSM', 'BEAM', 'BIIB', 'BMY',
    'BNTX', 'BSX', 'CI', 'CRSP', 'CVS', 'DHR', 'DOCS', 'EXAS', 'FOLD', 'GILD',
    'HIMS', 'HUM', 'ILMN', 'INSM', 'IONS', 'ISRG', 'JNJ', 'LLY', 'MDGL', 'MDT',
    'MRK', 'MRNA', 'NBIX', 'NTLA', 'NTRA', 'NVO', 'NVTA', 'OSCR', 'PACB', 'PFE',
    'RARE', 'REGN', 'SRPT', 'SYK', 'TEM', 'TMO', 'TXG', 'UNH', 'VKTX', 'VRTX',
    'ZLDPF'
  ],
  'Industrials': [
    'AAON', 'ACM', 'AME', 'APG', 'ASTS', 'AVAV', 'AXON', 'AZZ', 'BA', 'BAH',
    'BE', 'BLDR', 'CACI', 'CARR', 'CAT', 'CSX', 'CW', 'DE', 'EMR', 'ETN',
    'FAST', 'FDX', 'FIX', 'GD', 'GE', 'GEV', 'GGG', 'GSAT', 'GWW', 'HEI',
    'HII', 'HON', 'HUBB', 'HWM', 'IEX', 'J', 'JBT', 'JCI', 'KNSL', 'KTOS',
    'LDOS', 'LHX', 'LII', 'LMT', 'LUNR', 'MIDD', 'MMM', 'MNTS', 'MOD', 'MOG-A',
    'MSM', 'NDSN', 'NOC', 'PH', 'PL', 'PLUG', 'PWR', 'RDW', 'RKLB', 'ROK',
    'ROP', 'RTX', 'SAIC', 'SPCE', 'TDG', 'THRM', 'TT', 'UNP', 'UPS', 'URI',
    'VRT', 'VSAT', 'WCC'
  ],
  'Materials': [
    'AA', 'ALB', 'APD', 'CDE', 'CLF', 'EXP', 'FCX', 'HL', 'LAC', 'LIN',
    'MLM', 'MP', 'NEM', 'NUE', 'PLL', 'SGML', 'SHW', 'SQM', 'STLD', 'SUM',
    'TMC', 'TROX', 'UAMY', 'USAR', 'VMC', 'X'
  ],
  'Real Estate': [
    'AMT', 'CCI', 'DLR', 'EQIX', 'IRM', 'O', 'PLD', 'SPG', 'SWCH'
  ],
  'Semiconductors': [
    'ACLS', 'ADI', 'AEIS', 'ALAB', 'ALGM', 'AMAT', 'AMD', 'AMKR', 'APH', 'ARM',
    'ASML', 'AVGO', 'CIEN', 'COHR', 'CRDO', 'ENTG', 'FN', 'FORM', 'ICHR', 'INTC',
    'KLAC', 'LITE', 'LRCX', 'LSCC', 'MCHP', 'MKSI', 'MPWR', 'MRVL', 'MU', 'NVDA',
    'NVMI', 'NXPI', 'ON', 'ONTO', 'POWI', 'QCOM', 'QRVO', 'RMBS', 'SITM', 'SLAB',
    'SNDK', 'STX', 'SWKS', 'SYNA', 'TER', 'TSM', 'TXN', 'UCTT', 'WDC', 'WOLF'
  ],
  'Technology': [
    'AAPL', 'ADBE', 'ANET', 'ARQQ', 'CGNX', 'CRM', 'CRWD', 'CYBR', 'DDOG', 'DOCU',
    'FTNT', 'GOOGL', 'INTU', 'IONQ', 'MDB', 'MSFT', 'NET', 'NOW', 'NTAP', 'OKTA',
    'ORCL', 'PANW', 'PATH', 'PLTR', 'PSTG', 'QBTS', 'QLYS', 'QUBT', 'RGTI', 'RPD',
    'S', 'SHOP', 'SMCI', 'SNOW', 'SYM', 'TEAM', 'TENB', 'TWLO', 'U', 'VRNS',
    'ZBRA', 'ZM', 'ZS'
  ],
  'Utilities': [
    'AEP', 'AES', 'ATO', 'CEG', 'D', 'DUK', 'ED', 'EXC', 'FE', 'NEE',
    'NI', 'NRG', 'PEG', 'PNW', 'SO', 'SRE', 'TLN', 'VST', 'WEC', 'XEL'
  ],
};

// Temas estructurales (espejo de api/radar.js) para dar contexto a los agentes
const THEMES = {
  'AI Infrastructure & Memory': [
    'MU', 'SNDK', 'WDC', 'STX', 'MRVL', 'AVGO', 'VRT', 'SMCI', 'ANET', 'CRDO',
    'ALAB', 'PSTG', 'NTAP', 'LITE', 'COHR', 'FN', 'CIEN', 'APH', 'MPWR', 'NVMI',
    'ONTO', 'AEIS', 'POWI', 'SITM', 'SLAB', 'AMKR', 'UCTT', 'ICHR', 'FORM', 'ACLS'
  ],
  'Semis & Equipment': [
    'NVDA', 'AMD', 'INTC', 'QCOM', 'TXN', 'ADI', 'NXPI', 'ON', 'SWKS', 'MCHP',
    'LRCX', 'AMAT', 'KLAC', 'TSM', 'ARM', 'ASML', 'TER', 'ENTG', 'MKSI', 'QRVO',
    'LSCC', 'RMBS', 'SYNA', 'ALGM', 'WOLF'
  ],
  'Power & Grid for AI': [
    'VST', 'CEG', 'NRG', 'TLN', 'GEV', 'PWR', 'ETN', 'EMR', 'AES', 'NEE',
    'PEG', 'EXC', 'D', 'SO', 'DUK', 'XEL', 'ED', 'WEC', 'AEP', 'FE',
    'NI', 'ATO', 'SRE', 'PNW', 'HUBB', 'AZZ', 'BE', 'PLUG'
  ],
  'Nuclear & Uranium': [
    'CCJ', 'LEU', 'SMR', 'OKLO', 'BWXT', 'UEC', 'DNN', 'NXE', 'UUUU', 'URG',
    'ASPI', 'LTBR'
  ],
  'Defense & Aerospace': [
    'LMT', 'RTX', 'NOC', 'GD', 'LHX', 'HII', 'AVAV', 'KTOS', 'LDOS', 'BAH',
    'CACI', 'SAIC', 'TDG', 'HWM', 'HEI', 'CW', 'MOG-A', 'AXON', 'PLTR', 'RKLB'
  ],
  'Cybersecurity': [
    'PANW', 'CRWD', 'ZS', 'FTNT', 'S', 'CYBR', 'TENB', 'OKTA', 'QLYS', 'RPD',
    'VRNS', 'NET', 'DDOG'
  ],
  'Robotics & Automation': [
    'ISRG', 'ROK', 'SYM', 'PATH', 'CGNX', 'ZBRA', 'NDSN', 'IEX', 'GGG', 'THRM',
    'KNSL', 'JBT', 'MIDD'
  ],
  'Space & Satellites': [
    'ASTS', 'PL', 'LUNR', 'RDW', 'IRDM', 'VSAT', 'GSAT', 'SPCE', 'MNTS'
  ],
  'Metabolic & Biotech': [
    'LLY', 'VKTX', 'AMGN', 'REGN', 'VRTX', 'MDGL', 'ALNY', 'NVO', 'ZLDPF', 'CRSP',
    'NTLA', 'BEAM', 'SRPT', 'IONS', 'RARE', 'FOLD', 'INSM', 'AXSM', 'NBIX'
  ],
  'Quantum Computing': [
    'IONQ', 'RGTI', 'QBTS', 'QUBT', 'ARQQ'
  ],
  'Critical Materials': [
    'MP', 'ALB', 'LAC', 'FCX', 'TROX', 'NEM', 'SQM', 'PLL', 'SGML', 'UAMY',
    'USAR', 'TMC', 'CDE', 'HL', 'AA', 'X', 'CLF', 'STLD', 'NUE'
  ],
  'Data Centers & Cooling': [
    'DLR', 'EQIX', 'IRM', 'SWCH', 'MOD', 'LII', 'JCI', 'TT', 'CARR', 'AAON',
    'FIX', 'APG'
  ],
  'Fintech & Digital Assets': [
    'COIN', 'HOOD', 'SQ', 'PYPL', 'SOFI', 'AFRM', 'UPST', 'MARA', 'RIOT', 'CLSK',
    'CIFR', 'HUT', 'BITF', 'GLXY'
  ],
  'Healthcare Innovation': [
    'TMO', 'DHR', 'A', 'ILMN', 'TXG', 'PACB', 'NVTA', 'EXAS', 'NTRA', 'TEM',
    'DOCS', 'HIMS', 'OSCR', 'ALHC'
  ],
  'Industrial Reshoring': [
    'CAT', 'DE', 'URI', 'PH', 'ROP', 'AME', 'FAST', 'WCC', 'MSM', 'GWW',
    'BLDR', 'MLM', 'VMC', 'SUM', 'EXP', 'ACM', 'J'
  ],
};

function findTheme(ticker) {
  for (const t in THEMES) {
    if (THEMES[t].indexOf(ticker) !== -1) return t;
  }
  return null;
}

function findSector(ticker) {
  for (const sec in SECTOR_PEERS) {
    if (SECTOR_PEERS[sec].indexOf(ticker) !== -1) return sec;
  }
  return null;
}

async function fetchSectorContext(ticker, FMP, ownFrom52High) {
  // Si la accion pertenece a un tema estructural, comparar contra ese grupo
  // es mas informativo que contra el sector generico.
  const theme = findTheme(ticker);
  const sector = findSector(ticker);

  let groupName, groupList, groupKind;
  if (theme && THEMES[theme] && THEMES[theme].length >= 5) {
    groupName = theme;
    groupList = THEMES[theme];
    groupKind = 'theme';
  } else if (sector && SECTOR_PEERS[sector]) {
    groupName = sector;
    groupList = SECTOR_PEERS[sector];
    groupKind = 'sector';
  } else {
    return null;
  }

  const peers = groupList.filter(t => t !== ticker).slice(0, 12);
  if (peers.length < 3) return null;

  try {
    const results = await Promise.all(peers.map(async (p) => {
      try {
        const r = await fetch(`https://financialmodelingprep.com/stable/quote?symbol=${p}&apikey=${FMP}`);
        if (!r.ok) return null;
        const arr = await r.json();
        const q = Array.isArray(arr) ? arr[0] : null;
        if (!q || !q.price || !q.yearHigh) return null;
        return {
          symbol: q.symbol,
          from52High: ((q.yearHigh - q.price) / q.yearHigh) * 100
        };
      } catch { return null; }
    }));

    const valid = results.filter(Boolean);
    if (valid.length < 3) return null;

    const avg = valid.reduce((sum, p) => sum + p.from52High, 0) / valid.length;
    const downHard = valid.filter(p => p.from52High >= 15).length;

    // Clasificar el castigo. La clave es si el sector en si esta sano:
    // si todo el sector cayo, el castigo no es "especifico de la accion"
    // aunque esta haya caido mas.
    const sectorHealthy = avg < 12;
    let verdict;
    if (ownFrom52High < avg - 3) verdict = 'outperforming';
    else if (Math.abs(ownFrom52High - avg) <= 8) verdict = 'sector-wide';
    else if (sectorHealthy && ownFrom52High >= 20) verdict = 'stock-specific';
    else verdict = 'worse-than-sector';

    return {
      sector: groupName,
      groupKind,
      peerCount: valid.length,
      peerAvgFrom52High: Math.round(avg * 10) / 10,
      peersDownHard: downHard,
      verdict,
      worstPeers: valid.sort((a, b) => b.from52High - a.from52High).slice(0, 3)
        .map(p => ({ symbol: p.symbol, from52High: Math.round(p.from52High * 10) / 10 }))
    };
  } catch {
    return null;
  }
}
// Análisis en vivo de una acción con 3 agentes de Velu + veredicto Buy/Hold/Sell


// Trae un endpoint de FMP con reintento. El quote es critico: si falla por
// saturacion momentanea, reintentamos antes de darnos por vencidos.
async function fmpFetch(url, tries) {
  tries = tries || 1;
  let lastStatus = null;
  for (let i = 0; i < tries; i++) {
    // Espera progresiva: si es saturacion, darle tiempo real a FMP
    if (i > 0) {
      const wait = lastStatus === 429 ? 1500 * i : 600 * i;
      await new Promise(s => setTimeout(s, wait));
    }
    try {
      const r = await fetch(url);
      lastStatus = r.status;
      if (r.ok) {
        const j = await r.json();
        // FMP a veces responde 200 con un objeto de error
        if (j && !Array.isArray(j) && (j['Error Message'] || j.error || j.message)) {
          console.error('FMP error payload:', JSON.stringify(j).slice(0, 200));
          continue;
        }
        // Arreglo vacio = el simbolo no devolvio datos; reintentar por si fue transitorio
        if (Array.isArray(j) && j.length === 0) {
          console.error('FMP empty array for', url.split('symbol=')[1]);
          continue;
        }
        return j;
      }
      console.error('FMP HTTP', r.status, url.split('?')[0].split('/').pop());
    } catch (e) {
      console.error('FMP threw:', e.message);
    }
  }
  return { __failed: true, status: lastStatus };
}

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

    const base = 'https://financialmodelingprep.com/stable';

    // FASE 1 — el precio es indispensable. Con reintento por si FMP satura.
    const quoteArr = await fmpFetch(`${base}/quote?symbol=${ticker}&apikey=${FMP}`, 4);
    const quote = Array.isArray(quoteArr) ? quoteArr[0] : null;

    if (!quote || typeof quote.price !== 'number') {
      const rateLimited = quoteArr && quoteArr.__failed && quoteArr.status === 429;
      console.error('Quote unavailable for', ticker, '- raw:', JSON.stringify(quoteArr).slice(0, 200));
      return res.status(rateLimited ? 429 : 404).json({
        error: rateLimited
          ? 'Market data is rate limited right now'
          : `Could not load market data for ${ticker}`,
        ticker,
        rateLimited: !!rateLimited
      });
    }

    // FASE 2 — lo demas es opcional: si algo falla, el analisis sigue.
    const [ratiosArr, consensusArr, newsArr, histArr, incArr] = await Promise.all([
      fmpFetch(`${base}/ratios-ttm?symbol=${ticker}&apikey=${FMP}`, 2),
      fmpFetch(`${base}/price-target-consensus?symbol=${ticker}&apikey=${FMP}`, 1),
      fmpFetch(`${base}/news/stock?symbols=${ticker}&limit=6&apikey=${FMP}`, 1),
      fmpFetch(`${base}/historical-price-eod/light?symbol=${ticker}&from=${fromDate}&to=${toDate}&apikey=${FMP}`, 1),
      fmpFetch(`${base}/income-statement?symbol=${ticker}&period=annual&limit=5&apikey=${FMP}`, 2)
    ]);

    const ratios = Array.isArray(ratiosArr) && ratiosArr[0] ? ratiosArr[0] : {};
    const consensus = Array.isArray(consensusArr) && consensusArr[0] ? consensusArr[0] : null;
    const news = Array.isArray(newsArr) ? newsArr.slice(0, 6) : [];

    // Historial de precios — reducido a ~130 puntos para un payload ligero
    let history = [];
    try {
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

    // Contexto de sector: comparar contra pares de la misma industria
    const sectorContext = await fetchSectorContext(ticker, FMP, stockData.from52High);
    const theme = findTheme(ticker);

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

${theme ? `STRUCTURAL THEME: ${theme}. This company sits inside a theme with a multi-year demand driver. Consider whether the market has already priced that in, or whether the re-rating is still ahead. A stock trading near its moving averages inside a strong theme is early; one that has already multiplied is late.\n` : ''}
SECTOR CONTEXT:
${sectorContext ? (
  `Sector: ${sectorContext.sector}. This stock is down ${stockData.from52High}% from its high, while its ${sectorContext.peerCount} sector peers are down ${sectorContext.peerAvgFrom52High}% on average. ` +
  `${sectorContext.peersDownHard} of ${sectorContext.peerCount} peers are also down 15%+. ` +
  `Classification: ${sectorContext.verdict === 'stock-specific' ? 'The selloff is STOCK-SPECIFIC — this name is being punished far more than its sector.'
    : sectorContext.verdict === 'sector-wide' ? 'The selloff is SECTOR-WIDE — the whole industry is under pressure.'
    : sectorContext.verdict === 'outperforming' ? 'This stock is holding up BETTER than its sector.'
    : 'This stock is down more than its sector, but not dramatically so.'}`
) : 'Sector peer data not available for this ticker.'}

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

    return res.status(200).json({ stockData, analysis, news, history, fundamentals, sectorContext, theme });

  } catch (err) {
    console.error('Analyze error:', err.message, err.stack);
    return res.status(500).json({ error: 'Analysis failed', message: err.message });
  }
}
