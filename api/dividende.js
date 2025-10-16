// api/dividende.js (Vercel Serverless Function)
// Utilise les endpoints GRATUITS d'Alpha Vantage

const cache = {}; // Simple in-memory cache

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    const API_KEY = process.env.ALPHA_VANTAGE_KEY || '';
    const raw = (req.query && req.query.ticker) ? String(req.query.ticker) : '';
    const ticker = raw.trim().toUpperCase();
    
    if (!API_KEY) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ 
        error: "Clé API Alpha Vantage manquante",
        hint: "Ajoutez ALPHA_VANTAGE_KEY dans Vercel"
      }));
    }
    
    if (!ticker) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Paramètre ticker manquant" }));
    }
    
    // Cache 60 secondes
    const now = Date.now();
    const cached = cache[ticker];
    if (cached && now - cached.t < 60 * 1000) {
      res.statusCode = 200;
      return res.end(JSON.stringify({ ...cached.data, cached: true }));
    }
    
    // Endpoint GRATUIT : OVERVIEW (contient DividendPerShare et DividendYield)
    const overviewUrl = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(ticker)}&apikey=${API_KEY}`;
    
    const overviewResp = await fetch(overviewUrl);
    const overview = await overviewResp.json();
    
    // Gestion erreurs
    if (overview['Error Message']) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ 
        error: "Ticker invalide ou non trouvé",
        ticker: ticker
      }));
    }
    
    if (overview['Note']) {
      res.statusCode = 429;
      return res.end(JSON.stringify({ 
        error: "Limite API atteinte (25 calls/jour pour free tier)",
        note: overview['Note']
      }));
    }
    
    if (overview['Information']) {
      res.statusCode = 429;
      return res.end(JSON.stringify({ 
        error: "Endpoint premium requis ou rate limit",
        info: overview['Information']
      }));
    }
    
    // Vérifier si des données dividendes existent
    const dividendPerShare = parseFloat(overview['DividendPerShare'] || '0');
    const dividendYield = parseFloat(overview['DividendYield'] || '0');
    const exDividendDate = overview['ExDividendDate'] || null;
    const dividendDate = overview['DividendDate'] || null;
    
    if (dividendPerShare === 0 && dividendYield === 0) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ 
        error: "Aucun dividende trouvé pour ce ticker",
        ticker: ticker,
        hint: "Cette action ne verse peut-être pas de dividendes"
      }));
    }
    
    // Construire la réponse
    const payload = {
      ticker: ticker,
      source: "Alpha Vantage (Overview)",
      amount: dividendPerShare > 0 ? dividendPerShare : null,
      annualYield: dividendYield > 0 ? (dividendYield * 100).toFixed(2) + '%' : null,
      exDate: exDividendDate || null,
      paymentDate: dividendDate || estimatePaymentDate(exDividendDate),
      currency: guessCurrency(ticker),
      fetchedAt: new Date().toISOString(),
      note: "Données annuelles (DividendPerShare = dividende annuel total)"
    };
    
    // Mise en cache
    cache[ticker] = { t: now, data: payload };
    
    res.statusCode = 200;
    return res.end(JSON.stringify(payload));
    
  } catch (error) {
    console.error('Alpha Vantage API Error:', error);
    res.statusCode = 500;
    return res.end(JSON.stringify({ 
      error: "Erreur serveur",
      detail: String(error.message || error)
    }));
  }
};

// Helper: Estime payment date (~3 semaines après ex-date)
function estimatePaymentDate(exDate) {
  if (!exDate) return null;
  try {
    const date = new Date(exDate);
    date.setDate(date.getDate() + 21);
    return date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

// Helper: Devine la devise selon le suffixe du ticker
function guessCurrency(ticker) {
  const upper = ticker.toUpperCase();
  
  if (upper.endsWith('.CO') || upper.endsWith('.CSE')) return 'DKK';
  if (upper.endsWith('.ST') || upper.endsWith('.STO')) return 'SEK';
  if (upper.endsWith('.OL') || upper.endsWith('.OSE')) return 'NOK';
  if (upper.endsWith('.L') || upper.endsWith('.LON')) return 'GBP';
  if (upper.endsWith('.PA') || upper.endsWith('.PAR')) return 'EUR';
  if (upper.endsWith('.DE') || upper.endsWith('.F')) return 'EUR';
  if (upper.endsWith('.TO') || upper.endsWith('.TSX')) return 'CAD';
  if (upper.endsWith('.AX') || upper.endsWith('.ASX')) return 'AUD';
  
  return 'USD';
}
