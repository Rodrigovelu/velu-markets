// api/preview.js
// Busqueda publica del home: cualquiera puede probar sin cuenta.
//
// Entrega datos de mercado REALES + la clasificacion del motor
// (Punished / Radar / Neither) + una tesis corta de 2 frases.
// El veredicto completo, los 3 agentes y los escenarios quedan
// detras del registro.
//
// Costo controlado: 3 llamadas a FMP + 1 llamada corta a Claude
// (max 300 tokens), contra las ~8 llamadas del analisis completo.

export const maxDuration = 30;

// Temas estructurales del Radar (espejo de radar.js)
const THEMES = {
  'AI Infrastructure & Memory': ['MU','SNDK','WDC','STX','MRVL','AVGO','VRT','SMCI','ANET','CRDO','ALAB','PSTG','NTAP','LITE','COHR','FN','CIEN','APH','MPWR','NVMI','ONTO','AEIS','POWI','SITM','SLAB','AMKR','UCTT','ICHR','FORM','ACLS'],
  'Semis & Equipment':          ['NVDA','AMD','INTC','QCOM','TXN','ADI','NXPI','ON','SWKS','MCHP','LRCX','AMAT','KLAC','TSM','ARM','ASML','TER','ENTG','MKSI','QRVO','LSCC','RMBS','SYNA','ALGM','WOLF'],
  'Power & Grid for AI':        ['VST','CEG','NRG','TLN','GEV','PWR','ETN','EMR','AES','NEE','PEG','EXC','D','SO','DUK','XEL','ED','WEC','AEP','FE','NI','ATO','SRE','PNW','HUBB','AZZ','BE','PLUG'],
  'Nuclear & Uranium':          ['CCJ','LEU','SMR','OKLO','BWXT','UEC','DNN','NXE','UUUU','URG','ASPI','LTBR'],
  'Defense & Aerospace':        ['LMT','RTX','NOC','GD','LHX','HII','AVAV','KTOS','LDOS','BAH','CACI','SAIC','TDG','HWM','HEI','CW','MOG-A','AXON','PLTR','RKLB'],
  'Cybersecurity':              ['PANW','CRWD','ZS','FTNT','S','CYBR','TENB','OKTA','QLYS','RPD','VRNS','NET','DDOG'],
  'Robotics & Automation':      ['ISRG','ROK','SYM','PATH','CGNX','ZBRA','NDSN','IEX','GGG','THRM','KNSL','JBT','MIDD'],
  'Space & Satellites':         ['ASTS','PL','LUNR','RDW','IRDM','VSAT','GSAT','SPCE','MNTS'],
  'Metabolic & Biotech':        ['LLY','VKTX','AMGN','REGN','VRTX','MDGL','ALNY','NVO','CRSP','NTLA','BEAM','SRPT','IONS','RARE','FOLD','INSM','AXSM','NBIX'],
  'Quantum Computing':          ['IONQ','RGTI','QBTS','QUBT','ARQQ'],
  'Critical Materials':         ['MP','ALB','LAC','FCX','TROX','NEM','SQM','PLL','SGML','UAMY','USAR','TMC','CDE','HL','AA','X','CLF','STLD','NUE'],
  'Data Centers & Cooling':     ['DLR','EQIX','IRM','MOD','LII','JCI','TT','CARR','AAON','FIX','APG'],
  'Fintech & Digital Assets':   ['COIN','HOOD','SQ','PYPL','SOFI','AFRM','UPST','MARA','RIOT','CLSK','CIFR','HUT','BITF','GLXY'],
  'Healthcare Innovation':      ['TMO','DHR','A','ILMN','TXG','PACB','EXAS','NTRA','TEM','DOCS','HIMS','OSCR','ALHC'],
  'Industrial Reshoring':       ['CAT','DE','URI','PH','ROP','AME','FAST','WCC','MSM','GWW','BLDR','MLM','VMC','SUM','EXP','ACM','J'],
};

function findTheme(ticker) {
  for (const t in THEMES) if (THEMES[t].indexOf(ticker) !== -1) return t;
  return null;
}

