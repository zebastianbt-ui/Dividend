// api/dividende.js — CommonJS + cache + intervalle de dates
const cache = {};

function ymd(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    const key = process.env.FINNHUB_API_KEY;
    const raw = (req.query && req.query.ticker) ? String(req.query.ticker) : '';
    const ticker = raw.trim().toUpperCase();

    if (!ticker) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Paramètre ticker manquant' }));
    }
    if (!key) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: 'Clé API Finnhub manquante' }));
    }

    // Cache 1h
    const now = Date.now();
    const cached = cache[ticker];
    if (cached && now - cached.timestamp < 60 * 60 * 1000) {
      res.statusCode = 200;
      return res.end(JSON.stringify({ ...cached.data, cached: true }));
    }

    // Fenêtre large (2010 → aujourd’hui) pour être sûr d’avoir des dividendes
    const from = '2010-01-01';
    const to = ymd(new Date());

    const url = `https://finnhub.io/api/v1/stock/dividend?symbol=${encodeURIComponent(
      ticker
    )}&from=${from}&to=${to}&token=${key}`;

    const r = await fetch(url);
    if (!r.ok) {
      res.statusCode = r.status || 502;
      return res.end(JSON.stringify({ error: 'Erreur API Finnhub' }));
    }
    const data = await r.json();

    if (!Array.isArray(data) || data.length === 0) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: 'Aucun dividende trouvé' }));
    }

    // Tri par date la plus récente qu’on trouve (exDate > paymentDate > date)
    data.sort(
      (a, b) =>
        new Date(b.exDate || b.paymentDate || b.date || 0) -
        new Date(a.exDate || a.paymentDate || a.date || 0)
    );
    const d = data[0];

    const result = {
      ticker,
      amount: d.amount ?? null,
      currency: d.currency ?? null,
      exDate: d.exDate ?? null,
      recordDate: d.recordDate ?? null,
      paymentDate: d.paymentDate ?? null,
      declaredDate: d.declaredDate ?? null,
      source: 'Finnhub',
      fetchedAt: new Date().toISOString()
    };

    cache[ticker] = { data: result, timestamp: now };
    res.statusCode = 200;
    return res.end(JSON.stringify(result));
  } catch (e) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: 'Exception serveur', detail: String(e) }));
  }
};
