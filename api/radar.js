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

const BATCH = 60;

function themeOf(sym) {
  for (const t in THEMES) if (THEMES[t].indexOf(sym) !== -1) return t;
  return null;
}

async function fmp(path, FMP, tag) {
  try {
    const r = await fetch(`https://financialmodelingprep.com/stable/${path}&apikey=${FMP}`);
    if (!r.ok) {
      if (tag) console.error(`FMP ${tag} HTTP ${r.status} for ${path.slice(0, 60)}`);
      return null;
    }
    const j = await r.json();
    // FMP a veces responde 200 con un objeto de error en vez de un arreglo
    if (j && !Array.isArray(j) && (j['Error Message'] || j.error || j.message)) {
      if (tag) console.error(`FMP ${tag} error payload:`, JSON.stringify(j).slice(0, 160));
      return null;
    }
    return j;
  } catch (e) {
    if (tag) console.error(`FMP ${tag} threw:`, e.message);
    return null;
  }
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

const SUPABASE_URL = 'https://osrjmchajyrgdlucniid.supabase.co';
const CACHE_MINUTES = 20;   // el radar se recalcula cada 20 minutos, no en cada visita

async function getCachedRadar(SK) {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/radar_cache?engine=eq.radar&select=data,updated_at`,
      { headers: { 'apikey': SK, 'Authorization': `Bearer ${SK}` } }
    );
    const rows = await r.json();
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!row) return null;
    const ageMin = (Date.now() - new Date(row.updated_at).getTime()) / 60000;
    if (ageMin > CACHE_MINUTES) return null;
    return { ...row.data, cached: true, cacheAgeMinutes: Math.round(ageMin) };
  } catch { return null; }
}

async function saveRadarCache(SK, data) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/radar_cache?on_conflict=engine`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'apikey': SK,
        'Authorization': `Bearer ${SK}`,
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({ engine: 'radar', data, updated_at: new Date().toISOString() })
    });
  } catch (e) { console.warn('Radar cache save failed:', e.message); }
}

export default async function handler(req, res) {
  const FMP = process.env.FMP_API_KEY;
  if (!FMP) return res.status(500).json({ error: 'FMP API key not configured' });

  const SK = process.env.SUPABASE_KEY || 'sb_publishable_uL4sQ_T3HiCD6ZZ20D5thw_sc_gTK5F';
  const forceRefresh = req.query?.refresh === '1';

  // Servir desde cache salvo que el usuario pida refresh explicito
  if (!forceRefresh) {
    const cached = await getCachedRadar(SK);
    if (cached) return res.status(200).json(cached);
  }

  const ALL = [];
  for (const t in THEMES) THEMES[t].forEach(s => { if (ALL.indexOf(s) === -1) ALL.push(s); });

  try {
    // FASE 1 — quotes de todo el universo tematico.
    // Pausa breve entre lotes para no rebasar el limite de 300 llamadas/minuto.
    const pause = (ms) => new Promise(r => setTimeout(r, ms));
    const quotes = [];
    for (let i = 0; i < ALL.length; i += BATCH) {
      if (i > 0) await pause(1200);
      const slice = ALL.slice(i, i + BATCH);
      const rs = await Promise.all(slice.map(s => fmp(`quote?symbol=${s}`, FMP, 'quote')));
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
    })).sort((a, b) => b.pre - a.pre).slice(0, 30);

    // FASE 2 — fundamentales solo de los finalistas
    const enriched = [];
    await pause(1500);
    for (let i = 0; i < pre.length; i += BATCH) {
      if (i > 0) await pause(1200);
      const slice = pre.slice(i, i + BATCH);
      const results = await Promise.all(slice.map(async (item) => {
        const sym = item.q.symbol;
        const [ratios, income] = await Promise.all([
          fmp(`ratios-ttm?symbol=${sym}`, FMP, 'ratios'),
          fmp(`income-statement?symbol=${sym}&period=annual&limit=4`, FMP, 'income')
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

    // Preferimos las que tienen fundamentales; si no alcanzan, completamos
    // con las mejores restantes en vez de dejar el radar vacio.
    const sortedAll = scored.slice().sort((a, b) => b.radarScore - a.radarScore);
    const withFund = sortedAll.filter(s => s.revYoY !== null && s.radarScore >= 35);
    const withoutFund = sortedAll.filter(s => !(s.revYoY !== null && s.radarScore >= 35));

    let ranked = withFund.slice(0, 20);
    if (ranked.length < 5) {
      ranked = ranked.concat(withoutFund.slice(0, 8 - ranked.length));
    }

    const fundamentalsAvailable = scored.filter(s => s.revYoY !== null).length;

    const themeCounts = {};
    ranked.forEach(s => { if (s.theme) themeCounts[s.theme] = (themeCounts[s.theme] || 0) + 1; });

    // Guardar snapshot para el historial (plan Terminal)
    try {
      const SB = 'https://osrjmchajyrgdlucniid.supabase.co';
      const SK = process.env.SUPABASE_KEY || 'sb_publishable_uL4sQ_T3HiCD6ZZ20D5thw_sc_gTK5F';
      const rows = ranked.slice(0, 15).map(s => ({
        ticker: s.symbol, company: s.name, engine: 'radar',
        score: s.radarScore, price: s.price,
        from_52high: s.from52High, sector: s.theme
      }));
      await fetch(`${SB}/rest/v1/screener_history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SK,
                   'Authorization': `Bearer ${SK}`, 'Prefer': 'return=minimal' },
        body: JSON.stringify(rows)
      });
    } catch (e) { console.warn('History save failed:', e.message); }

    const payload = {
      count: ranked.length,
      stocks: ranked,
      scanned: quotes.length,
      universe: ALL.length,
      themeBreakdown: themeCounts,
      diagnostics: {
        quotesOk: quotes.length,
        finalistsEvaluated: scored.length,
        withFundamentals: fundamentalsAvailable,
        passedThreshold: withFund.length
      },
      generatedAt: new Date().toISOString(),
      cached: false
    };

    await saveRadarCache(SK, payload);
    return res.status(200).json(payload);

  } catch (err) {
    console.error('Radar error:', err);
    return res.status(500).json({ error: 'Radar failed', message: err.message });
  }
}