async function fmp(path, KEY, tries = 3) {
  let lastStatus = null;
  for (let i = 0; i < tries; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, lastStatus === 429 ? 1200 * i : 500 * i));
    try {
      const r = await fetch(`https://financialmodelingprep.com/stable/${path}&apikey=${KEY}`);
      lastStatus = r.status;
      if (!r.ok) continue;
      const j = await r.json();
      if (j && !Array.isArray(j) && (j['Error Message'] || j.error)) continue;
      if (Array.isArray(j) && j.length === 0 && i < tries - 1) continue;
      return j;
    } catch (e) { /* reintentar */ }
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const FMP = process.env.FMP_API_KEY;
  const ANTHROPIC = process.env.ANTHROPIC_API_KEY;
  if (!FMP || !ANTHROPIC) return res.status(500).json({ error: 'API keys not configured' });

  const { symbol, lang } = req.body || {};
  if (!symbol) return res.status(400).json({ error: 'Symbol required' });

  const ticker = String(symbol).toUpperCase().trim().slice(0, 8);
  const LANG = (lang === 'es' || lang === 'pt') ? lang : 'en';
  const LANG_NAME = LANG === 'es' ? 'Spanish' : LANG === 'pt' ? 'Portuguese (Brazilian)' : 'English';

  try {
    // ── Datos de mercado (2 llamadas) ──
    const [quoteArr, ratiosArr] = await Promise.all([
      fmp(`quote?symbol=${ticker}`, FMP),
      fmp(`ratios-ttm?symbol=${ticker}`, FMP)
    ]);

    const q = Array.isArray(quoteArr) ? quoteArr[0] : null;
    if (!q || typeof q.price !== 'number') {
      return res.status(404).json({ error: 'not_found', ticker });
    }
    const ratios = Array.isArray(ratiosArr) ? ratiosArr[0] : null;

    const price = q.price;
    const yearHigh = q.yearHigh;
    const from52High = (yearHigh && yearHigh > 0)
      ? Math.round(((yearHigh - price) / yearHigh) * 1000) / 10 : null;
    const vsMA200 = (q.priceAvg200 && q.priceAvg200 > 0)
      ? Math.round(((price - q.priceAvg200) / q.priceAvg200) * 1000) / 10 : null;
    const pe = ratios && typeof ratios.priceToEarningsRatioTTM === 'number'
      ? Math.round(ratios.priceToEarningsRatioTTM * 10) / 10 : null;

    // ── Ingresos: 1 llamada, para saber si crece ──
    let revYoY = null, revAccel = null;
    const income = await fmp(`income-statement?symbol=${ticker}&period=annual&limit=4`, FMP);
    if (Array.isArray(income) && income.length >= 2) {
      const rows = income
        .filter(r => r && typeof r.revenue === 'number' && r.revenue > 0)
        .sort((a, b) => String(a.fiscalYear).localeCompare(String(b.fiscalYear)));
      const n = rows.length;
      if (n >= 2) {
        revYoY = Math.round(((rows[n-1].revenue - rows[n-2].revenue) / rows[n-2].revenue) * 1000) / 10;
        if (n >= 3) {
          const prev = ((rows[n-2].revenue - rows[n-3].revenue) / rows[n-3].revenue) * 100;
          revAccel = Math.round((revYoY - prev) * 10) / 10;
        }
      }
    }

    // ── Clasificacion: que motor la detecta ──
    const theme = findTheme(ticker);
    let engine = 'neither';
    let engineReason = '';

    const isPunished = from52High != null && from52High >= 15;
    // Radar: dentro de un tema, creciendo, y el precio aun no ha corrido
    const priceRatio = (q.priceAvg200 && q.priceAvg200 > 0) ? price / q.priceAvg200 : null;
    const isEarly = priceRatio != null && priceRatio < 1.55;
    const isGrowing = revYoY != null && revYoY > 10;
    const isRadar = !!theme && isGrowing && isEarly;

    if (isPunished && isRadar) {
      engine = 'both';
    } else if (isPunished) {
      engine = 'punished';
    } else if (isRadar) {
      engine = 'radar';
    }

    // ── Tesis corta con Claude (1 llamada, tokens acotados) ──
    const fmtN = v => (typeof v === 'number' ? v : 'N/A');
    const prompt = `You are Velu, an equity analysis engine. Write a SHORT preview thesis for ${ticker} (${q.name}).

DATA:
- Price: $${price}
- Down ${fmtN(from52High)}% from its 52-week high
- ${vsMA200 != null ? (vsMA200 >= 0 ? 'Above' : 'Below') + ' its 200-day average by ' + Math.abs(vsMA200) + '%' : 'Moving average unavailable'}
- P/E: ${fmtN(pe)}
- Latest revenue growth: ${fmtN(revYoY)}%${revAccel != null ? ` (${revAccel > 0 ? 'accelerating' : 'decelerating'})` : ''}
${theme ? `- Structural theme: ${theme}` : ''}
- Velu engine classification: ${engine}

Write exactly 2 sentences in ${LANG_NAME} explaining what stands out about this setup — the tension between the price action and the business. Be specific to the numbers given. Do not give a buy/sell recommendation, do not mention a price target, and do not hedge with generic disclaimers. This is a teaser: it should make the reader want the full verdict.

Respond with ONLY the 2 sentences. No preamble, no quotes, no markdown.`;

    let thesis = '';
    try {
      const cr = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 300,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const cj = await cr.json();
      if (cr.ok && cj.content && cj.content[0] && cj.content[0].text) {
        thesis = cj.content[0].text.trim();
      } else {
        console.error('Claude preview error:', JSON.stringify(cj).slice(0, 200));
      }
    } catch (e) {
      console.error('Claude preview threw:', e.message);
    }

    // Sin IA seguimos entregando los datos: la busqueda nunca falla en seco
    if (!thesis) {
      thesis = from52High != null && from52High >= 15
        ? `${q.name} is trading ${from52High}% below its 52-week high.`
        : `${q.name} is trading at $${price}.`;
    }

    return res.status(200).json({
      ticker,
      name: q.name,
      price,
      changePct: typeof q.changePercentage === 'number'
        ? Math.round(q.changePercentage * 100) / 100 : null,
      from52High,
      vsMA200,
      pe,
      marketCap: q.marketCap || null,
      revYoY,
      revAccel,
      theme,
      engine,
      thesis,
      preview: true
    });

  } catch (err) {
    console.error('Preview error:', err);
    return res.status(500).json({ error: 'Preview failed' });
  }
}
