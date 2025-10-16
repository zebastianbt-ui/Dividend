// api/dividende.js — Fallback vers Alpha Vantage (gratuit)
const cache = {};

async function fromAlphaVantage(ticker, key) {
  const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(ticker)}&apikey=${key}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = await r.json();
  if (!j || !j.Symbol) return null;
  return {
    ticker,
    amount: j.DividendPerShare ? Number(j.DividendPerShare) : null,
    currency: j.Currency || null,
    exDate: j.ExDividendDate || null,
    paymentDate: j.DividendDate || null,
    source: 'AlphaVantage',
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const raw = req.query?.ticker || '';
    const ticker = raw.trim().toUpperCase();
    if (!ticker) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Paramètre ticker manquant' }));
    }

    const now = Date.now();
    const cached = cache[ticker];
    if (cached && now - cached.t < 60 * 60 * 1000) {
      res.statusCode = 200;
      return res.end(JSON.stringify({ ...cached.d, cached: true }));
    }

    const keyAV = process.env.ALPHA_VANTAGE_KEY;
    if (!keyAV) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: 'Clé API Alpha Vantage manquante' }));
    }

    const data = await fromAlphaVantage(ticker, keyAV);
    if (!data) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: 'Aucun dividende trouvé (Alpha Vantage)' }));
    }

    cache[ticker] = { d: data, t: now };
    res.statusCode = 200;
    return res.end(JSON.stringify(data));
  } catch (e) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: 'Erreur serveur', detail: String(e) }));
  }
};
