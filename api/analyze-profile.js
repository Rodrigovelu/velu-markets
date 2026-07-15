export default async function handler(req, res) {
  // Solo aceptar POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, birthdate, country, investmentRange, interests } = req.body;

  if (!name || !country || !investmentRange || !interests) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Calcular edad
  const age = birthdate
    ? Math.floor((Date.now() - new Date(birthdate)) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  const prompt = `You are Velu, an AI prediction market analyst. Analyze this investor profile and return a JSON response.

Investor data:
- Name: ${name}
- Age: ${age ? age + ' years old' : 'not provided'}
- Country: ${country}
- Investment range: ${investmentRange}
- Areas of interest: ${interests.join(', ')}

Return ONLY a valid JSON object with this exact structure, no other text:
{
  "profileType": "a 2-4 word investor archetype title in English (e.g. 'Macro Hedge Trader', 'Crypto Retail Speculator', 'Institutional Fixed Income')",
  "profileEmoji": "one relevant emoji",
  "description": "2-3 sentences describing this investor's likely approach, risk tolerance, and decision-making style based on their profile. Be specific and insightful.",
  "primaryMarkets": ["array of 3 market categories from: FED POLICY, CRYPTO, MACRO, EQUITIES, COMMODITIES, GEOPOLITICS — ordered by relevance to this profile"],
  "riskLevel": "Conservative | Moderate | Aggressive | Very Aggressive",
  "edge": "one specific insight about where this type of investor typically finds edge in prediction markets",
  "watchout": "one specific blind spot or risk this investor profile should watch out for"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic error:', err);
      return res.status(500).json({ error: 'Claude API error' });
    }

    const data = await response.json();
    const text = data.content[0].text.trim();

    // Parse JSON from Claude response
    let profile;
    try {
      profile = JSON.parse(text);
    } catch {
      // Try to extract JSON if Claude added extra text
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        profile = JSON.parse(match[0]);
      } else {
        throw new Error('Could not parse Claude response');
      }
    }

    return res.status(200).json({ profile });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Failed to analyze profile' });
  }
}
