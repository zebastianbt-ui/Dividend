// /api/dividende.js — Alpha Vantage (CommonJS) + cache 60s

const cache = {}; // { TICKER: { t: timestamp, data: {...} } }

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const key = process.env.ALPHA_VANTAGE_KEY || '';
    const raw = (req.query && req.query.ticker) ? String(req.query.ticker) : '';
    const ticker = raw.trim().toUpperCase();

    if (!key) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: "Clé API Alpha Vantage manquante" }));
    }
    if (!ticker) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Paramètre ticker manquant" }));
    }

    // Cache 60s
    const now = Date.now();
    const c = cache[ticker];
    if (c && now - c.t < 60 * 1000) {
      res.statusCode = 200;
      return res.end(JSON.stringify({ ...c.data, cached: true }));
    }

    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_MONTHLY_ADJUSTED&symbol=${encodeURIComponent(ticker)}&datatype=json&apikey=${key}`;
    const r = await fetch(url);
    const status = r.status;
    let j = null;
    try { j = await r.json(); } catch { j = null; }

    // Messages d’erreur Alpha Vantage (rate limit, bad key, etc.)
    if (!j || typeof j !== 'object') {
      res.statusCode = 502;
      return res.end(JSON.stringify({ error: "Réponse API invalide", status }));
    }
    if (j.Note) {
      // Rate limit atteint
      res.statusCode = 429;
      return res.end(JSON.stringify({ error: "Limite Alpha Vantage atteinte. Réessaie dans une minute.", note: j.Note }));
    }
    if (j['Error Message']) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Symbole invalide ou non pris en charge", detail: j['Error Message'] }));
    }

    const series = j['Monthly Adjusted Time Series'];
    if (!series || typeof series !== 'object') {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: "Aucune donnée mensuelle trouvée pour ce ticker" }));
    }

    // Cherche le dernier mois où '7. dividend amount' > 0
    const entries = Object.entries(series)
      .map(([date, values]) => ({ date, div: parseFloat(values['7. dividend amount'] || '0') }))
      .sort((a, b) => (a.date < b.date ? 1 : -1)); // plus récent d’abord

    const last = entries.find(e => e.div > 0);
    if (!last) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: "Aucun dividende récent détecté (source: Alpha Vantage)" }));
    }

    const payload = {
      ticker,
      source: "Alpha Vantage",
      latestMonth: last.date,           // AAAA-MM-JJ (mois de paiement/ajustement)
      amount: last.div,                 // montant par action sur le mois
      currency: "USD",                  // Alpha Vantage ne renvoie pas la devise explicitement
      fetchedAt: new Date().toISOString()
    };

    // met en cache
    cache[ticker] = { t: now, data: payload };

    res.statusCode = 200;
    return res.end(JSON.stringify(payload));
  } catch (err) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: "Erreur serveur", detail: String(err && err.message || err) }));
  }
};
