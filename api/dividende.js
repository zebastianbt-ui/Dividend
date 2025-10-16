const cache = {};

export default async function handler(req, res) {
  const { ticker } = req.query;
  const key = process.env.FINNHUB_API_KEY;

  if (!key) {
    return res.status(500).json({ error: "Clé API Finnhub manquante" });
  }
  if (!ticker) {
    return res.status(400).json({ error: "Paramètre ticker manquant" });
  }

  const cached = cache[ticker];
  const now = Date.now();
  if (cached && now - cached.timestamp < 60 * 60 * 1000) {
    return res.status(200).json({ ...cached.data, cached: true });
  }

  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/stock/dividend?symbol=${ticker}&token=${key}`
    );
    const data = await r.json();

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(404).json({ error: "Aucun dividende trouvé" });
    }

    const latest = data[0];
    const result = {
      ticker,
      amount: latest.amount,
      exDate: latest.exDate,
      paymentDate: latest.paymentDate,
      currency: latest.currency,
      source: "Finnhub",
      fetchedAt: new Date().toISOString(),
    };

    cache[ticker] = { data: result, timestamp: now };

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
