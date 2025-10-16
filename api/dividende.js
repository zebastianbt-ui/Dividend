// api/dividende.js — Alpha Vantage robuste + cache 1h (CommonJS)
const cache = {};

async function fetchAlphaOverview(ticker, key) {
  const url =
    `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(ticker)}&apikey=${key}`;
  const r = await fetch(url);
  const text = await r.text(); // parfois AV renvoie du texte brut
  let j;
  try { j = JSON.parse(text); } catch { j = null; }

  if (!r.ok) {
    return { error: `HTTP ${r.status}`, status: r.status, raw: text?.slice(0,200) };
  }
  if (!j || typeof j !== 'object') {
    return { error: 'INVALID_JSON', raw: text?.slice(0,200) };
  }
  if (j.Note || j.Information || j['Error Message']) {
    // Rate-limit ou symbole invalide
    return { error: 'PROVIDER_NOTE', note: j.Note || j.Information || j['Error Message'] };
  }
  if (!j.Symbol) {
    return { error: 'NO_DATA' };
  }
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
    const raw = (req.query && req.query.ticker) ? String(req.query.ticker) : '';
    const ticker = raw.trim().toUpperCase();
    if (!ticker) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Paramètre ticker manquant' }));
    }

    // Cache 1h
    const now = Date.now();
    const c = cache[ticker];
    if (c && now - c.t < 60 * 60 * 1000) {
      res.statusCode = 200;
      return res.end(JSON.stringify({ ...c.d, cached: true }));
    }

    const keyAV = process.env.ALPHA_VANTAGE_KEY || process.env.AV_KEY;
    if (!keyAV) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: 'Clé API Alpha Vantage manquante' }));
    }

    const out = await fetchAlphaOverview(ticker, keyAV);

    if (out && !out.error) {
      cache[ticker] = { d: out, t: now };
      res.statusCode = 200;
      return res.end(JSON.stringify(out));
    }

    // Erreur “propre” : renvoyer le détail pour debug
    res.statusCode = 502;
    return res.end(JSON.stringify({ error: 'Provider error', detail: out }));
  } catch (e) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: 'Exception serveur', detail: String(e) }));
  }
};
