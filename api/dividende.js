// api/dividende.js — DIAGNOSTIC
const cache = {};
const ymd = d => {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
};

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const key = process.env.FINNHUB_API_KEY;
    const raw = (req.query && req.query.ticker) ? String(req.query.ticker) : '';
    const ticker = raw.trim().toUpperCase();
    if (!ticker) { res.statusCode=400; return res.end(JSON.stringify({error:'Paramètre ticker manquant'})); }
    if (!key)    { res.statusCode=500; return res.end(JSON.stringify({error:'Clé API Finnhub manquante'})); }

    // Cache 1h
    const now = Date.now();
    const c = cache[ticker];
    if (c && now - c.t < 60*60*1000) {
      res.statusCode=200; return res.end(JSON.stringify({...c.d, cached:true}));
    }

    const from = '2010-01-01';
    const to   = ymd(new Date());
    const url  = `https://finnhub.io/api/v1/stock/dividend?symbol=${encodeURIComponent(ticker)}&from=${from}&to=${to}&token=${key}`;

    const r = await fetch(url);
    const status = r.status;
    let data;
    try { data = await r.json(); } catch { data = null; }

    if (!Array.isArray(data) || data.length===0) {
      res.statusCode = 404;
      return res.end(JSON.stringify({
        error: 'Aucun dividende trouvé',
        debug: { ticker, status, count: Array.isArray(data)?data.length:null, sample: Array.isArray(data)&&data[0]?data[0]:null }
      }));
    }

    data.sort((a,b)=> new Date(b.exDate||b.paymentDate||b.date||0) - new Date(a.exDate||a.paymentDate||a.date||0));
    const d = data[0];
    const out = {
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
    cache[ticker] = { d: out, t: now };
    res.statusCode=200; return res.end(JSON.stringify(out));
  } catch (e) {
    res.statusCode=500; return res.end(JSON.stringify({error:'Exception serveur', detail:String(e)}));
  }
};
