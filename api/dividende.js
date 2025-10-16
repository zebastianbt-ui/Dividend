// api/dividende.js (Vercel Serverless Function)
// Place this file in: /api/dividende.js

const cache = {}; // Simple in-memory cache { TICKER: { t: timestamp, data: {...} } }

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    const API_KEY = process.env.ALPHA_VANTAGE_KEY || '';
    const raw = (req.query && req.query.ticker) ? String(req.query.ticker) : '';
    const ticker = raw.trim().toUpperCase();
    
    // Validation
    if (!API_KEY) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ 
        error: "Clé API Alpha Vantage manquante",
        hint: "Ajoutez ALPHA_VANTAGE_KEY dans vos variables d'environnement Vercel"
      }));
    }
    
    if (!ticker) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Paramètre ticker manquant" }));
    }
    
    // Cache 60 secondes pour éviter les rate limits
    const now = Date.now();
    const cached = cache[ticker];
    if (cached && now - cached.t < 60 * 1000) {
      res.statusCode = 200;
      return res.end(JSON.stringify({ ...cached.data, cached: true }));
    }
    
    // Appel API Alpha Vantage - TIME_SERIES_DAILY_ADJUSTED pour avoir les dividendes
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(ticker)}&outputsize=compact&apikey=${API_KEY}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    // Gestion des erreurs Alpha Vantage
    if (data['Error Message']) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ 
        error: "Ticker invalide ou non trouvé",
        ticker: ticker,
        detail: data['Error Message']
      }));
    }
    
    if (data['Note']) {
      res.statusCode = 429;
      return res.end(JSON.stringify({ 
        error: "Limite API atteinte (5 calls/min pour free tier)",
        note: data['Note']
      }));
    }
    
    // Extraction des données
    const timeSeries = data['Time Series (Daily)'];
    
    if (!timeSeries) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ 
        error: "Aucune donnée disponible pour ce ticker",
        ticker: ticker
      }));
    }
    
    // Cherche le dernier dividende (non-zero)
    const dates = Object.keys(timeSeries).sort().reverse();
    let lastDividend = null;
    
    for (const date of dates) {
      const dayData = timeSeries[date];
      const divAmount = parseFloat(dayData['7. dividend amount']);
      
      if (divAmount > 0) {
        lastDividend = {
          ticker: ticker,
          source: "Alpha Vantage",
          amount: divAmount,
          exDate: date,
          paymentDate: estimatePaymentDate(date),
          currency: guessCurrency(ticker),
          fetchedAt: new Date().toISOString()
        };
        break;
      }
    }
    
    if (!lastDividend) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ 
        error: "Aucun dividende récent trouvé pour ce ticker",
        ticker: ticker
      }));
    }
    
    // Mise en cache
    cache[ticker] = { t: now, data: lastDividend };
    
    res.statusCode = 200;
    return res.end(JSON.stringify(lastDividend));
    
  } catch (error) {
    console.error('Alpha Vantage API Error:', error);
    res.statusCode = 500;
    return res.end(JSON.stringify({ 
      error: "Erreur serveur",
      detail: String(error.message || error)
    }));
  }
};

// Helper: Estime la payment date (~3 semaines après ex-date)
function estimatePaymentDate(exDate) {
  const date = new Date(exDate);
  date.setDate(date.getDate() + 21);
  return date.toISOString().split('T')[0];
}

// Helper: Devine la devise selon le suffixe du ticker
function guessCurrency(ticker) {
  const upper = ticker.toUpperCase();
  
  if (upper.endsWith('.CO') || upper.endsWith('.CSE')) return 'DKK'; // Copenhagen
  if (upper.endsWith('.ST') || upper.endsWith('.STO')) return 'SEK'; // Stockholm
  if (upper.endsWith('.OL') || upper.endsWith('.OSE')) return 'NOK'; // Oslo
  if (upper.endsWith('.L') || upper.endsWith('.LON')) return 'GBP'; // London
  if (upper.endsWith('.PA') || upper.endsWith('.PAR')) return 'EUR'; // Paris
  if (upper.endsWith('.DE') || upper.endsWith('.F')) return 'EUR';   // Germany
  if (upper.endsWith('.TO') || upper.endsWith('.TSX')) return 'CAD'; // Toronto
  if (upper.endsWith('.AX') || upper.endsWith('.ASX')) return 'AUD'; // Australia
  
  return 'USD'; // Par défaut pour les actions US
}
